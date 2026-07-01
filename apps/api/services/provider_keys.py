"""User provider-key custody: validate, store encrypted, audit, backfill.

A user key is validated with a cheap read-only ``show_user()`` before it is ever
stored (Part 2 item 6), encrypted at rest (item 1), and every decrypt-and-use is
recorded in ``key_access_audit`` (item 4) — never the key material itself.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import select, update
from sqlalchemy.orm import Session as DbSession

from core.crypto import encrypt
from models import (
    AccountSnapshot,
    EarningsDaily,
    HostMachine,
    KeyAccessAudit,
    User,
    UserProviderKey,
    VastAccount,
)

from .vast_client import VastClient, VastClientError

logger = logging.getLogger("gpuiq.provider_keys")


def audit(
    db: DbSession,
    *,
    user_id: uuid.UUID | None,
    provider: str | None,
    action: str,
    success: bool,
    error_message: str | None = None,
) -> None:
    """Record one key use. Committed independently so it survives a rollback of
    the surrounding unit of work. Never stores key material."""
    db.add(
        KeyAccessAudit(
            user_id=user_id,
            provider=provider,
            action=action,
            success=success,
            error_message=error_message,
        )
    )
    db.commit()


def validate_vast_key(api_key: str) -> tuple[dict, dict]:
    """Validate a Vast key and best-effort detect its scopes.

    Returns ``(user_info, detected_scopes)``. Raises ``VastClientError`` if the
    key is rejected. Scope detection is non-destructive: we only probe reads.
    """
    client = VastClient(api_key)
    user = client.show_user()  # billing/user read — also the validation call
    scopes = {"user_read": True}
    try:
        client.show_machines()
        scopes["machine_read"] = True
    except VastClientError:
        scopes["machine_read"] = False
    return user, scopes


def connect_user_key(
    db: DbSession, user: User, provider: str, api_key: str
) -> UserProviderKey:
    """Validate, encrypt, upsert the user's key, then backfill legacy data.

    Only Vast is live; RunPod is rejected here (UI marks it "coming soon").
    """
    if provider != "vast":
        raise VastClientError(f"Provider '{provider}' is not available yet")

    try:
        info, scopes = validate_vast_key(api_key)
    except VastClientError:
        audit(db, user_id=user.id, provider=provider, action="validate", success=False,
              error_message="key validation failed")
        raise

    key = db.scalar(
        select(UserProviderKey).where(
            UserProviderKey.user_id == user.id, UserProviderKey.provider == provider
        )
    )
    if key is None:
        key = UserProviderKey(user_id=user.id, provider=provider)
        db.add(key)
    key.encrypted_api_key = encrypt(api_key)
    key.detected_scopes = scopes
    key.vast_user_id = info.get("id")
    key.is_active = True
    from datetime import UTC, datetime

    key.last_validated_at = datetime.now(UTC)
    db.commit()
    db.refresh(key)

    audit(db, user_id=user.id, provider=provider, action="validate", success=True)
    _backfill_legacy_data(db, key)
    return key


def _backfill_legacy_data(db: DbSession, key: UserProviderKey) -> None:
    """Attribute the pre-migration single-account data to this user's key.

    Matches the legacy ``vast_accounts`` row by ``vast_user_id`` and re-stamps its
    machines / earnings / account snapshots with ``user_provider_key_id``. This is
    the concrete step that turns the live single-account data into multi-tenant
    data with no loss. Idempotent — safe to run on every connect.
    """
    if key.vast_user_id is None:
        return
    legacy_ids = list(
        db.scalars(
            select(VastAccount.id).where(VastAccount.vast_user_id == key.vast_user_id)
        )
    )
    if not legacy_ids:
        return

    for model in (HostMachine, EarningsDaily, AccountSnapshot):
        db.execute(
            update(model)
            .where(model.vast_account_id.in_(legacy_ids))
            .values(user_provider_key_id=key.id)
        )
    db.commit()
    logger.info(
        "backfilled legacy data for vast_user_id=%s onto user_provider_key=%s",
        key.vast_user_id,
        key.id,
    )


def disconnect_user_key(db: DbSession, user: User, key_id: uuid.UUID) -> bool:
    """Delete the key row (halting that user's scheduled syncs immediately — the
    fan-out only iterates active rows). Owned private rows are SET NULL by the FK,
    so history is retained, not destroyed."""
    key = db.scalar(
        select(UserProviderKey).where(
            UserProviderKey.id == key_id, UserProviderKey.user_id == user.id
        )
    )
    if key is None:
        return False
    provider = key.provider
    db.delete(key)
    db.commit()
    audit(db, user_id=user.id, provider=provider, action="disconnect", success=True)
    return True
