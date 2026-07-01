"""Startup seeding (idempotent).

* Admin account (Part 10): created from ``ADMIN_SEED_EMAIL`` /
  ``ADMIN_SEED_PASSWORD`` if no admin exists. The seeded password is a TEMP
  password — the admin is flagged ``must_change_password`` and forced to set
  their own on first login, so a real admin password never lives in .env.
* Platform Vast key: if ``VAST_API_KEY`` is set and no active Vast platform key
  exists, seed it so the public Observer can poll again with no manual step
  (useful after a fresh DB). The admin can replace it later in the console.

Both are skipped if the target already exists, so this is safe on every restart.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import select

from core.config import settings
from core.crypto import encrypt
from core.security import hash_password
from db.session import SessionLocal
from models import AdminUser, PlatformProviderKey

logger = logging.getLogger("gpuiq.seed")


def seed_admin() -> None:
    if not settings.ADMIN_SEED_EMAIL or not settings.ADMIN_SEED_PASSWORD:
        logger.info("admin seeding skipped — ADMIN_SEED_EMAIL/PASSWORD not set")
        return

    db = SessionLocal()
    try:
        existing = db.scalar(select(AdminUser).limit(1))
        if existing is not None:
            logger.info("admin seeding skipped — an admin already exists")
            return
        admin = AdminUser(
            email=settings.ADMIN_SEED_EMAIL.strip().lower(),
            password_hash=hash_password(settings.ADMIN_SEED_PASSWORD),
            must_change_password=True,  # temp password — force change on first login
        )
        db.add(admin)
        db.commit()
        logger.info(
            "seeded initial admin email=%s (temp password — must change on first login)",
            admin.email,
        )
    finally:
        db.close()


def seed_platform_vast_key() -> None:
    """Restore the Observer's platform key from VAST_API_KEY when none exists."""
    if not settings.VAST_API_KEY:
        return
    db = SessionLocal()
    try:
        existing = db.scalar(
            select(PlatformProviderKey).where(PlatformProviderKey.provider == "vast")
        )
        if existing is not None:
            return
        validated_at = None
        try:
            from services.vast_client import VastClient

            VastClient(settings.VAST_API_KEY).show_user()
            validated_at = datetime.now(UTC)
        except Exception as exc:  # noqa: BLE001 — store anyway; polls will surface a bad key
            logger.warning("VAST_API_KEY failed validation but will be stored: %s", exc)
        db.add(
            PlatformProviderKey(
                provider="vast",
                encrypted_api_key=encrypt(settings.VAST_API_KEY),
                is_active=True,
                last_validated_at=validated_at,
            )
        )
        db.commit()
        logger.info("seeded platform Vast key from VAST_API_KEY — Observer can poll")
    finally:
        db.close()
