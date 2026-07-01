"""Shared FastAPI auth dependencies.

Route-level gating goes through exactly these dependencies (Part 7) rather than
ad-hoc per-handler checks:

* ``require_user_session`` — 401 unless a valid user session cookie is present.
* ``require_admin_session`` — 401 unless a valid *admin* session cookie is present.
* ``optional_user`` — returns the user or ``None`` (powers the public Market hub's
  guest-vs-signed-in render without forcing a login).

The user and admin cookies are distinct names, so an admin session can never
satisfy a user dependency or vice versa — the two surfaces share no scope.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session as DbSession

from core.config import settings
from db.session import get_db
from models import AdminUser, User
from services import auth as auth_svc


def require_user_session(request: Request, db: DbSession = Depends(get_db)) -> User:
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    user = auth_svc.resolve_user(db, token)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def optional_user(request: Request, db: DbSession = Depends(get_db)) -> User | None:
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    return auth_svc.resolve_user(db, token)


def require_admin_session(request: Request, db: DbSession = Depends(get_db)) -> AdminUser:
    token = request.cookies.get(settings.ADMIN_SESSION_COOKIE_NAME)
    admin = auth_svc.resolve_admin(db, token)
    if admin is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return admin


def set_session_cookie(response: Response, token: str, *, admin: bool = False) -> None:
    name = settings.ADMIN_SESSION_COOKIE_NAME if admin else settings.SESSION_COOKIE_NAME
    response.set_cookie(
        key=name,
        value=token,
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite="lax",
        max_age=settings.SESSION_TTL_HOURS * 3600,
        path="/",
    )


def clear_session_cookie(response: Response, *, admin: bool = False) -> None:
    name = settings.ADMIN_SESSION_COOKIE_NAME if admin else settings.SESSION_COOKIE_NAME
    response.delete_cookie(key=name, path="/")
