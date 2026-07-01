"""PRIVATE fleet tables — host machines, rentals, reliability history."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base

from ._types import created_at_col, updated_at_col, uuid_pk


class HostMachine(Base):
    __tablename__ = "host_machines"

    id: Mapped[uuid.UUID] = uuid_pk()
    vast_account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vast_accounts.id")
    )
    # Multi-tenant owner (the user's connected key). Backfilled from the legacy
    # single-account data when the operator connects their key in Settings.
    user_provider_key_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_provider_keys.id", ondelete="SET NULL")
    )
    machine_id: Mapped[int] = mapped_column(Integer, nullable=False)  # Vast's machine_id
    gpu_name: Mapped[str | None] = mapped_column(String)
    num_gpus: Mapped[int | None] = mapped_column(Integer)
    gpu_ram_mb: Mapped[int | None] = mapped_column(Integer)
    gpu_max_power_w: Mapped[int | None] = mapped_column(Integer)  # watts per GPU
    cpu_name: Mapped[str | None] = mapped_column(String)
    cpu_cores: Mapped[int | None] = mapped_column(Integer)
    cpu_ram_mb: Mapped[int | None] = mapped_column(Integer)
    disk_space_gb: Mapped[float | None] = mapped_column(Numeric(10, 2))
    geolocation: Mapped[str | None] = mapped_column(String)
    verified: Mapped[str | None] = mapped_column(String)  # verified|unverified|deverified
    reliability: Mapped[float | None] = mapped_column(Numeric(5, 4))
    is_listed: Mapped[bool | None] = mapped_column(Boolean)
    is_rentable: Mapped[bool | None] = mapped_column(Boolean)
    current_price_gpu: Mapped[float | None] = mapped_column(Numeric(10, 6))
    current_price_disk: Mapped[float | None] = mapped_column(Numeric(10, 6))
    current_price_inetu: Mapped[float | None] = mapped_column(Numeric(10, 6))
    current_price_inetd: Mapped[float | None] = mapped_column(Numeric(10, 6))
    min_bid_price: Mapped[float | None] = mapped_column(Numeric(10, 6))
    offer_end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Offer Management — Vast's "default job": a background container that
    # launches automatically whenever this machine is idle, at a host-set
    # price (self-renting idle GPU time instead of earning nothing). Set/
    # cleared only via PUT/DELETE /offers/machines/{id}/defjob — fleet_sync
    # never touches these (Vast's show_machines() response has no defjob
    # fields to clobber them with).
    defjob_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    defjob_image: Mapped[str | None] = mapped_column(String)
    defjob_price_gpu: Mapped[float | None] = mapped_column(Numeric(10, 6))
    defjob_price_inetu: Mapped[float | None] = mapped_column(Numeric(10, 6))
    defjob_price_inetd: Mapped[float | None] = mapped_column(Numeric(10, 6))
    defjob_args: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()


class RentalContract(Base):
    __tablename__ = "rental_contracts"

    id: Mapped[uuid.UUID] = uuid_pk()
    machine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("host_machines.id")
    )
    vast_contract_id: Mapped[int | None] = mapped_column(Integer)
    rented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    locked_price_gpu: Mapped[float | None] = mapped_column(Numeric(10, 6))
    rental_type: Mapped[str | None] = mapped_column(String)  # on-demand|interruptible|reserved
    num_gpus_rented: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str | None] = mapped_column(String)  # active|ended|interrupted
    created_at: Mapped[datetime] = created_at_col()


class ReliabilityHistory(Base):
    __tablename__ = "reliability_history"

    id: Mapped[uuid.UUID] = uuid_pk()
    machine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("host_machines.id")
    )
    recorded_at: Mapped[datetime] = created_at_col()
    reliability: Mapped[float | None] = mapped_column(Numeric(5, 4))
    is_listed: Mapped[bool | None] = mapped_column(Boolean)
    is_rentable: Mapped[bool | None] = mapped_column(Boolean)
