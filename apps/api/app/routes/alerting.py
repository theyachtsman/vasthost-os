"""Alerting — configurable per-user thresholds across real + simulated rigs.

Settings are global per user (see services/alerting.py). Two read endpoints
mirror the rest of the app's real/simulated split: the frontend decides which
to show based on whether the user has any real machines, same fallback
pattern as Earnings/Fleet/Pricing/Offers.
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.session import get_db
from models import HostMachine, SimulatedHost, User, UserProviderKey
from schemas.models import AlertSettingsIn, AlertSettingsOut, RigAlertOut
from services import alerting as alerting_svc

from ..deps import require_user_session

router = APIRouter()


def _user_key_ids(db: Session, user: User) -> list[uuid.UUID]:
    return list(
        db.scalars(select(UserProviderKey.id).where(UserProviderKey.user_id == user.id))
    )


@router.get("/settings", response_model=AlertSettingsOut)
def get_settings(
    user: User = Depends(require_user_session), db: Session = Depends(get_db)
) -> AlertSettingsOut:
    settings = alerting_svc.get_or_create_settings(db, user.id)
    return AlertSettingsOut.model_validate(settings)


@router.put("/settings", response_model=AlertSettingsOut)
def update_settings(
    payload: AlertSettingsIn,
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> AlertSettingsOut:
    settings = alerting_svc.get_or_create_settings(db, user.id)
    for key, value in payload.model_dump().items():
        setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return AlertSettingsOut.model_validate(settings)


@router.get("/machines", response_model=list[RigAlertOut])
def machine_alerts(
    user: User = Depends(require_user_session), db: Session = Depends(get_db)
) -> list[RigAlertOut]:
    key_ids = _user_key_ids(db, user)
    machines = (
        list(
            db.scalars(
                select(HostMachine).where(HostMachine.user_provider_key_id.in_(key_ids))
            )
        )
        if key_ids
        else []
    )
    settings = alerting_svc.get_or_create_settings(db, user.id)
    return [
        RigAlertOut(**vars(a)) for a in alerting_svc.alerts_for_machines(db, machines, settings)
    ]


@router.get("/simulated", response_model=list[RigAlertOut])
def simulated_alerts(
    user: User = Depends(require_user_session), db: Session = Depends(get_db)
) -> list[RigAlertOut]:
    hosts = list(db.scalars(select(SimulatedHost)))
    settings = alerting_svc.get_or_create_settings(db, user.id)
    return [RigAlertOut(**vars(a)) for a in alerting_svc.alerts_for_simulated(hosts, settings)]
