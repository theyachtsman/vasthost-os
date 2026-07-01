"""Pricing Control Center — recommend-only (Phase 1).

User-session-gated and scoped to the caller's own machines. The first surface that
WRITES to the live marketplace with the user's key, so every apply is:
  * re-validated server-side against the break-even floor (client is never trusted),
  * a read-modify-write (never clobbers disk/bandwidth pricing),
  * recorded as a PriceChangeEvent AND a KeyAccessAudit (success or failure).
Nothing is written without an explicit per-machine apply.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.crypto import decrypt
from db.session import get_db
from models import CostConfig, HostMachine, PriceChangeEvent, User, UserProviderKey
from schemas.models import PriceApplyIn, PriceChangeEventOut, PricingRecommendation
from services import pricing as pricing_svc
from services.provider_keys import audit
from services.vast_client import VastClient, VastClientError

from ..deps import require_user_session

router = APIRouter()


def _user_key_ids(db: Session, user: User) -> list[uuid.UUID]:
    return list(
        db.scalars(select(UserProviderKey.id).where(UserProviderKey.user_id == user.id))
    )


def _looks_like_scope_failure(exc: Exception) -> bool:
    text = str(exc).lower()
    return any(
        s in text
        for s in ("401", "403", "unauthorized", "forbidden", "permission", "scope", "invalid api key")
    )


@router.get("/recommendations", response_model=list[PricingRecommendation])
def recommendations(
    user: User = Depends(require_user_session), db: Session = Depends(get_db)
) -> list[PricingRecommendation]:
    key_ids = _user_key_ids(db, user)
    if not key_ids:
        raise HTTPException(status_code=404, detail="No provider key connected")
    return pricing_svc.recommendations_for_keys(db, key_ids)


@router.get("/history", response_model=list[PriceChangeEventOut])
def history(
    machine_id: uuid.UUID = Query(...),
    limit: int = Query(20, ge=1, le=200),
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> list[PriceChangeEventOut]:
    machine = _owned_machine(db, user, machine_id)
    rows = db.scalars(
        select(PriceChangeEvent)
        .where(PriceChangeEvent.machine_id == machine.id)
        .order_by(PriceChangeEvent.changed_at.desc())
        .limit(limit)
    )
    return [PriceChangeEventOut.model_validate(r) for r in rows]


@router.post("/apply", response_model=PriceChangeEventOut)
def apply(
    payload: PriceApplyIn,
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> PriceChangeEventOut:
    machine = _owned_machine(db, user, payload.machine_id)

    # Re-derive the market context + break-even floor server-side; never trust the
    # client's number. Enforce the floor as a hard minimum.
    cost = db.scalar(select(CostConfig).where(CostConfig.machine_id == machine.id))
    reco = pricing_svc.recommend_for_machine(db, machine, cost)
    if reco.break_even_floor is not None and payload.new_price_gpu < reco.break_even_floor:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Price ${payload.new_price_gpu:.4f} is below your break-even floor "
                f"${reco.break_even_floor:.4f}/GPU·hr."
            ),
        )

    key = db.get(UserProviderKey, machine.user_provider_key_id) if machine.user_provider_key_id else None
    if key is None or not key.is_active or key.user_id != user.id:
        raise HTTPException(status_code=409, detail="No active key owns this machine.")

    old_price = float(machine.current_price_gpu) if machine.current_price_gpu is not None else None
    now = datetime.now(UTC)
    event = PriceChangeEvent(
        machine_id=machine.id,
        old_price_gpu=old_price,
        new_price_gpu=payload.new_price_gpu,
        reason=payload.reason,
        market_dist_id=reco.market_dist_id,
        market_percentile=reco.current_percentile,
        applied_to_vast=False,
    )
    db.add(event)

    try:
        client = VastClient(decrypt(key.encrypted_api_key))
        client.set_machine_price(machine.machine_id, payload.new_price_gpu)
    except Exception as exc:  # noqa: BLE001 — record every failure, then surface it
        db.rollback()
        # Re-add the event on a fresh transaction so the failure is auditable.
        event = PriceChangeEvent(
            machine_id=machine.id,
            old_price_gpu=old_price,
            new_price_gpu=payload.new_price_gpu,
            reason=payload.reason,
            market_dist_id=reco.market_dist_id,
            market_percentile=reco.current_percentile,
            applied_to_vast=False,
            error_message=str(exc)[:1000],
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        audit(db, user_id=user.id, provider=key.provider, action="price_write",
              success=False, error_message=str(exc)[:300])
        if _looks_like_scope_failure(exc) or isinstance(exc, VastClientError):
            raise HTTPException(
                status_code=403,
                detail=(
                    "Vast rejected the price write — your key likely lacks the "
                    "machine-write/pricing scope. Reconnect it in Settings with that "
                    "permission granted."
                ),
            ) from None
        raise HTTPException(status_code=502, detail="Price write to Vast failed.") from None

    event.applied_to_vast = True
    event.applied_at = now
    machine.current_price_gpu = payload.new_price_gpu
    db.commit()
    db.refresh(event)
    audit(db, user_id=user.id, provider=key.provider, action="price_write", success=True)
    return PriceChangeEventOut.model_validate(event)


def _owned_machine(db: Session, user: User, machine_id: uuid.UUID) -> HostMachine:
    key_ids = _user_key_ids(db, user)
    machine = db.get(HostMachine, machine_id)
    if machine is None or machine.user_provider_key_id not in key_ids:
        raise HTTPException(status_code=404, detail="Machine not found")
    return machine
