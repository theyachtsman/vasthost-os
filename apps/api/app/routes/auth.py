"""User authentication — register, login, logout, me."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from core.config import settings
from core.security import hash_password, verify_password
from db.session import get_db
from models import User
from schemas.auth import LoginRequest, RegisterRequest, UserOut
from services import auth as auth_svc

from ..deps import clear_session_cookie, require_user_session, set_session_cookie

logger = logging.getLogger("gpuiq.auth")
router = APIRouter()


@router.post("/register", response_model=UserOut)
def register(
    payload: RegisterRequest,
    response: Response,
    db: DbSession = Depends(get_db),
) -> UserOut:
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing is not None:
        raise HTTPException(status_code=409, detail="An account with that email already exists")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = auth_svc.create_user_session(db, user.id)
    set_session_cookie(response, token)
    logger.info("registered user id=%s", user.id)
    return UserOut.model_validate(user)


@router.post("/login", response_model=UserOut)
def login(
    payload: LoginRequest,
    response: Response,
    db: DbSession = Depends(get_db),
) -> UserOut:
    user = db.scalar(select(User).where(User.email == payload.email))
    # Constant-ish failure path: always run a verify so timing doesn't leak
    # which emails exist.
    ok = user is not None and user.is_active and verify_password(payload.password, user.password_hash)
    if not ok or user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = auth_svc.create_user_session(db, user.id)
    set_session_cookie(response, token)
    return UserOut.model_validate(user)


@router.post("/logout")
def logout(request: Request, response: Response, db: DbSession = Depends(get_db)) -> dict:
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    auth_svc.destroy_user_session(db, token)
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(require_user_session)) -> UserOut:
    return UserOut.model_validate(user)
