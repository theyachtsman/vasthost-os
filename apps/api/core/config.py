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

    # Infra
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@postgres:5432/vasthost"
    REDIS_URL: str = "redis://redis:6379/0"

    # Crypto — used to encrypt stored Vast API keys at rest.
    SECRET_KEY: str | None = None

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
