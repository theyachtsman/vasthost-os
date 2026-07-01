"""Alert settings — per-user thresholds for fleet/rig health signals."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base

from ._types import updated_at_col, uuid_pk


class AlertSettings(Base):
    __tablename__ = "alert_settings"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False
    )
    offer_expiry_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    offer_expiry_threshold_hours: Mapped[int] = mapped_column(
        Integer, nullable=False, default=48, server_default="48"
    )
    idle_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    idle_threshold_hours: Mapped[int] = mapped_column(
        Integer, nullable=False, default=4, server_default="4"
    )
    rented_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    rented_threshold_hours: Mapped[int] = mapped_column(
        Integer, nullable=False, default=24, server_default="24"
    )
    offline_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    updated_at: Mapped[datetime] = updated_at_col()
