from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, populated from environment variables.

    See `.env.example` at the repo root for the full reference.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Vast
    VAST_API_KEY: str | None = None
    VAST_OBSERVER_DEFAULT_GPU: str = "RTX_4090"
    VAST_OBSERVER_DEFAULT_NUM_GPUS: int = 1

    # Estimated platform (Vast) commission. Single source of truth for fee math.
    # NOT applied to Market Intelligence surfaces — those show the asking price
    # hosts set, with no fee derivation (the post-vs-pre-fee meaning of dph_base
    # was never verified). Used only by the simulator's break-even ESTIMATE, where
    # an assumed rate is acceptable as long as it's labeled. The per-host
    # vast_service_fee_pct override defaults to this.
    MARKET_FEE_PCT: float = 0.25

    # Infra
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@postgres:5432/vasthost"
    REDIS_URL: str = "redis://redis:6379/0"

    # Crypto — used to encrypt stored provider API keys at rest.
    SECRET_KEY: str | None = None

    # Auth — opaque session tokens are stored hashed; these control lifetime and
    # cookie naming. User and admin sessions use *different* cookie names so the
    # two surfaces never share scope.
    SESSION_COOKIE_NAME: str = "gpuiq_session"
    ADMIN_SESSION_COOKIE_NAME: str = "gpuiq_admin_session"
    SESSION_TTL_HOURS: int = 24 * 30  # 30 days
    SESSION_COOKIE_SECURE: bool = False  # LAN/HTTP deploy — set true behind TLS

    # Admin account seeding (Part 10). Real values live only in the untracked
    # .env on the deploy machine — never committed.
    ADMIN_SEED_EMAIL: str | None = None
    ADMIN_SEED_PASSWORD: str | None = None

    # Dev flags
    ALLOW_ALL_CORS: bool = True

    @property
    def observer_default_gpu(self) -> str:
        # Env uses underscores (RTX_4090); Vast expects spaces ("RTX 4090").
        return self.VAST_OBSERVER_DEFAULT_GPU.replace("_", " ")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
