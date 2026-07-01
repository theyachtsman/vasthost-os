"""Alerting — configurable per-user thresholds for fleet/rig health signals.

Four independently-toggleable alert types:
  * offer_expiry — offer_end_date is within the threshold (or already past)
  * idle — no active rental for longer than the threshold
  * rented — a single rental has run continuously past the threshold
  * offline — unlisted (real) / deactivated (simulated)

Thresholds are global per user (one AlertSettings row), applied identically to
real machines and simulated rigs so the sandbox can exercise every alert type
before a real machine ever trips one.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import AlertSettings, HostMachine, RentalContract, SimulatedHost

_DEFAULTS = dict(
    offer_expiry_enabled=True,
    offer_expiry_threshold_hours=48,
    idle_enabled=False,
    idle_threshold_hours=4,
    rented_enabled=False,
    rented_threshold_hours=24,
    offline_enabled=False,
)


def get_or_create_settings(db: Session, user_id: uuid.UUID) -> AlertSettings:
    settings = db.scalar(select(AlertSettings).where(AlertSettings.user_id == user_id))
    if settings is None:
        settings = AlertSettings(user_id=user_id, **_DEFAULTS)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@dataclass
class RigAlert:
    kind: str
    id: str
    label: str
    gpu_name: str | None
    num_gpus: int | None
    simulated: bool
    detail: str
    severity: str


def _hours_since(then: datetime, now: datetime) -> float:
    return (now - then).total_seconds() / 3600.0


def _offer_expiry_alert(
    end_date: datetime | None, now: datetime, settings: AlertSettings
) -> tuple[str, str] | None:
    """Returns (detail, severity) or None. Mirrors the pre-existing 'offers
    expiring < 48h' behavior, now with a configurable threshold."""
    if not settings.offer_expiry_enabled or end_date is None:
        return None
    hrs = (end_date - now).total_seconds() / 3600.0
    if hrs < 0:
        return "Offer already expired", "danger"
    if hrs <= settings.offer_expiry_threshold_hours:
        return f"Offer expires in {hrs:.0f}h", ("danger" if hrs <= 6 else "warning")
    return None


def alerts_for_machines(
    db: Session, machines: list[HostMachine], settings: AlertSettings
) -> list[RigAlert]:
    now = datetime.now(UTC)
    out: list[RigAlert] = []

    for m in machines:
        label = f"{m.gpu_name or 'GPU'} ×{m.num_gpus or '?'} · machine {m.machine_id}"

        expiry = _offer_expiry_alert(m.offer_end_date, now, settings)
        if expiry is not None:
            out.append(RigAlert("offer_expiry", str(m.id), label, m.gpu_name, m.num_gpus, False, *expiry))

        active = db.scalar(
            select(RentalContract)
            .where(RentalContract.machine_id == m.id, RentalContract.status == "active")
            .order_by(RentalContract.rented_at.desc())
        )

        if active is not None:
            if settings.rented_enabled and active.rented_at is not None:
                hrs = _hours_since(active.rented_at, now)
                if hrs >= settings.rented_threshold_hours:
                    out.append(
                        RigAlert("rented", str(m.id), label, m.gpu_name, m.num_gpus, False,
                                 f"Rented continuously for {hrs:.0f}h", "warning")
                    )
        elif settings.idle_enabled:
            last_ended = db.scalar(
                select(RentalContract.ended_at)
                .where(RentalContract.machine_id == m.id, RentalContract.ended_at.is_not(None))
                .order_by(RentalContract.ended_at.desc())
            )
            since = last_ended or m.created_at
            hrs = _hours_since(since, now)
            if hrs >= settings.idle_threshold_hours:
                out.append(
                    RigAlert("idle", str(m.id), label, m.gpu_name, m.num_gpus, False,
                             f"Idle for {hrs:.0f}h", "warning")
                )

        if settings.offline_enabled and m.is_listed is False:
            out.append(
                RigAlert("offline", str(m.id), label, m.gpu_name, m.num_gpus, False,
                         "Unlisted", "danger")
            )

    return out


def alerts_for_simulated(
    hosts: list[SimulatedHost], settings: AlertSettings
) -> list[RigAlert]:
    now = datetime.now(UTC)
    out: list[RigAlert] = []

    for h in hosts:
        label = f"{h.gpu_name or 'GPU'} ×{h.num_gpus or '?'} · {h.name or 'sim rig'}"
        is_rented = h.rented_until is not None and h.rented_until > now

        expiry = _offer_expiry_alert(h.offer_end_date, now, settings)
        if expiry is not None:
            out.append(RigAlert("offer_expiry", str(h.id), label, h.gpu_name, h.num_gpus, True, *expiry))

        if is_rented:
            if settings.rented_enabled and h.rented_since is not None:
                hrs = _hours_since(h.rented_since, now)
                if hrs >= settings.rented_threshold_hours:
                    out.append(
                        RigAlert("rented", str(h.id), label, h.gpu_name, h.num_gpus, True,
                                 f"Rented continuously for {hrs:.0f}h", "warning")
                    )
        elif settings.idle_enabled:
            # A natural rented_until expiry (never explicitly ended) is idle
            # since that timestamp; otherwise fall back to the explicit
            # idle_since bookkeeping, or rig creation if it was never rented.
            since = h.rented_until if h.rented_until is not None else (h.idle_since or h.created_at)
            hrs = _hours_since(since, now)
            if hrs >= settings.idle_threshold_hours:
                out.append(
                    RigAlert("idle", str(h.id), label, h.gpu_name, h.num_gpus, True,
                             f"Idle for {hrs:.0f}h", "warning")
                )

        if settings.offline_enabled and not h.is_active:
            out.append(
                RigAlert("offline", str(h.id), label, h.gpu_name, h.num_gpus, True,
                         "Deactivated", "danger")
            )

    return out
