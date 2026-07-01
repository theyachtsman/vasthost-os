"""PRIVATE user account tables."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base

from ._types import created_at_col, uuid_pk


class VastAccount(Base):
    __tablename__ = "vast_accounts"

    id: Mapped[uuid.UUID] = uuid_pk()
    vast_api_key: Mapped[str] = mapped_column(String, nullable=False)  # encrypted at rest
    vast_user_id: Mapped[int | None] = mapped_column(Integer)
    email: Mapped[str | None] = mapped_column(String)
    display_name: Mapped[str | None] = mapped_column(String)
    account_balance: Mapped[float | None] = mapped_column(Numeric(10, 4))
    connected_at: Mapped[datetime] = created_at_col()
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")


class AccountSnapshot(Base):
    __tablename__ = "account_snapshots"

    id: Mapped[uuid.UUID] = uuid_pk()
    vast_account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vast_accounts.id")
    )
    user_provider_key_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_provider_keys.id", ondelete="SET NULL")
    )
    recorded_at: Mapped[datetime] = created_at_col()
    balance: Mapped[float | None] = mapped_column(Numeric(10, 4))
    service_fee: Mapped[float | None] = mapped_column(Numeric(10, 4))
    total_credit: Mapped[float | None] = mapped_column(Numeric(10, 4))


class WatchedClass(Base):
    """GPU classes the Market Observer polls. Drives market_observer_poll."""

    __tablename__ = "watched_classes"
    __table_args__ = (
        UniqueConstraint("gpu_name", "num_gpus", "geolocation", name="uq_watched_class"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    gpu_name: Mapped[str] = mapped_column(String, nullable=False)
    num_gpus: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    geolocation: Mapped[str | None] = mapped_column(String)  # NULL = all regions
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = created_at_col()
