"""Simulated host configs (sandbox testing)."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base

from ._types import created_at_col, uuid_pk


class SimulatedHost(Base):
    __tablename__ = "simulated_hosts"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str | None] = mapped_column(String)
    gpu_name: Mapped[str | None] = mapped_column(String)
    num_gpus: Mapped[int | None] = mapped_column(Integer)
    gpu_ram_mb: Mapped[int | None] = mapped_column(Integer)
    gpu_max_power_w: Mapped[int | None] = mapped_column(Integer)
    verified: Mapped[str] = mapped_column(String, default="unverified", server_default="unverified")
    reliability: Mapped[float] = mapped_column(Numeric(5, 4), default=0.90, server_default="0.90")
    geolocation: Mapped[str | None] = mapped_column(String)
    kwh_rate: Mapped[float | None] = mapped_column(Numeric(8, 4))
    vast_service_fee_pct: Mapped[float] = mapped_column(
        Numeric(5, 4), default=0.20, server_default="0.20"
    )
    # Sandbox "asking price" — set via the Pricing Control apply-price route (local
    # only, no Vast write). Null until the user applies a recommendation or sets one.
    current_price_gpu: Mapped[float | None] = mapped_column(Numeric(10, 6))
    # Phase 2 — bounded auto-repricing. Off by default: a rig only gets
    # automated step-down/probe-up moves once the user opts in. The rails are
    # user-set; the controller (services/autopilot.py) never moves outside them.
    autopilot_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    min_price_gpu: Mapped[float | None] = mapped_column(Numeric(10, 6))
    max_price_gpu: Mapped[float | None] = mapped_column(Numeric(10, 6))
    # Simulates Vast's real rental-lock behavior: a price change always updates
    # current_price_gpu (the asking price) immediately — same as on Vast — but
    # while rented_until is in the future, locked_price_gpu is what the
    # (simulated) active renter is paying and is untouched by later price
    # changes, exactly like RentalContract.locked_price_gpu on a real machine.
    # Set together via POST .../simulate-rental, cleared via .../end-rental.
    rented_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    locked_price_gpu: Mapped[float | None] = mapped_column(Numeric(10, 6))
    # When the current simulated rental began — lets Alerting compute "rented
    # for N hours" the same way it does for a real RentalContract.rented_at.
    # Set on .../simulate-rental, cleared on .../end-rental.
    rented_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # When this rig last went idle (explicit .../end-rental only — a natural
    # rented_until expiry is detected lazily by comparing to now(), same as
    # is_rented). Lets Alerting compute "idle for N hours" without a background
    # job to close out expired rentals. Mirrors a real machine's idle-since,
    # which is derived from RentalContract.ended_at instead.
    idle_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Mirrors HostMachine.offer_end_date — lets the offer-expiry alert be
    # tested against a simulated rig. Editable via the general config form.
    offer_end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Sandbox counterpart of Vast's "default job" (see models.fleet.HostMachine)
    # — local only, no Vast write. Set/cleared via PUT/DELETE .../defjob, not
    # part of SimulatedHostIn so a general config save can never touch it.
    defjob_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    defjob_image: Mapped[str | None] = mapped_column(String)
    defjob_price_gpu: Mapped[float | None] = mapped_column(Numeric(10, 6))
    defjob_price_inetu: Mapped[float | None] = mapped_column(Numeric(10, 6))
    defjob_price_inetd: Mapped[float | None] = mapped_column(Numeric(10, 6))
    defjob_args: Mapped[str | None] = mapped_column(String)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # Distinguishes sandbox rigs from real per-user machines once they land via
    # user_provider_keys. Fleet surfaces must never blend the two silently.
    is_simulated: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = created_at_col()
