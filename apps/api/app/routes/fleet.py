import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from db.session import get_db
from models import HostMachine, ReliabilityHistory, RentalContract
from schemas.models import (
    ContractOut,
    MachineDetail,
    MachineOut,
    ReliabilityPointOut,
)

router = APIRouter()


@router.get("/machines", response_model=list[MachineOut])
def list_machines(db: Session = Depends(get_db)) -> list[MachineOut]:
    machines = db.scalars(select(HostMachine).order_by(HostMachine.machine_id))
    return [MachineOut.model_validate(m) for m in machines]


@router.get("/machines/{machine_id}", response_model=MachineDetail)
def get_machine(machine_id: uuid.UUID, db: Session = Depends(get_db)) -> MachineDetail:
    machine = db.get(HostMachine, machine_id)
    if machine is None:
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
