"""Simulated host configs (sandbox testing)."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Integer, Numeric, String
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
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = created_at_col()
