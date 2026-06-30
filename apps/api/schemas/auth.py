"""Pydantic schemas for auth, provider keys, and the admin console."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _normalize_email(v: str) -> str:
    v = (v or "").strip().lower()
    if "@" not in v or "." not in v.split("@")[-1] or len(v) < 5:
        raise ValueError("Enter a valid email address")
    return v


# ── User auth ──────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    display_name: str | None = None

    @field_validator("email")
    @classmethod
    def _norm_email(cls, v: str) -> str:
        return _normalize_email(v)


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=1)

    @field_validator("email")
    @classmethod
    def _norm_email(cls, v: str) -> str:
        return _normalize_email(v)


class UserOut(ORMModel):
    id: uuid.UUID
    email: str
    display_name: str | None
    created_at: datetime


# ── Admin auth ─────────────────────────────────────────────────
class AdminLoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=1)

    @field_validator("email")
    @classmethod
    def _norm_email(cls, v: str) -> str:
        return _normalize_email(v)


class AdminOut(ORMModel):
    id: uuid.UUID
    email: str
    created_at: datetime


# ── Platform keys (admin) ──────────────────────────────────────
class PlatformKeyIn(BaseModel):
    provider: str = "vast"  # 'vast' | 'runpod'
    api_key: str = Field(min_length=8)


class PlatformKeyOut(ORMModel):
    id: uuid.UUID
    provider: str
    is_active: bool
    api_key_masked: str | None = None
    last_validated_at: datetime | None = None
    created_at: datetime


# ── User provider keys ─────────────────────────────────────────
class UserProviderKeyIn(BaseModel):
    provider: str = "vast"  # 'vast' | 'runpod'
    api_key: str = Field(min_length=8)


class UserProviderKeyOut(ORMModel):
    id: uuid.UUID
    provider: str
    is_active: bool
    api_key_masked: str | None = None
    vast_user_id: int | None = None
    detected_scopes: dict | None = None
    last_validated_at: datetime | None = None
    last_synced_at: datetime | None = None
    created_at: datetime


# ── Admin observer status ──────────────────────────────────────
class WatchedClassBrief(BaseModel):
    gpu_name: str
    num_gpus: int


class AdminObserverStatus(BaseModel):
    platform_key_connected: bool
    platform_key_provider: str | None
    platform_key_last_validated_at: datetime | None
    last_poll_at: datetime | None
    total_offer_snapshots: int
    total_clearing_events: int
    watched_classes_count: int
    poll_interval_seconds: int
    watched_classes: list[WatchedClassBrief]
