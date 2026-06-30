"""Admin account seeding (Part 10).

The admin surface has no public registration. The first admin is created from
``ADMIN_SEED_EMAIL`` / ``ADMIN_SEED_PASSWORD`` on API startup — idempotently: if
any admin already exists, seeding is skipped. The password is hashed with the
same scheme as user passwords; plaintext is never stored, even transiently.
Real credential values live only in the untracked ``.env`` on the deploy machine.
"""

from __future__ import annotations

import logging

from sqlalchemy import select

from core.config import settings
from core.security import hash_password
from db.session import SessionLocal
from models import AdminUser

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
        )
        db.add(admin)
        db.commit()
        logger.info("seeded initial admin account email=%s", admin.email)
    finally:
        db.close()
