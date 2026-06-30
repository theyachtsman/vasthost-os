"""User-owned provider keys (Part 7: /me/provider-keys), user-session-gated.

Returns masked metadata only — never key plaintext after the initial save.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from core.crypto import decrypt, mask
from db.session import get_db
from models import User, UserProviderKey
from schemas.auth import UserProviderKeyIn, UserProviderKeyOut
from services import provider_keys as pk_svc
from services.vast_client import VastClientError

from ..deps import require_user_session

logger = logging.getLogger("gpuiq.me.keys")
router = APIRouter()


def _to_out(key: UserProviderKey) -> UserProviderKeyOut:
    masked = None
    try:
        masked = mask(decrypt(key.encrypted_api_key))
    except Exception:  # noqa: BLE001 — never leak; show nothing if undecryptable
        masked = None
    return UserProviderKeyOut(
        id=key.id,
        provider=key.provider,
        is_active=key.is_active,
        api_key_masked=masked,
        vast_user_id=key.vast_user_id,
        detected_scopes=key.detected_scopes,
        last_validated_at=key.last_validated_at,
        last_synced_at=key.last_synced_at,
        created_at=key.created_at,
    )


@router.get("/provider-keys", response_model=list[UserProviderKeyOut])
def list_keys(
    user: User = Depends(require_user_session), db: DbSession = Depends(get_db)
) -> list[UserProviderKeyOut]:
    keys = db.scalars(
        select(UserProviderKey).where(UserProviderKey.user_id == user.id)
    )
    return [_to_out(k) for k in keys]


@router.post("/provider-keys", response_model=UserProviderKeyOut)
def connect_key(
    payload: UserProviderKeyIn,
    background: BackgroundTasks,
    user: User = Depends(require_user_session),
    db: DbSession = Depends(get_db),
) -> UserProviderKeyOut:
    try:
        key = pk_svc.connect_user_key(db, user, payload.provider, payload.api_key)
    except VastClientError as exc:
        raise HTTPException(status_code=400, detail=f"Vast rejected the key: {exc}") from exc

    # Kick the initial sync so the user's machines/earnings appear within ~60s.
    from .fleet import run_initial_sync_for_key

    background.add_task(run_initial_sync_for_key, key.id)
    return _to_out(key)


@router.delete("/provider-keys/{key_id}")
def disconnect_key(
    key_id: uuid.UUID,
    user: User = Depends(require_user_session),
    db: DbSession = Depends(get_db),
) -> dict:
    ok = pk_svc.disconnect_user_key(db, user, key_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Key not found")
    return {"disconnected": True}
