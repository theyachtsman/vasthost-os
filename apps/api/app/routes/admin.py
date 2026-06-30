"""Admin console — a fully separate surface (Part 3).

Its own login, its own cookie scope, unreachable from a regular user session.
Holds the platform provider keys (which drive ONLY the public Observer) and
Observer health. Never decrypts or displays a user's personal key.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from core.config import settings
from core.crypto import decrypt, encrypt, mask
from core.security import verify_password
from db.session import get_db
from models import (
    AdminUser,
    ClearingEvent,
    OfferSnapshot,
    PlatformProviderKey,
    WatchedClass,
)
from schemas.auth import (
    AdminLoginRequest,
    AdminObserverStatus,
    AdminOut,
    PlatformKeyIn,
    PlatformKeyOut,
    WatchedClassBrief,
)
from services import auth as auth_svc
from services.observer import POLL_INTERVAL_SECONDS
from services.vast_client import VastClient, VastClientError

from ..deps import clear_session_cookie, require_admin_session, set_session_cookie

logger = logging.getLogger("gpuiq.admin")
router = APIRouter()

VALID_PROVIDERS = {"vast", "runpod"}


# ── Admin auth ─────────────────────────────────────────────────
@router.post("/auth/login", response_model=AdminOut)
def admin_login(
    payload: AdminLoginRequest, response: Response, db: DbSession = Depends(get_db)
) -> AdminOut:
    admin = db.scalar(select(AdminUser).where(AdminUser.email == payload.email))
    if admin is None or not verify_password(payload.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = auth_svc.create_admin_session(db, admin.id)
    set_session_cookie(response, token, admin=True)
    return AdminOut.model_validate(admin)


@router.post("/auth/logout")
def admin_logout(request: Request, response: Response, db: DbSession = Depends(get_db)) -> dict:
    token = request.cookies.get(settings.ADMIN_SESSION_COOKIE_NAME)
    auth_svc.destroy_admin_session(db, token)
    clear_session_cookie(response, admin=True)
    return {"ok": True}


@router.get("/auth/me", response_model=AdminOut)
def admin_me(admin: AdminUser = Depends(require_admin_session)) -> AdminOut:
    return AdminOut.model_validate(admin)


# ── Platform keys ──────────────────────────────────────────────
def _key_out(key: PlatformProviderKey) -> PlatformKeyOut:
    masked = None
    try:
        masked = mask(decrypt(key.encrypted_api_key))
    except Exception:  # noqa: BLE001
        masked = None
    return PlatformKeyOut(
        id=key.id,
        provider=key.provider,
        is_active=key.is_active,
        api_key_masked=masked,
        last_validated_at=key.last_validated_at,
        created_at=key.created_at,
    )


@router.get("/platform-keys", response_model=list[PlatformKeyOut])
def list_platform_keys(
    admin: AdminUser = Depends(require_admin_session), db: DbSession = Depends(get_db)
) -> list[PlatformKeyOut]:
    keys = db.scalars(select(PlatformProviderKey).order_by(PlatformProviderKey.provider))
    return [_key_out(k) for k in keys]


@router.post("/platform-keys", response_model=PlatformKeyOut)
def set_platform_key(
    payload: PlatformKeyIn,
    admin: AdminUser = Depends(require_admin_session),
    db: DbSession = Depends(get_db),
) -> PlatformKeyOut:
    if payload.provider not in VALID_PROVIDERS:
        raise HTTPException(status_code=400, detail="Unknown provider")

    validated_at = None
    if payload.provider == "vast":
        # Validate the platform key with a read-only call before storing it.
        try:
            VastClient(payload.api_key).show_user()
        except VastClientError as exc:
            raise HTTPException(status_code=400, detail=f"Vast rejected the key: {exc}") from exc
        validated_at = datetime.now(UTC)
    # RunPod: scaffolding only — stored encrypted, never validated or polled yet.

    key = db.scalar(
        select(PlatformProviderKey).where(PlatformProviderKey.provider == payload.provider)
    )
    if key is None:
        key = PlatformProviderKey(provider=payload.provider)
        db.add(key)
    key.encrypted_api_key = encrypt(payload.api_key)
    key.is_active = True
    key.added_by_admin_id = admin.id
    key.last_validated_at = validated_at
    db.commit()
    db.refresh(key)
    return _key_out(key)


@router.delete("/platform-keys/{key_id}")
def delete_platform_key(
    key_id: uuid.UUID,
    admin: AdminUser = Depends(require_admin_session),
    db: DbSession = Depends(get_db),
) -> dict:
    key = db.get(PlatformProviderKey, key_id)
    if key is None:
        raise HTTPException(status_code=404, detail="Platform key not found")
    db.delete(key)
    db.commit()
    return {"deleted": True}


# ── Observer health ────────────────────────────────────────────
@router.get("/observer/status", response_model=AdminObserverStatus)
def observer_status(
    admin: AdminUser = Depends(require_admin_session), db: DbSession = Depends(get_db)
) -> AdminObserverStatus:
    platform = db.scalar(
        select(PlatformProviderKey).where(
            PlatformProviderKey.provider == "vast",
            PlatformProviderKey.is_active.is_(True),
        )
    )
    last_poll = db.scalar(select(func.max(OfferSnapshot.observed_at)))
    total_snaps = db.scalar(select(func.count(OfferSnapshot.id))) or 0
    total_events = db.scalar(select(func.count(ClearingEvent.id))) or 0
    watched = list(
        db.scalars(
            select(WatchedClass)
            .where(WatchedClass.is_active.is_(True))
            .order_by(WatchedClass.gpu_name, WatchedClass.num_gpus)
        )
    )
    return AdminObserverStatus(
        platform_key_connected=platform is not None,
        platform_key_provider=platform.provider if platform else None,
        platform_key_last_validated_at=platform.last_validated_at if platform else None,
        last_poll_at=last_poll,
        total_offer_snapshots=total_snaps,
        total_clearing_events=total_events,
        watched_classes_count=len(watched),
        poll_interval_seconds=POLL_INTERVAL_SECONDS,
        watched_classes=[
            WatchedClassBrief(gpu_name=w.gpu_name, num_gpus=w.num_gpus) for w in watched
        ],
    )
