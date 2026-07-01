from datetime import UTC, datetime

from fastapi import APIRouter
from sqlalchemy import text

from core.config import settings
from db.session import engine
from schemas.models import HealthComponent, HealthResponse

router = APIRouter()


def _check_db() -> HealthComponent:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return HealthComponent(status="ok")
    except Exception as exc:  # noqa: BLE001
        return HealthComponent(status="error", detail=str(exc))


def _check_redis() -> HealthComponent:
    try:
        import redis

        client = redis.Redis.from_url(settings.REDIS_URL)
        client.ping()
        return HealthComponent(status="ok")
    except Exception as exc:  # noqa: BLE001
        return HealthComponent(status="error", detail=str(exc))


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    components = {
        "api": HealthComponent(status="ok"),
        "database": _check_db(),
        "redis": _check_redis(),
    }
    overall = "healthy" if all(c.status == "ok" for c in components.values()) else "degraded"
    return HealthResponse(
        status=overall,
        components=components,
        time=datetime.now(UTC),
    )
