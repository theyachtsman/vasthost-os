"""Celery tasks.

Per the spec, never share a rate-limit budget across accounts — fleet/earnings
sync iterate accounts and each gets its own Vast client. All Vast calls already
carry exponential backoff + jitter inside ``services.vast_client``.
"""

import logging
from datetime import UTC

from sqlalchemy import select

from db.session import SessionLocal
from models import VastAccount
from services import observer as observer_svc
from services import sync as sync_svc

from .celery_app import celery_app

logger = logging.getLogger("vasthost.tasks")


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


@celery_app.task(name="worker.tasks.observer_discover")
def observer_discover() -> int:
    """Auto-register GPU classes with live supply so the watched list maintains
    itself and picks up new GPU models automatically."""
    db = SessionLocal()
    try:
        return observer_svc.discover_classes(db)
    finally:
        db.close()


@celery_app.task(name="worker.tasks.fleet_sync")
def fleet_sync() -> int:
    db = SessionLocal()
    total = 0
    try:
        accounts = list(db.scalars(select(VastAccount).where(VastAccount.is_active.is_(True))))
        for account in accounts:
            try:
                total += sync_svc.fleet_sync(db, account)
            except Exception as exc:  # noqa: BLE001 — isolate per account
                logger.error("fleet_sync failed for account %s: %s", account.id, exc)
                db.rollback()
        return total
    finally:
        db.close()


@celery_app.task(name="worker.tasks.earnings_sync")
def earnings_sync() -> int:
    db = SessionLocal()
    total = 0
    try:
        accounts = list(db.scalars(select(VastAccount).where(VastAccount.is_active.is_(True))))
        for account in accounts:
            try:
                total += sync_svc.earnings_sync(db, account)
            except Exception as exc:  # noqa: BLE001
                logger.error("earnings_sync failed for account %s: %s", account.id, exc)
                db.rollback()
        return total
    finally:
        db.close()


@celery_app.task(name="worker.tasks.offer_expiry_monitor")
def offer_expiry_monitor() -> int:
    """Phase 1 feature — stubbed. Logs machines whose offers expire < 48h."""
    from datetime import datetime, timedelta

    from models import HostMachine

    db = SessionLocal()
    try:
        threshold = datetime.now(UTC) + timedelta(hours=48)
        expiring = list(
            db.scalars(
                select(HostMachine).where(
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
