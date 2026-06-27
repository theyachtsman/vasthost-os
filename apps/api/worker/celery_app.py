"""Celery app + Beat schedule for VastHost OS.

The Market Observer (market_observer_poll) is the most important task and runs
every 3 minutes from the moment the stack is up — its dataset cannot be
backfilled.
"""

from celery import Celery
from celery.schedules import crontab

from core.config import settings

celery_app = Celery(
    "vasthost",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_max_tasks_per_child=200,
    # The vastai SDK inspects sys.stdout.encoding on construction; Celery's
    # default stdout/stderr redirection to a LoggingProxy (which has no
    # .encoding) breaks that. Keep the real streams so Vast calls work in tasks.
    worker_redirect_stdouts=False,
)

# Ensure task modules are imported so they register.
celery_app.autodiscover_tasks(["worker"])
import worker.tasks  # noqa: E402,F401

celery_app.conf.beat_schedule = {
    "market-observer-poll": {
        "task": "worker.tasks.market_observer_poll",
        "schedule": 180.0,  # every 3 minutes
    },
    "market-distribution-aggregate": {
        "task": "worker.tasks.market_distribution_aggregate",
        "schedule": 900.0,  # every 15 minutes
    },
    "fleet-sync": {
        "task": "worker.tasks.fleet_sync",
        "schedule": 120.0,  # every 2 minutes
    },
    "earnings-sync": {
        "task": "worker.tasks.earnings_sync",
        "schedule": 1800.0,  # every 30 minutes
    },
    "offer-expiry-monitor": {
        "task": "worker.tasks.offer_expiry_monitor",
        "schedule": crontab(minute=0, hour="*/6"),  # every 6 hours
    },
}
