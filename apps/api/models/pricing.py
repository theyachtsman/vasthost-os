"""Pricing controller tables (write-tracking only in Phase 0)."""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base

from ._types import created_at_col, uuid_pk


class PriceChangeEvent(Base):
    __tablename__ = "price_change_events"

    id: Mapped[uuid.UUID] = uuid_pk()
    changed_at: Mapped[datetime] = created_at_col()
    # Exactly one of machine_id / simulated_host_id is set per row (real vs
    # sandbox rig) — enforced in the service layer, not a DB constraint.
    machine_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("host_machines.id")
    )
    simulated_host_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("simulated_hosts.id")
    )
    old_price_gpu: Mapped[float | None] = mapped_column(Numeric(10, 6))
    new_price_gpu: Mapped[float | None] = mapped_column(Numeric(10, 6))
    # manual|recommend_applied|auto_step_down|auto_probe_up|auto_seed
    reason: Mapped[str | None] = mapped_column(String)
    market_dist_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("market_distributions.id")
    )
    market_percentile: Mapped[float | None] = mapped_column(Numeric(5, 2))
    applied_to_vast: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(Text)
