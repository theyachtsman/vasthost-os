import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings

from .routes import (
    account,
    admin,
    auth,
    earnings,
    fleet,
    health,
    market,
    provider_keys,
    simulator,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("gpuiq.api")

app = FastAPI(
    title="GPUIQ API",
    version="0.2.0",
    description="GPU marketplace intelligence + host automation — public Market "
    "Intelligence (platform-key Observer) and per-user fleet/earnings/pricing "
    "(user keys).",
)

if settings.ALLOW_ALL_CORS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Public + health
app.include_router(health.router, tags=["health"])
app.include_router(market.router, prefix="/market", tags=["market"])

# Auth
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])

# User-session-gated
app.include_router(provider_keys.router, prefix="/me", tags=["me"])
app.include_router(fleet.router, prefix="/fleet", tags=["fleet"])
app.include_router(earnings.router, prefix="/earnings", tags=["earnings"])
app.include_router(simulator.router, prefix="/simulator", tags=["simulator"])

# Legacy single-account routes (retained for backward compatibility; the
# two-key model supersedes them — see /me/provider-keys and /admin/platform-keys).
app.include_router(account.router, prefix="/account", tags=["account"])


@app.on_event("startup")
def on_startup() -> None:
    logger.info("GPUIQ API starting up")
    if not settings.SECRET_KEY:
        logger.warning("SECRET_KEY not set — API key encryption will fail until configured")

    # Seed the first admin from env (idempotent) so the admin console is reachable.
    try:
        from services.seed import seed_admin

        seed_admin()
    except Exception as exc:  # noqa: BLE001
        logger.error("admin seeding failed: %s", exc)
