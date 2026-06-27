import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.session import get_db
from models import SimulatedHost
from schemas.models import SimulatedHostIn, SimulatedHostOut
from services.calc import break_even_floor_per_gpu_hour

router = APIRouter()


def _to_out(host: SimulatedHost) -> SimulatedHostOut:
    out = SimulatedHostOut.model_validate(host)
    out.break_even_floor = break_even_floor_per_gpu_hour(
        host.gpu_max_power_w,
        float(host.kwh_rate) if host.kwh_rate is not None else None,
        float(host.vast_service_fee_pct) if host.vast_service_fee_pct is not None else 0.20,
    )
    return out


@router.get("/hosts", response_model=list[SimulatedHostOut])
def list_hosts(db: Session = Depends(get_db)) -> list[SimulatedHostOut]:
    rows = db.scalars(select(SimulatedHost).order_by(SimulatedHost.created_at.desc()))
    return [_to_out(h) for h in rows]


@router.post("/hosts", response_model=SimulatedHostOut)
def create_host(payload: SimulatedHostIn, db: Session = Depends(get_db)) -> SimulatedHostOut:
    host = SimulatedHost(**payload.model_dump())
    db.add(host)
    db.commit()
    db.refresh(host)
    return _to_out(host)


@router.put("/hosts/{host_id}", response_model=SimulatedHostOut)
def update_host(
    host_id: uuid.UUID, payload: SimulatedHostIn, db: Session = Depends(get_db)
) -> SimulatedHostOut:
    host = db.get(SimulatedHost, host_id)
    if host is None:
        raise HTTPException(status_code=404, detail="Simulated host not found")
    for key, value in payload.model_dump().items():
        setattr(host, key, value)
    db.commit()
    db.refresh(host)
    return _to_out(host)


@router.delete("/hosts/{host_id}")
def delete_host(host_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    host = db.get(SimulatedHost, host_id)
    if host is None:
        raise HTTPException(status_code=404, detail="Simulated host not found")
    db.delete(host)
    db.commit()
    return {"deleted": True}
