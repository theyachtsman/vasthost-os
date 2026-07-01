"""Earnings & financials — user-session-gated, scoped to the caller's key(s)."""

import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from db.session import get_db
from models import (
    AccountSnapshot,
    CostConfig,
    EarningsDaily,
    HostMachine,
    RentalContract,
    User,
    UserProviderKey,
)
from schemas.models import (
    CostConfigIn,
    CostConfigOut,
    DailyEarningPoint,
    EarningsSummary,
    PerMachineEarning,
)
from services.calc import est_power_cost_per_day

from ..deps import require_user_session

router = APIRouter()


def _user_key_ids(db: Session, user: User) -> list[uuid.UUID]:
    return list(
        db.scalars(select(UserProviderKey.id).where(UserProviderKey.user_id == user.id))
    )


@router.get("/summary", response_model=EarningsSummary)
def summary(
    user: User = Depends(require_user_session), db: Session = Depends(get_db)
) -> EarningsSummary:
    key_ids = _user_key_ids(db, user)
    if not key_ids:
        raise HTTPException(status_code=404, detail="No provider key connected")

    month_start = date.today().replace(day=1)

    machines = list(
        db.scalars(
            select(HostMachine).where(HostMachine.user_provider_key_id.in_(key_ids))
        )
    )
    machine_ids = [m.id for m in machines]
    cost_by_machine = {
        c.machine_id: c
        for c in (
            db.scalars(select(CostConfig).where(CostConfig.machine_id.in_(machine_ids)))
            if machine_ids
            else []
        )
    }

    per_machine: list[PerMachineEarning] = []
    for m in machines:
        row = db.execute(
            select(
                func.coalesce(func.sum(EarningsDaily.gpu_earn), 0),
                func.coalesce(func.sum(EarningsDaily.storage_earn), 0),
                func.coalesce(
                    func.sum(EarningsDaily.bw_upload_earn + EarningsDaily.bw_download_earn), 0
                ),
            ).where(
                EarningsDaily.machine_id == m.id,
                EarningsDaily.earn_date >= month_start,
            )
        ).one()
        gpu_e, sto_e, bw_e = float(row[0]), float(row[1]), float(row[2])
        total = gpu_e + sto_e + bw_e

        cost = cost_by_machine.get(m.id)
        est_cost = None
        net = None
        if cost and cost.kwh_rate is not None:
            active = db.scalar(
                select(func.count(RentalContract.id)).where(
                    RentalContract.machine_id == m.id, RentalContract.status == "active"
                )
            )
            util = 1.0 if active else 0.0
            days = (date.today() - month_start).days + 1
            per_day = est_power_cost_per_day(
                m.gpu_max_power_w, m.num_gpus, float(cost.kwh_rate), util
            )
            if per_day is not None:
                est_cost = round(per_day * days, 4)
                net = round(total - est_cost, 4)

        per_machine.append(
            PerMachineEarning(
                machine_id=m.id,
                vast_machine_id=m.machine_id,
                gpu_name=m.gpu_name,
                gpu_earn=round(gpu_e, 6),
                storage_earn=round(sto_e, 6),
                bw_earn=round(bw_e, 6),
                total_earn=round(total, 6),
                est_power_cost=est_cost,
                net_margin=net,
            )
        )

    totals = db.execute(
        select(
            func.coalesce(func.sum(EarningsDaily.gpu_earn), 0),
            func.coalesce(func.sum(EarningsDaily.storage_earn), 0),
            func.coalesce(
                func.sum(EarningsDaily.bw_upload_earn + EarningsDaily.bw_download_earn), 0
            ),
        ).where(
            EarningsDaily.user_provider_key_id.in_(key_ids),
            EarningsDaily.earn_date >= month_start,
        )
    ).one()

    all_time = db.scalar(
        select(func.coalesce(func.sum(EarningsDaily.total_earn), 0)).where(
            EarningsDaily.user_provider_key_id.in_(key_ids)
        )
    )

    latest_snap = db.scalar(
        select(AccountSnapshot)
        .where(AccountSnapshot.user_provider_key_id.in_(key_ids))
        .order_by(AccountSnapshot.recorded_at.desc())
    )

    return EarningsSummary(
        total_gpu=round(float(totals[0]), 6),
        total_storage=round(float(totals[1]), 6),
        total_bw=round(float(totals[2]), 6),
        total_all=round(float(totals[0]) + float(totals[1]) + float(totals[2]), 6),
        service_fee=(
            float(latest_snap.service_fee)
            if latest_snap and latest_snap.service_fee
            else None
        ),
        balance=(
            float(latest_snap.balance) if latest_snap and latest_snap.balance is not None else None
        ),
        all_time_total=round(float(all_time or 0), 6),
        per_machine=per_machine,
    )


@router.get("/daily", response_model=list[DailyEarningPoint])
def daily(
    days: int = Query(30, ge=1, le=365),
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> list[DailyEarningPoint]:
    key_ids = _user_key_ids(db, user)
    if not key_ids:
        raise HTTPException(status_code=404, detail="No provider key connected")

    since = date.today() - timedelta(days=days)
    rows = db.execute(
        select(
            EarningsDaily.earn_date,
            func.sum(EarningsDaily.gpu_earn),
            func.sum(EarningsDaily.storage_earn),
            func.sum(EarningsDaily.bw_upload_earn + EarningsDaily.bw_download_earn),
        )
        .where(
            EarningsDaily.user_provider_key_id.in_(key_ids),
            EarningsDaily.earn_date >= since,
        )
        .group_by(EarningsDaily.earn_date)
        .order_by(EarningsDaily.earn_date)
    ).all()

    out = []
    for r in rows:
        gpu_e = float(r[1] or 0)
        sto_e = float(r[2] or 0)
        bw_e = float(r[3] or 0)
        out.append(
            DailyEarningPoint(
                earn_date=r[0],
                gpu_earn=round(gpu_e, 6),
                storage_earn=round(sto_e, 6),
                bw_earn=round(bw_e, 6),
                total_earn=round(gpu_e + sto_e + bw_e, 6),
            )
        )
    return out


@router.post("/cost-config", response_model=CostConfigOut)
def set_cost_config(
    payload: CostConfigIn,
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> CostConfigOut:
    key_ids = _user_key_ids(db, user)
    machine = db.get(HostMachine, payload.machine_id)
    if machine is None or machine.user_provider_key_id not in key_ids:
        raise HTTPException(status_code=404, detail="Machine not found")

    if payload.gpu_max_power_w is not None:
        machine.gpu_max_power_w = payload.gpu_max_power_w

    cfg = db.scalar(select(CostConfig).where(CostConfig.machine_id == payload.machine_id))
    if cfg is None:
        cfg = CostConfig(machine_id=payload.machine_id)
        db.add(cfg)
    cfg.kwh_rate = payload.kwh_rate
    db.commit()
    db.refresh(cfg)
    return CostConfigOut.model_validate(cfg)
