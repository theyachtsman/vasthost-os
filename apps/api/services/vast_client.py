"""Thin wrapper around the official ``vastai`` SDK.

Responsibilities:
* Centralise construction of the ``VastAI`` client from an API key.
* Wrap every Vast call in exponential backoff + jitter, retrying on the ~2s
  rate limit (HTTP 429). Every 429 is logged.
* Normalise the SDK's occasionally-stringy return values into Python objects.

Unit notes (documented per the spec):
* ``gpu_ram`` from the REST API arrives in **MB** (the SDK's REST path). Divide
  by 1024 for GB display. We persist the MB value verbatim in ``gpu_ram_mb``.
* ``gpu_max_power`` is **watts per GPU**.
* earnings are **daily granularity** — there is no real-time earnings number.
"""

from __future__ import annotations

import json
import logging
import random
import time
from typing import Any

from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

logger = logging.getLogger("vasthost.vast")


class VastRateLimited(Exception):
    """Raised when Vast returns a 429 so tenacity can retry it."""


class VastClientError(Exception):
    """Non-retryable Vast error (bad key, malformed response, etc.)."""


def _looks_like_rate_limit(exc: Exception) -> bool:
    text = str(exc).lower()
    return "429" in text or "rate limit" in text or "too many requests" in text


def _coerce(result: Any) -> Any:
    """The SDK sometimes returns JSON strings; normalise to Python objects."""
    if isinstance(result, (dict, list)):
        return result
    if isinstance(result, str):
        try:
            return json.loads(result)
        except json.JSONDecodeError:
            return result
    return result


class VastClient:
    def __init__(self, api_key: str):
        if not api_key:
            raise VastClientError("A Vast API key is required.")
        # Imported lazily so the module imports even if the SDK is missing
        # during tooling/linting.
        from vastai import VastAI

        self._api_key = api_key
        self._vast = VastAI(api_key=api_key)

    def _redact(self, text: str) -> str:
        """Never let the API key reach logs or stored error messages.

        The Vast SDK embeds the key in request URLs, which surface in error
        strings — scrub it (and any 64-hex token) before logging/persisting.
        """
        import re

        scrubbed = text.replace(self._api_key, "***REDACTED***")
        return re.sub(r"\b[0-9a-f]{48,64}\b", "***REDACTED***", scrubbed)

    @retry(
        retry=retry_if_exception_type(VastRateLimited),
        wait=wait_exponential_jitter(initial=2, max=60, jitter=2),
        stop=stop_after_attempt(6),
        reraise=True,
    )
    def _call(self, method: str, **kwargs: Any) -> Any:
        fn = getattr(self._vast, method, None)
        if fn is None:
            raise VastClientError(f"vastai SDK has no method '{method}'")
        try:
            raw = fn(**kwargs)
        except Exception as exc:  # noqa: BLE001 - we classify below
            msg = self._redact(str(exc))
            if _looks_like_rate_limit(exc):
                wait = 2 + random.random() * 2
                logger.warning(
                    "Vast 429 on %s — backing off ~%.1fs and retrying", method, wait
                )
                time.sleep(wait)
                raise VastRateLimited(msg) from None
            logger.error("Vast call %s failed: %s", method, msg)
            raise VastClientError(msg) from None
        return _coerce(raw)

    # ── Account ────────────────────────────────────────────────
    def show_user(self) -> dict[str, Any]:
        """Validate the key and return account info."""
        return self._call("show_user")

    def show_earnings(self, last_days: int = 90) -> Any:
        """Earnings (daily granularity). SDK 1.1.x exposes show_earnings(**kwargs)
        and rejects ``last_days``; older builds accepted it. Try a couple of
        signatures, then fall back to a bare call.

        Note: 1.1.x may return a list rather than the documented dict — callers
        normalise the shape.
        """
        for kwargs in ({}, {"start_date": None, "end_date": None}, {"last_days": last_days}):
            try:
                return self._call("show_earnings", **kwargs)
            except VastClientError as exc:
                if "unexpected keyword" in str(exc) or "argument" in str(exc):
                    continue
                raise
        return {}

    # ── Fleet ──────────────────────────────────────────────────
    def show_machines(self) -> list[dict[str, Any]]:
        result = self._call("show_machines")
        if isinstance(result, dict):
            return result.get("machines", []) or []
        return result or []

    def search_offers(self, query: str = "", limit: int = 1000) -> list[dict[str, Any]]:
        """Search public offers. ``query`` uses Vast's filter DSL, e.g.
        'gpu_name=RTX_4090 num_gpus=1'. Returns the offers list.
        """
        result = self._call("search_offers", query=query, limit=limit)
        if isinstance(result, dict):
            return result.get("offers", []) or []
        return result or []
