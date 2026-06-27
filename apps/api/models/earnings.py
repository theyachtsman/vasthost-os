"""PRIVATE earnings & cost tables."""

import uuid
from datetime import date, datetime

from sqlalchemy import Computed, Date, ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base

from ._types import created_at_col, updated_at_col, uuid_pk


class EarningsDaily(Base):
    __tablename__ = "earnings_daily"
    __table_args__ = (UniqueConstraint("machine_id", "earn_date", name="uq_earnings_machine_day"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    vast_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vast_accounts.id")
    )
    machine_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("host_machines.id")
    )
    earn_date: Mapped[date] = mapped_column(Date, nullable=False)
    gpu_earn: Mapped[float | None] = mapped_column(Numeric(10, 6))
    storage_earn: Mapped[float | None] = mapped_column(Numeric(10, 6))
    bw_upload_earn: Mapped[float | None] = mapped_column(Numeric(10, 6))
    bw_download_earn: Mapped[float | None] = mapped_column(Numeric(10, 6))
    total_earn: Mapped[float | None] = mapped_column(
        Numeric(10, 6),
        Computed(
            "COALESCE(gpu_earn,0) + COALESCE(storage_earn,0) "
            "+ COALESCE(bw_upload_earn,0) + COALESCE(bw_download_earn,0)",
            persisted=True,
        ),
    )
    synced_at: Mapped[datetime] = created_at_col()


class CostConfig(Base):
    __tablename__ = "cost_config"

    id: Mapped[uuid.UUID] = uuid_pk()
    vast_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vast_accounts.id")
    )
    machine_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("host_machines.id")
    )
    kwh_rate: Mapped[float | None] = mapped_column(Numeric(8, 4))  # $/kWh
    updated_at: Mapped[datetime] = updated_at_col()
