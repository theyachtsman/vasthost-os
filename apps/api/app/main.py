import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings

from .routes import account, earnings, fleet, health, market, simulator

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("vasthost.api")

app = FastAPI(
    title="VastHost OS API",
    version="0.1.0",
    description="Host-side GPU business intelligence platform for Vast.ai hosts.",
)

if settings.ALLOW_ALL_CORS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(health.router, tags=["health"])
app.include_router(account.router, prefix="/account", tags=["account"])
app.include_router(fleet.router, prefix="/fleet", tags=["fleet"])
app.include_router(earnings.router, prefix="/earnings", tags=["earnings"])
app.include_router(market.router, prefix="/market", tags=["market"])
app.include_router(simulator.router, prefix="/simulator", tags=["simulator"])


@app.on_event("startup")
def on_startup() -> None:
    logger.info("VastHost OS API starting up")
    if not settings.SECRET_KEY:
        logger.warning("SECRET_KEY not set — API key encryption will fail until configured")
    # Validate the optionally-provided env key so misconfig surfaces early.
    if settings.VAST_API_KEY:
        try:
            from services.vast_client import VastClient

            user = VastClient(settings.VAST_API_KEY).show_user()
            logger.info("Vast key from env validated for user id=%s", user.get("id"))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Env VAST_API_KEY failed validation: %s", exc)
