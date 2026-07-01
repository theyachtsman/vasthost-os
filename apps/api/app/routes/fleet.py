"""Fleet — user-session-gated, scoped to the caller's own provider key(s).

Query-level scoping (not just UI): every read filters on the caller's
``user_provider_keys`` ids, so a second user can never see another user's
machines even by guessing an id.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from db.session import get_db
from models import HostMachine, ReliabilityHistory, RentalContract, User, UserProviderKey
from schemas.models import (
    ContractOut,
    MachineDetail,
    MachineOut,
    ReliabilityPointOut,
)

from ..deps import require_user_session

router = APIRouter()


def _user_key_ids(db: Session, user: User) -> list[uuid.UUID]:
    return list(
        db.scalars(select(UserProviderKey.id).where(UserProviderKey.user_id == user.id))
    )


@router.get("/machines", response_model=list[MachineOut])
def list_machines(
    user: User = Depends(require_user_session), db: Session = Depends(get_db)
) -> list[MachineOut]:
    key_ids = _user_key_ids(db, user)
    if not key_ids:
        return []
    machines = db.scalars(
        select(HostMachine)
        .where(HostMachine.user_provider_key_id.in_(key_ids))
        .order_by(HostMachine.machine_id)
    )
    return [MachineOut.model_validate(m) for m in machines]


@router.get("/machines/{machine_id}", response_model=MachineDetail)
def get_machine(
    machine_id: uuid.UUID,
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> MachineDetail:
    key_ids = _user_key_ids(db, user)
    machine = db.get(HostMachine, machine_id)
    if machine is None or machine.user_provider_key_id not in key_ids:
        raise HTTPException(status_code=404, detail="Machine not found")

    contracts = db.scalars(
        select(RentalContract)
        .where(RentalContract.machine_id == machine_id)
        .order_by(desc(RentalContract.rented_at))
        .limit(50)
    )
    history = db.scalars(
        select(ReliabilityHistory)
        .where(ReliabilityHistory.machine_id == machine_id)
        .order_by(desc(ReliabilityHistory.recorded_at))
        .limit(100)
    )

    detail = MachineDetail.model_validate(machine)
    detail.contracts = [ContractOut.model_validate(c) for c in contracts]
    detail.reliability_history = [ReliabilityPointOut.model_validate(h) for h in history]
    return detail


def run_initial_sync_for_key(key_id: uuid.UUID) -> None:
    """Run fleet + earnings sync inline for a just-connected key (background task),
    so the user's machines/earnings appear within ~60s of connecting."""
    import logging

    from db.session import SessionLocal
    from services.sync import earnings_sync, fleet_sync

    logger = logging.getLogger("gpuiq.fleet")
    db = SessionLocal()
    try:
        key = db.get(UserProviderKey, key_id)
        if key is None or not key.is_active:
            return
        try:
            fleet_sync(db, key)
        except Exception as exc:  # noqa: BLE001
            logger.error("initial fleet_sync failed: %s", exc)
            db.rollback()
        try:
            earnings_sync(db, key)
        except Exception as exc:  # noqa: BLE001
            logger.error("initial earnings_sync failed: %s", exc)
            db.rollback()
    finally:
        db.close()
