"""Pricing Control Center — recommend-only (Phase 1).

User-session-gated and scoped to the caller's own machines. The first surface that
WRITES to the live marketplace with the user's key, so every apply is:
  * re-validated server-side against the break-even floor (client is never trusted),
  * a read-modify-write (never clobbers disk/bandwidth pricing),
  * recorded as a PriceChangeEvent AND a KeyAccessAudit (success or failure).
Nothing is written without an explicit per-machine apply.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.crypto import decrypt
from db.session import get_db
from models import CostConfig, HostMachine, PriceChangeEvent, User, UserProviderKey
from schemas.models import (
    BulkApplyIn,
    BulkApplyResult,
    BulkApplyResultItem,
    PriceApplyIn,
    PriceChangeEventOut,
    PricingRecommendation,
)
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


@dataclass
class _ApplyResult:
    status: str  # applied | skipped_floor | failed
    event: PriceChangeEvent | None
    detail: str | None
    http_status: int | None = None


def _apply_price_to_machine(
    db: Session, user: User, machine: HostMachine, new_price_gpu: float, reason: str
) -> _ApplyResult:
    """The single-machine apply, extracted so /apply and /bulk-apply share one
    code path — every write is still re-validated against the break-even floor
    server-side, still a read-modify-write to Vast, still audited. Never
    raises: callers decide how to surface a non-'applied' status (the single
    route turns it into an HTTPException; bulk-apply just records it and moves
    on to the next machine)."""
    cost = db.scalar(select(CostConfig).where(CostConfig.machine_id == machine.id))
    reco = pricing_svc.recommend_for_machine(db, machine, cost)
    if reco.break_even_floor is not None and new_price_gpu < reco.break_even_floor:
        return _ApplyResult(
            "skipped_floor",
            None,
            f"Price ${new_price_gpu:.4f} is below your break-even floor "
            f"${reco.break_even_floor:.4f}/GPU·hr.",
            http_status=400,
        )

    key = db.get(UserProviderKey, machine.user_provider_key_id) if machine.user_provider_key_id else None
    if key is None or not key.is_active or key.user_id != user.id:
        return _ApplyResult("failed", None, "No active key owns this machine.", http_status=409)

    old_price = float(machine.current_price_gpu) if machine.current_price_gpu is not None else None
    now = datetime.now(UTC)

    try:
        client = VastClient(decrypt(key.encrypted_api_key))
        client.set_machine_price(machine.machine_id, new_price_gpu)
    except Exception as exc:  # noqa: BLE001 — record every failure, then surface it
        event = PriceChangeEvent(
            machine_id=machine.id,
            old_price_gpu=old_price,
            new_price_gpu=new_price_gpu,
            reason=reason,
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
            return _ApplyResult(
                "failed", event,
                "Vast rejected the price write — your key likely lacks the "
                "machine-write/pricing scope. Reconnect it in Settings with that "
                "permission granted.",
                http_status=403,
            )
        return _ApplyResult("failed", event, "Price write to Vast failed.", http_status=502)

    event = PriceChangeEvent(
        machine_id=machine.id,
        old_price_gpu=old_price,
        new_price_gpu=new_price_gpu,
        reason=reason,
        market_dist_id=reco.market_dist_id,
        market_percentile=reco.current_percentile,
        applied_to_vast=True,
        applied_at=now,
    )
    db.add(event)
    machine.current_price_gpu = new_price_gpu
    db.commit()
    db.refresh(event)
    audit(db, user_id=user.id, provider=key.provider, action="price_write", success=True)
    return _ApplyResult("applied", event, None)


@router.post("/apply", response_model=PriceChangeEventOut)
def apply(
    payload: PriceApplyIn,
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> PriceChangeEventOut:
    machine = _owned_machine(db, user, payload.machine_id)
    result = _apply_price_to_machine(db, user, machine, payload.new_price_gpu, payload.reason)
    if result.status != "applied":
        raise HTTPException(status_code=result.http_status, detail=result.detail)
    return PriceChangeEventOut.model_validate(result.event)


@router.post("/bulk-apply", response_model=BulkApplyResult)
def bulk_apply(
    payload: BulkApplyIn,
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> BulkApplyResult:
    """Apply each selected machine's own current recommended price in one pass
    — the same recommendation Pricing Control shows for that machine, same
    safety rails (break-even floor, key ownership), just batched. One
    machine's failure never blocks the rest."""
    key_ids = _user_key_ids(db, user)
    items: list[BulkApplyResultItem] = []
    applied = skipped = failed = 0

    for machine_id in payload.machine_ids:
        machine = db.get(HostMachine, machine_id)
        if machine is None or machine.user_provider_key_id not in key_ids:
            items.append(
                BulkApplyResultItem(
                    id=machine_id, label="unknown machine", status="failed",
                    old_price_gpu=None, new_price_gpu=None, detail="Machine not found",
                )
            )
            failed += 1
            continue

        label = f"{machine.gpu_name or 'GPU'} ×{machine.num_gpus or '?'} · machine {machine.machine_id}"
        cost = db.scalar(select(CostConfig).where(CostConfig.machine_id == machine.id))
        reco = pricing_svc.recommend_for_machine(db, machine, cost)
        if not reco.has_market_data or reco.recommended_price_gpu is None:
            items.append(
                BulkApplyResultItem(
                    id=machine_id, label=label, status="skipped_no_market",
                    old_price_gpu=reco.current_price_gpu, new_price_gpu=None,
                    detail="No market data yet for this GPU class.",
                )
            )
            skipped += 1
            continue

        result = _apply_price_to_machine(
            db, user, machine, reco.recommended_price_gpu, "bulk_recommend_applied"
        )
        if result.status == "applied":
            applied += 1
        elif result.status == "skipped_floor":
            skipped += 1
        else:
            failed += 1
        items.append(
            BulkApplyResultItem(
                id=machine_id, label=label, status=result.status,
                old_price_gpu=reco.current_price_gpu,
                new_price_gpu=reco.recommended_price_gpu if result.status == "applied" else None,
                detail=result.detail,
            )
        )

    return BulkApplyResult(applied=applied, skipped=skipped, failed=failed, items=items)


def _owned_machine(db: Session, user: User, machine_id: uuid.UUID) -> HostMachine:
    key_ids = _user_key_ids(db, user)
    machine = db.get(HostMachine, machine_id)
    if machine is None or machine.user_provider_key_id not in key_ids:
        raise HTTPException(status_code=404, detail="Machine not found")
    return machine
