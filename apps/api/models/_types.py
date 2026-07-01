"""Shared column helpers."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column


def uuid_pk():
    return mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
        default=uuid.uuid4,
    )


def created_at_col():
    return mapped_column(DateTime(timezone=True), server_default=func.now())


def updated_at_col():
    return mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


# Convenience alias so model files read clearly.
Timestamp = DateTime(timezone=True)


def utcnow() -> datetime:

    return datetime.now(UTC)
