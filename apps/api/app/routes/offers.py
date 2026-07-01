"""Offer Management — backfill / default job config.

Bulk price ops live in routes/pricing.py; this covers the other Offer
Management primitive: what runs on a machine when it isn't rented. Vast's
"default job" launches a host-chosen background container automatically
whenever the machine is idle, at a host-set price — self-renting idle GPU
time instead of earning nothing. Confirmed against the installed vastai SDK
(1.1.3): PUT /machines/create_bids/ to set, DELETE /machines/{id}/defjob/ to
remove (see services/vast_client.py).
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.crypto import decrypt
from db.session import get_db
from models import HostMachine, User, UserProviderKey
from schemas.models import DefjobIn, DefjobOut
from services.provider_keys import audit
from services.vast_client import VastClient

from ..deps import require_user_session

router = APIRouter()


def _user_key_ids(db: Session, user: User) -> list[uuid.UUID]:
    return list(
        db.scalars(select(UserProviderKey.id).where(UserProviderKey.user_id == user.id))
    )


def _owned_machine(db: Session, user: User, machine_id: uuid.UUID) -> HostMachine:
    key_ids = _user_key_ids(db, user)
    machine = db.get(HostMachine, machine_id)
    if machine is None or machine.user_provider_key_id not in key_ids:
        raise HTTPException(status_code=404, detail="Machine not found")
    return machine


def _owned_key(db: Session, user: User, machine: HostMachine) -> UserProviderKey:
    key = (
        db.get(UserProviderKey, machine.user_provider_key_id)
        if machine.user_provider_key_id
        else None
    )
    if key is None or not key.is_active or key.user_id != user.id:
        raise HTTPException(status_code=409, detail="No active key owns this machine.")
    return key


def _defjob_out(machine: HostMachine) -> DefjobOut:
    return DefjobOut(
        enabled=machine.defjob_enabled,
        image=machine.defjob_image,
        price_gpu=float(machine.defjob_price_gpu) if machine.defjob_price_gpu is not None else None,
        price_inetu=(
            float(machine.defjob_price_inetu) if machine.defjob_price_inetu is not None else None
        ),
        price_inetd=(
            float(machine.defjob_price_inetd) if machine.defjob_price_inetd is not None else None
        ),
        args=machine.defjob_args,
    )


@router.put("/machines/{machine_id}/defjob", response_model=DefjobOut)
def set_defjob(
    machine_id: uuid.UUID,
    payload: DefjobIn,
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> DefjobOut:
    machine = _owned_machine(db, user, machine_id)
    key = _owned_key(db, user, machine)

    args_list = payload.args.split() if payload.args else []
    try:
        client = VastClient(decrypt(key.encrypted_api_key))
        client.set_defjob(
            machine.machine_id,
            price_gpu=payload.price_gpu,
            price_inetu=payload.price_inetu,
            price_inetd=payload.price_inetd,
            image=payload.image,
            args=args_list,
        )
    except Exception as exc:  # noqa: BLE001 — record every failure, then surface it
        audit(db, user_id=user.id, provider=key.provider, action="defjob_write",
              success=False, error_message=str(exc)[:300])
        raise HTTPException(
            status_code=502, detail="Failed to set the default job on Vast."
        ) from None

    machine.defjob_enabled = True
    machine.defjob_image = payload.image
    machine.defjob_price_gpu = payload.price_gpu
    machine.defjob_price_inetu = payload.price_inetu
    machine.defjob_price_inetd = payload.price_inetd
    machine.defjob_args = payload.args
    db.commit()
    audit(db, user_id=user.id, provider=key.provider, action="defjob_write", success=True)
    return _defjob_out(machine)


@router.delete("/machines/{machine_id}/defjob", response_model=DefjobOut)
def remove_defjob(
    machine_id: uuid.UUID,
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> DefjobOut:
    machine = _owned_machine(db, user, machine_id)
    key = _owned_key(db, user, machine)

    try:
        client = VastClient(decrypt(key.encrypted_api_key))
        client.remove_defjob(machine.machine_id)
    except Exception as exc:  # noqa: BLE001
        audit(db, user_id=user.id, provider=key.provider, action="defjob_remove",
              success=False, error_message=str(exc)[:300])
        raise HTTPException(
            status_code=502, detail="Failed to remove the default job on Vast."
        ) from None

    machine.defjob_enabled = False
    machine.defjob_image = None
    machine.defjob_price_gpu = None
    machine.defjob_price_inetu = None
    machine.defjob_price_inetd = None
    machine.defjob_args = None
    db.commit()
    audit(db, user_id=user.id, provider=key.provider, action="defjob_remove", success=True)
    return _defjob_out(machine)
