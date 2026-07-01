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

    # ── Pricing (write) ────────────────────────────────────────
    def show_machine(self, machine_id: int) -> dict[str, Any]:
        """Fetch one machine's current state (used to read live offer params
        before a reprice, so we never clobber disk/bandwidth pricing)."""
        result = self._call("show_machine", id=int(machine_id))
        if isinstance(result, dict):
            return result
        return {}

    def set_machine_price(self, machine_id: int, price_gpu: float) -> dict[str, Any]:
        """Re-list a machine at a new per-GPU on-demand price.

        Vast's ``list_machine`` re-creates the machine's offers from the params it
        receives, so we do a READ-MODIFY-WRITE: read the machine's current
        disk/bandwidth/min_chunk/end_date and re-supply them, changing only
        ``price_gpu``. Otherwise a reprice would silently wipe storage/bandwidth
        pricing. ``price_gpu`` is per-GPU $/hr (Vast's native unit here).
        """
        mid = int(machine_id)
        current = self.show_machine(mid)

        def _num(*keys: str) -> float | None:
            for k in keys:
                v = current.get(k)
                if v is not None:
                    try:
                        return float(v)
                    except (TypeError, ValueError):
                        return None
            return None

        kwargs: dict[str, Any] = {"id": mid, "price_gpu": float(price_gpu)}
        # Preserve the rest of the offer exactly as it stands today.
        preserved = {
            "price_disk": _num("listed_storage_cost", "storage_cost", "price_disk"),
            "price_inetu": _num("inet_up_cost", "price_inetu"),
            "price_inetd": _num("inet_down_cost", "price_inetd"),
            "price_min_bid": _num("min_bid_price", "listed_min_bid", "min_bid"),
            "min_chunk": current.get("min_chunk"),
            "end_date": current.get("end_date"),
        }
        for k, v in preserved.items():
            if v is not None:
                kwargs[k] = v
        return self._call("list_machine", **kwargs)

    # ── Offer Management — default job (backfill) ────────────────
    def set_defjob(
        self,
        machine_id: int,
        *,
        price_gpu: float,
        price_inetu: float,
        price_inetd: float,
        image: str,
        args: list[str] | None = None,
    ) -> dict[str, Any]:
        """Configure a background job that launches on this machine whenever
        it isn't rented, at a host-set price — self-renting idle GPU time
        instead of earning nothing. Matches vastai SDK 1.1.3's set_defjob,
        which PUTs to /machines/create_bids/."""
        return self._call(
            "set_defjob",
            id=int(machine_id),
            price_gpu=float(price_gpu),
            price_inetu=float(price_inetu),
            price_inetd=float(price_inetd),
            image=image,
            args=args or [],
        )

    def remove_defjob(self, machine_id: int) -> dict[str, Any]:
        return self._call("remove_defjob", id=int(machine_id))
