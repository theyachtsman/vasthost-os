"""Session lifecycle for user and admin auth.

Opaque tokens: the raw token is returned to the caller (to be set as an httpOnly
cookie) and only its hash is stored. Lookups hash the incoming cookie and match
on the stored hash, scoped by expiry.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session as DbSession

from core.config import settings
from core.security import generate_session_token, hash_session_token
from models import AdminSession, AdminUser, Session, User


def _expiry() -> datetime:
    return datetime.now(UTC) + timedelta(hours=settings.SESSION_TTL_HOURS)


def create_user_session(db: DbSession, user_id: uuid.UUID) -> str:
    token = generate_session_token()
    db.add(Session(user_id=user_id, token_hash=hash_session_token(token), expires_at=_expiry()))
    db.commit()
    return token


def create_admin_session(db: DbSession, admin_user_id: uuid.UUID) -> str:
    token = generate_session_token()
    db.add(
        AdminSession(
            admin_user_id=admin_user_id,
            token_hash=hash_session_token(token),
            expires_at=_expiry(),
        )
    )
    db.commit()
    return token


def resolve_user(db: DbSession, token: str | None) -> User | None:
    if not token:
        return None
    row = db.scalar(
        select(Session).where(
            Session.token_hash == hash_session_token(token),
            Session.expires_at > datetime.now(UTC),
        )
    )
    if row is None:
        return None
    user = db.get(User, row.user_id)
    if user is None or not user.is_active:
        return None
    return user


def resolve_admin(db: DbSession, token: str | None) -> AdminUser | None:
    if not token:
        return None
    row = db.scalar(
        select(AdminSession).where(
            AdminSession.token_hash == hash_session_token(token),
            AdminSession.expires_at > datetime.now(UTC),
        )
    )
    if row is None:
        return None
    return db.get(AdminUser, row.admin_user_id)


def destroy_user_session(db: DbSession, token: str | None) -> None:
    if not token:
        return
    db.execute(delete(Session).where(Session.token_hash == hash_session_token(token)))
    db.commit()


def destroy_admin_session(db: DbSession, token: str | None) -> None:
    if not token:
        return
    db.execute(delete(AdminSession).where(AdminSession.token_hash == hash_session_token(token)))
    db.commit()
