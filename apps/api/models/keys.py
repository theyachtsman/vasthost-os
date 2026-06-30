"""Provider API keys — the two-key model.

* ``PlatformProviderKey`` — admin-owned, one per provider. Drives ONLY the public
  Market Observer (read-only marketplace polling). Never tied to a user, never
  returned in any user-facing response.
* ``UserProviderKey`` — user-owned, one per provider per user. Drives ONLY that
  user's own fleet / earnings / price writes. Never feeds the shared Observer.

Both store the key encrypted at rest (``encrypted_api_key``); plaintext is never
persisted and never returned after the initial save.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from db.base import Base

from ._types import created_at_col, updated_at_col, uuid_pk


class PlatformProviderKey(Base):
    __tablename__ = "platform_provider_keys"
    __table_args__ = (UniqueConstraint("provider", name="uq_platform_provider"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    provider: Mapped[str] = mapped_column(String, nullable=False)  # 'vast' | 'runpod'
    encrypted_api_key: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    added_by_admin_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admin_users.id")
    )
    last_validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_col()


class UserProviderKey(Base):
    __tablename__ = "user_provider_keys"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_user_provider"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    provider: Mapped[str] = mapped_column(String, nullable=False)  # 'vast' | 'runpod'
    encrypted_api_key: Mapped[str] = mapped_column(Text, nullable=False)
    detected_scopes: Mapped[dict | None] = mapped_column(JSONB)
    vast_user_id: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    last_validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()


class KeyAccessAudit(Base):
    """One row per decrypt-and-use of a user key (Part 2, item 4). The key value
    is never recorded — only what action used it and whether it succeeded."""

    __tablename__ = "key_access_audit"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    provider: Mapped[str | None] = mapped_column(String)
    action: Mapped[str | None] = mapped_column(String)  # fleet_sync|earnings_sync|price_write|validate
    performed_at: Mapped[datetime] = created_at_col()
    success: Mapped[bool | None] = mapped_column(Boolean)
    error_message: Mapped[str | None] = mapped_column(Text)
