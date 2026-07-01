"""Celery tasks.

Two families, matching the two-key model:

* PLATFORM-key-driven (public Observer): market_observer_poll,
  market_distribution_aggregate, observer_discover — unchanged in logic, now
  reading the admin platform key inside the service layer.
* USER-key-driven (private): fleet_sync, earnings_sync, offer_expiry_monitor —
  fan out over active ``user_provider_keys`` rows, each with its own Vast client
  (no shared rate-limit budget). A key that fails auth is deactivated so a dead
  key never retry-loops forever (the user gets a reconnect banner).
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from db.session import SessionLocal
from models import HostMachine, UserProviderKey
from services import observer as observer_svc
from services import sync as sync_svc

from .celery_app import celery_app

logger = logging.getLogger("gpuiq.tasks")


def _active_vast_keys(db) -> list[UserProviderKey]:
    return list(
        db.scalars(
            select(UserProviderKey).where(
                UserProviderKey.provider == "vast",
                UserProviderKey.is_active.is_(True),
            )
        )
    )


def _looks_like_auth_failure(exc: Exception) -> bool:
    text = str(exc).lower()
    return any(s in text for s in ("401", "403", "unauthorized", "forbidden", "invalid api key"))


def _handle_key_failure(db, key: UserProviderKey, exc: Exception) -> None:
    db.rollback()
    if _looks_like_auth_failure(exc):
        key.is_active = False
        db.commit()
        logger.warning("deactivated user_provider_key %s after auth failure", key.id)


# ── PLATFORM-key-driven (public Observer) ──────────────────────
@celery_app.task(name="worker.tasks.market_observer_poll")
def market_observer_poll() -> int:
    db = SessionLocal()
    try:
        return observer_svc.market_observer_poll(db)
    finally:
        db.close()


@celery_app.task(name="worker.tasks.market_distribution_aggregate")
def market_distribution_aggregate() -> int:
    db = SessionLocal()
    try:
        return observer_svc.market_distribution_aggregate(db)
    finally:
        db.close()


@celery_app.task(name="worker.tasks.bootstrap_observer")
def bootstrap_observer() -> int:
    """One-shot primer: seed a default class, discover, poll, aggregate. Enqueued
    when a platform key is added and on API startup if a key already exists."""
    db = SessionLocal()
    try:
        return observer_svc.bootstrap_observer(db)
    finally:
        db.close()


@celery_app.task(name="worker.tasks.observer_discover")
def observer_discover() -> int:
    """Auto-register GPU classes with live supply so the watched list maintains
    itself and picks up new GPU models automatically."""
    db = SessionLocal()
    try:
        return observer_svc.discover_classes(db)
    finally:
        db.close()


# ── USER-key-driven (private, per-user) ────────────────────────
@celery_app.task(name="worker.tasks.fleet_sync")
def fleet_sync() -> int:
    db = SessionLocal()
    total = 0
    try:
        for key in _active_vast_keys(db):
            try:
                total += sync_svc.fleet_sync(db, key)
            except Exception as exc:  # noqa: BLE001 — isolate per key
                logger.error("fleet_sync failed for key %s: %s", key.id, exc)
                _handle_key_failure(db, key, exc)
        return total
    finally:
        db.close()


@celery_app.task(name="worker.tasks.earnings_sync")
def earnings_sync() -> int:
    db = SessionLocal()
    total = 0
    try:
        for key in _active_vast_keys(db):
            try:
                total += sync_svc.earnings_sync(db, key)
            except Exception as exc:  # noqa: BLE001
                logger.error("earnings_sync failed for key %s: %s", key.id, exc)
                _handle_key_failure(db, key, exc)
        return total
    finally:
        db.close()


@celery_app.task(name="worker.tasks.offer_expiry_monitor")
def offer_expiry_monitor() -> int:
    """Feeds the Alerting surface: machines (owned by an active key) whose offers
    expire < 48h. Logs for now; the count is surfaced in the UI."""
    db = SessionLocal()
    try:
        threshold = datetime.now(UTC) + timedelta(hours=48)
        expiring = list(
            db.scalars(
                select(HostMachine).where(
                    HostMachine.user_provider_key_id.is_not(None),
                    HostMachine.offer_end_date.is_not(None),
                    HostMachine.offer_end_date < threshold,
                )
            )
        )
        if expiring:
            logger.info("offer_expiry_monitor: %s machine(s) expiring < 48h", len(expiring))
        return len(expiring)
    finally:
        db.close()
