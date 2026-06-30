"""Market Observer — the most important data engine.

Operates on the PUBLIC market tables only (offer_snapshots, clearing_events,
market_distributions). It is fed by public Vast listings and never touches a
user's private account/fleet/earnings data.

Clearing detection: an offer that was present (rentable, not rented) in the
previous poll and is absent/rented in the current poll is treated as a probable
rental ("clearing event"). Dwell time is measured from the offer's first sighting.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from core.config import settings
from core.crypto import decrypt
from models import (
    ClearingEvent,
    MarketDistribution,
    OfferSnapshot,
    PlatformProviderKey,
    WatchedClass,
)

from .calc import percentile
from .vast_client import VastClient

# The Observer is exclusively PLATFORM-key-driven (admin-owned, read-only market
# polling). It must never read a user's personal key — that key only ever touches
# that user's own fleet/earnings/pricing.
MARKET_SOURCE = "vast"

logger = logging.getLogger("vasthost.observer")

POLL_INTERVAL_SECONDS = 180

# Auto-discovery: a GPU class needs at least this many live single-GPU offers
# to be auto-registered for watching (keeps the list bounded + low-noise).
DISCOVERY_MIN_SUPPLY = 5
DISCOVERY_SAMPLE_LIMIT = 5000


def _ts(value) -> datetime | None:
    if value in (None, 0):
        return None
    try:
        return datetime.fromtimestamp(float(value), tz=UTC)
    except (TypeError, ValueError, OSError):
        return None


def _observer_client(db: Session) -> VastClient | None:
    """Read the admin-owned PLATFORM Vast key — the only credential the Observer
    is ever allowed to use. Re-scoped from the legacy per-account key to
    ``platform_provider_keys`` (Part 1); the migration seeds this from the
    existing account so polling continues with zero gap."""
    key = db.scalar(
        select(PlatformProviderKey).where(
            PlatformProviderKey.provider == "vast",
            PlatformProviderKey.is_active.is_(True),
        )
    )
    if key is None:
        return None
    return VastClient(decrypt(key.encrypted_api_key))


def _watched(db: Session) -> list[WatchedClass]:
    rows = list(
        db.scalars(select(WatchedClass).where(WatchedClass.is_active.is_(True)))
    )
    return rows


def discover_classes(db: Session) -> int:
    """Auto-register GPU classes that currently have real supply on Vast.

    Runs a single broad sweep, tallies single-GPU offers per gpu_name, and
    upserts an active watched_class for each class above DISCOVERY_MIN_SUPPLY.
    New GPU models appear automatically; thin/noise classes are skipped. We
    never auto-delete — a host can prune in Settings — so manually-added
    classes are preserved. Returns the number of newly-added classes.
    """
    client = _observer_client(db)
    if client is None:
        logger.info("discover: no active account/key yet — skipping")
        return 0

    try:
        offers = client.search_offers(query="num_gpus=1", limit=DISCOVERY_SAMPLE_LIMIT)
    except Exception as exc:  # noqa: BLE001
        logger.error("discover: broad sweep failed: %s", exc)
        return 0

    counts: dict[str, int] = {}
    for o in offers:
        name = o.get("gpu_name")
        if name:
            counts[name] = counts.get(name, 0) + 1

    existing = {
        (wc.gpu_name, wc.num_gpus, wc.geolocation)
        for wc in db.scalars(select(WatchedClass))
    }
    added = 0
    for name, cnt in counts.items():
        if cnt < DISCOVERY_MIN_SUPPLY:
            continue
        key = (name, 1, None)
        if key in existing:
            continue
        db.add(WatchedClass(gpu_name=name, num_gpus=1, geolocation=None))
        added += 1

    if added:
        db.commit()
    logger.info(
        "discover: sampled %s offers, %s classes ≥%s supply, %s newly added",
        len(offers),
        sum(1 for c in counts.values() if c >= DISCOVERY_MIN_SUPPLY),
        DISCOVERY_MIN_SUPPLY,
        added,
    )
    return added


def ensure_default_watched_class(db: Session) -> None:
    """Guarantee the Observer has at least one class to poll, so a fresh DB
    starts recording immediately instead of waiting up to 30m for discovery."""
    if db.scalar(select(WatchedClass).limit(1)) is not None:
        return
    db.add(
        WatchedClass(
            gpu_name=settings.observer_default_gpu,
            num_gpus=settings.VAST_OBSERVER_DEFAULT_NUM_GPUS,
            geolocation=None,
        )
    )
    db.commit()
    logger.info("seeded default watched class %s", settings.observer_default_gpu)


def bootstrap_observer(db: Session) -> int:
    """Bring the Observer to life right after a platform key appears: seed a
    default class, discover the rest of the live market, take one poll, and
    aggregate — so the Market hub shows data within a poll cycle instead of
    waiting on the 30m discovery / 15m aggregation cadence. Idempotent."""
    if _observer_client(db) is None:
        logger.info("bootstrap: no platform key yet — skipping")
        return 0
    ensure_default_watched_class(db)
    discover_classes(db)
    written = market_observer_poll(db)
    market_distribution_aggregate(db)
    logger.info("bootstrap: observer primed (%s snapshots)", written)
    return written


def market_observer_poll(db: Session) -> int:
    """Poll search offers for each watched GPU class, across ALL config sizes.

    We query per gpu_name *without* a num_gpus filter, so a single call returns
    every offer size (×1, ×2, ×4, ×8, …). Each snapshot records its own
    num_gpus, and aggregation buckets by (gpu_name, num_gpus). Returns the number
    of snapshots written.
    """
    client = _observer_client(db)
    if client is None:
        logger.info("observer: no active account/key yet — skipping poll")
        return 0

    watched = _watched(db)
    if not watched:
        logger.info("observer: no watched classes configured — skipping poll")
        return 0

    gpu_names = sorted({wc.gpu_name for wc in watched})
    now = datetime.now(UTC)
    written = 0

    def _snapshot(o: dict, rentable: bool) -> None:
        offer_id = o.get("id")
        if offer_id is None:
            return
        # Vast's dph_base is the TOTAL offer price (scales linearly with
        # num_gpus). Normalise to per-GPU so all config-size buckets are
        # directly comparable; dph_total keeps the renter-pays total.
        num = o.get("num_gpus") or 1
        dph_base = o.get("dph_base")
        price_per_gpu = (dph_base / num) if (dph_base is not None and num) else dph_base
        db.add(
            OfferSnapshot(
                observed_at=now,
                offer_id=int(offer_id),
                machine_id=o.get("machine_id"),
                host_id=o.get("host_id"),
                gpu_name=o.get("gpu_name") or name,
                num_gpus=o.get("num_gpus"),
                gpu_ram_mb=o.get("gpu_ram"),
                gpu_max_power_w=o.get("gpu_max_power"),
                reliability=o.get("reliability"),
                verified=o.get("verified"),
                geolocation=o.get("geolocation"),
                price_gpu=price_per_gpu,
                price_disk=o.get("storage_cost"),
                price_inetu=o.get("inet_up_cost"),
                price_inetd=o.get("inet_down_cost"),
                dph_total=o.get("dph_total"),
                dlperf=o.get("dlperf"),
                dlperf_per_dphtotal=o.get("dlperf_per_dphtotal"),
                # Trust the query we asked for over the (unreliable) response flag.
                rentable=rentable,
                rented=not rentable,
                num_gpus_available=o.get("num_gpus"),
                end_date=_ts(o.get("end_date")),
            )
        )

    for name in gpu_names:
        q = name.replace(" ", "_")
        # Two queries: available (rentable) supply, and unavailable (rented) —
        # Vast's "unavailable offers" filter. Capturing both gives real
        # utilization and lets us confirm rentals directly (no absence inference).
        try:
            available = client.search_offers(query=f"gpu_name={q}", limit=2000)
        except Exception as exc:  # noqa: BLE001
            logger.error("observer poll (available) failed for %s: %s", name, exc)
            available = []
        try:
            unavailable = client.search_offers(query=f"gpu_name={q} rentable=false", limit=2000)
        except Exception as exc:  # noqa: BLE001
            logger.error("observer poll (unavailable) failed for %s: %s", name, exc)
            unavailable = []

        for o in available:
            _snapshot(o, rentable=True)
            written += 1
        unavailable_ids = set()
        for o in unavailable:
            _snapshot(o, rentable=False)
            if o.get("id") is not None:
                unavailable_ids.add(int(o["id"]))
            written += 1

        if CLEARING_DETECTION_ENABLED:
            _detect_clearing(db, name, unavailable_ids, now)

    db.commit()
    logger.info(
        "observer: wrote %s snapshots across %s GPU classes (avail+unavail, all sizes)",
        written,
        len(gpu_names),
    )
    return written


# ── Clearing detection: direct rental observation (transition-based) ─────────
# Vast's search_offers returns a *random sample* each call, so absence-based
# detection is pure noise. Instead we observe rentals DIRECTLY: each poll we
# capture both available (rentable=true) and unavailable (rentable=false) offers.
# An offer we previously saw as AVAILABLE and now see as UNAVAILABLE has been
# rented — a confirmed event. Sampling only makes us miss some (false negatives),
# never invent them (no false positives), so every recorded event is real.
CLEARING_DETECTION_ENABLED = True
CLEARING_LOOKBACK_HOURS = 12
CLEARING_DEDUP_HOURS = 12


# How established a listing must be (in available polls) to earn each grade.
CONFIDENCE_HIGH_POLLS = 3
CONFIDENCE_MED_POLLS = 2


def _grade_confidence(
    polls: int, verified: str | None, dwell_minutes: int | None
) -> tuple[str, str]:
    """Grade how strong a demand signal a confirmed rental is, and explain why.

    Every clearing event is a *confirmed* rental (an offer we saw available is now
    unavailable — sampling can only make us miss events, never invent them). What
    varies is how trustworthy the listing was as a market signal:

    * HIGH   — established listing (seen ≥3 available polls) AND a verified host.
    * MEDIUM — established (≥2 polls) OR verified, but not both.
    * LOW    — thin evidence: first/second sighting and unverified.

    Returns (grade, reason) where reason is a short human string the UI surfaces
    so the user understands the grade instead of trusting an opaque label.
    """
    is_verified = (verified or "").lower() == "verified"
    established_high = polls >= CONFIDENCE_HIGH_POLLS
    established_med = polls >= CONFIDENCE_MED_POLLS

    if established_high and is_verified:
        grade = "HIGH"
    elif established_med or is_verified:
        grade = "MEDIUM"
    else:
        grade = "LOW"

    parts = [
        "verified host" if is_verified else "unverified host",
        f"seen {polls} poll{'s' if polls != 1 else ''} before renting",
    ]
    if dwell_minutes is not None:
        parts.append(f"{dwell_minutes}m on market")
    return grade, " · ".join(parts)


def _detect_clearing(
    db: Session, gpu_name: str, unavailable_ids: set[int], now: datetime
) -> None:
    """Record confirmed rentals: offers now UNAVAILABLE that we previously
    observed as AVAILABLE. Each offer clears once per dedup window."""
    if not unavailable_ids:
        return

    # Of the currently-unavailable offers, which did we previously see available?
    rows = db.execute(
        select(
            OfferSnapshot.offer_id,
            func.min(OfferSnapshot.observed_at),
            func.max(OfferSnapshot.observed_at),
            func.count(func.distinct(OfferSnapshot.observed_at)),
        )
        .where(
            OfferSnapshot.offer_id.in_(unavailable_ids),
            OfferSnapshot.gpu_name == gpu_name,
            OfferSnapshot.rentable.is_(True),
            OfferSnapshot.observed_at >= now - timedelta(hours=CLEARING_LOOKBACK_HOURS),
        )
        .group_by(OfferSnapshot.offer_id)
    ).all()
    if not rows:
        return

    candidate_ids = {r[0] for r in rows}
    already = set(
        db.scalars(
            select(ClearingEvent.offer_id).where(
                ClearingEvent.offer_id.in_(candidate_ids),
                ClearingEvent.detected_at >= now - timedelta(hours=CLEARING_DEDUP_HOURS),
            )
        )
    )

    for offer_id, first_avail, last_avail, avail_polls in rows:
        if offer_id in already:
            continue
        dwell_minutes = None
        if first_avail is not None and last_avail is not None:
            dwell_minutes = int((last_avail - first_avail).total_seconds() // 60)

        # Price/meta from the last time it was AVAILABLE (the price it rented at).
        last_avail_snap = db.scalar(
            select(OfferSnapshot)
            .where(
                OfferSnapshot.offer_id == offer_id,
                OfferSnapshot.gpu_name == gpu_name,
                OfferSnapshot.rentable.is_(True),
            )
            .order_by(OfferSnapshot.observed_at.desc())
        )
        if last_avail_snap is None:
            continue

        confidence, reason = _grade_confidence(
            polls=avail_polls or 0,
            verified=last_avail_snap.verified,
            dwell_minutes=dwell_minutes,
        )

        db.add(
            ClearingEvent(
                detected_at=now,
                offer_id=offer_id,
                gpu_name=last_avail_snap.gpu_name,
                num_gpus=last_avail_snap.num_gpus,
                verified=last_avail_snap.verified,
                geolocation=last_avail_snap.geolocation,
                last_price_gpu=last_avail_snap.price_gpu,
                dwell_minutes=dwell_minutes,
                is_partial_fill=False,
                confidence=confidence,
                confidence_reason=reason,
            )
        )


def market_distribution_aggregate(db: Session) -> int:
    """Aggregate the latest poll per watched GPU class into one distribution row
    per (gpu_name, num_gpus) bucket — so every config size with supply (×1, ×2,
    ×4, ×8, …) gets its own distribution."""
    watched = _watched(db)
    gpu_names = sorted({wc.gpu_name for wc in watched})
    now = datetime.now(UTC)
    produced = 0

    for name in gpu_names:
        latest_poll = db.scalar(
            select(func.max(OfferSnapshot.observed_at)).where(
                OfferSnapshot.gpu_name == name,
            )
        )
        if latest_poll is None:
            continue

        snaps = list(
            db.scalars(
                select(OfferSnapshot).where(
                    OfferSnapshot.observed_at == latest_poll,
                    OfferSnapshot.gpu_name == name,
                )
            )
        )
        if not snaps:
            continue

        # Bucket by config size.
        buckets: dict[int, list] = {}
        for s in snaps:
            if s.num_gpus is None:
                continue
            buckets.setdefault(s.num_gpus, []).append(s)

        for num_gpus, group in buckets.items():
            available = [s for s in group if s.rentable]
            unavailable = [s for s in group if not s.rentable]
            # Price distribution is the ASKING market — available offers only.
            # But when a size is fully rented there are no asks, which used to
            # blank the price (and stall the price-over-time chart). Fall back to
            # the rented offers' last-known ask so price is never empty, and label
            # the basis so the UI can mark it as "last rented".
            prices = sorted(float(s.price_gpu) for s in available if s.price_gpu is not None)
            price_basis = "ask"
            if not prices:
                prices = sorted(
                    float(s.price_gpu) for s in unavailable if s.price_gpu is not None
                )
                if prices:
                    price_basis = "last-rented"
            avail_n = len(available)
            rented_n = len(unavailable)
            total = avail_n + rented_n
            util = round(100.0 * rented_n / total, 2) if total else None

            # Value signals (median). Prefer available offers; fall back to the
            # full group when the size is fully rented so these never blank out.
            value_src = available or group
            dlperfs = sorted(float(s.dlperf) for s in value_src if s.dlperf is not None)
            ppds = sorted(
                float(s.dlperf_per_dphtotal)
                for s in value_src
                if s.dlperf_per_dphtotal is not None
            )
            med_dlperf = percentile(dlperfs, 50)
            med_ppd = percentile(ppds, 50)

            db.add(
                MarketDistribution(
                    computed_at=now,
                    gpu_name=name,
                    num_gpus=num_gpus,
                    verified=None,
                    geolocation=None,
                    p10_price=percentile(prices, 10),
                    p25_price=percentile(prices, 25),
                    p50_price=percentile(prices, 50),
                    p75_price=percentile(prices, 75),
                    p90_price=percentile(prices, 90),
                    supply_count=total,  # total observed (available + rented)
                    rented_count=rented_n,
                    utilization_pct=util,
                    clearing_rate_1h=_clearing_rate(db, name, num_gpus, now, hours=1),
                    clearing_rate_24h=_clearing_rate(db, name, num_gpus, now, hours=24),
                    dlperf=med_dlperf,
                    dlperf_per_dphtotal=med_ppd,
                    price_basis=price_basis,
                )
            )
            produced += 1

    db.commit()
    logger.info("observer: produced %s distribution rows (per size bucket)", produced)
    return produced


def _clearing_rate(
    db: Session, gpu_name: str, num_gpus: int, now: datetime, hours: int
) -> float | None:
    """Clearing events per supply unit over the window (rough demand proxy)."""
    window_start = now - timedelta(hours=hours)
    events = db.scalar(
        select(func.count(ClearingEvent.id)).where(
            ClearingEvent.detected_at >= window_start,
            ClearingEvent.gpu_name == gpu_name,
            ClearingEvent.num_gpus == num_gpus,
        )
    )
    avg_supply = db.scalar(
        select(func.avg(MarketDistribution.supply_count)).where(
            MarketDistribution.computed_at >= window_start,
            MarketDistribution.gpu_name == gpu_name,
            MarketDistribution.num_gpus == num_gpus,
        )
    )
    if not avg_supply:
        return None
    rate = float(events or 0) / float(avg_supply)
    return round(min(rate, 9.9999), 4)
