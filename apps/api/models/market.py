"""PUBLIC market-observer tables.

Derived from public Vast listings. NOT tied to any vast_account — never join
these against the private account/fleet/earnings tables.
"""

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base


class OfferSnapshot(Base):
    """One row per offer per poll."""

    __tablename__ = "offer_snapshots"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    offer_id: Mapped[int] = mapped_column(Integer, nullable=False)
    machine_id: Mapped[int | None] = mapped_column(Integer)
    gpu_name: Mapped[str] = mapped_column(String, nullable=False)
    num_gpus: Mapped[int | None] = mapped_column(Integer)
    gpu_ram_mb: Mapped[int | None] = mapped_column(Integer)
    gpu_max_power_w: Mapped[int | None] = mapped_column(Integer)
    reliability: Mapped[float | None] = mapped_column(Numeric(5, 4))
    verified: Mapped[str | None] = mapped_column(String)
    geolocation: Mapped[str | None] = mapped_column(String)
    price_gpu: Mapped[float | None] = mapped_column(Numeric(10, 6))
    price_disk: Mapped[float | None] = mapped_column(Numeric(10, 6))
    price_inetu: Mapped[float | None] = mapped_column(Numeric(10, 6))
    price_inetd: Mapped[float | None] = mapped_column(Numeric(10, 6))
    dph_total: Mapped[float | None] = mapped_column(Numeric(10, 6))
    dlperf: Mapped[float | None] = mapped_column(Numeric(10, 4))
    dlperf_per_dphtotal: Mapped[float | None] = mapped_column(Numeric(10, 4))
    rentable: Mapped[bool | None] = mapped_column(Boolean)
    rented: Mapped[bool | None] = mapped_column(Boolean)
    num_gpus_available: Mapped[int | None] = mapped_column(Integer)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ClearingEvent(Base):
    """Detected clearing event — offer disappeared, probable rental."""

    __tablename__ = "clearing_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    offer_id: Mapped[int] = mapped_column(Integer, nullable=False)
    gpu_name: Mapped[str | None] = mapped_column(String)
    num_gpus: Mapped[int | None] = mapped_column(Integer)
    verified: Mapped[str | None] = mapped_column(String)
    geolocation: Mapped[str | None] = mapped_column(String)
    last_price_gpu: Mapped[float | None] = mapped_column(Numeric(10, 6))
    dwell_minutes: Mapped[int | None] = mapped_column(Integer)
    is_partial_fill: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    confidence: Mapped[str] = mapped_column(String, default="MEDIUM", server_default="MEDIUM")


class MarketDistribution(Base):
    """Pre-aggregated price distribution per GPU class per poll cycle."""

    __tablename__ = "market_distributions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    gpu_name: Mapped[str] = mapped_column(String, nullable=False)
    num_gpus: Mapped[int] = mapped_column(Integer, nullable=False)
    verified: Mapped[str | None] = mapped_column(String)
    geolocation: Mapped[str | None] = mapped_column(String)  # NULL = all regions
    p10_price: Mapped[float | None] = mapped_column(Numeric(10, 6))
    p25_price: Mapped[float | None] = mapped_column(Numeric(10, 6))
    p50_price: Mapped[float | None] = mapped_column(Numeric(10, 6))
    p75_price: Mapped[float | None] = mapped_column(Numeric(10, 6))
    p90_price: Mapped[float | None] = mapped_column(Numeric(10, 6))
    supply_count: Mapped[int | None] = mapped_column(Integer)
    rented_count: Mapped[int | None] = mapped_column(Integer)
    utilization_pct: Mapped[float | None] = mapped_column(Numeric(5, 2))
    clearing_rate_1h: Mapped[float | None] = mapped_column(Numeric(5, 4))
    clearing_rate_24h: Mapped[float | None] = mapped_column(Numeric(5, 4))
