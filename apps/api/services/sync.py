"""Fleet & earnings sync — operate on the PRIVATE account tables only."""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from core.crypto import decrypt
from models import (
    AccountSnapshot,
    EarningsDaily,
    HostMachine,
    ReliabilityHistory,
    RentalContract,
    VastAccount,
)

from .vast_client import VastClient

logger = logging.getLogger("vasthost.sync")


def _ts(value) -> datetime | None:
    if value in (None, 0):
        return None
    try:
        return datetime.fromtimestamp(float(value), tz=UTC)
    except (TypeError, ValueError, OSError):
        return None


def _client_for(account: VastAccount) -> VastClient:
    return VastClient(decrypt(account.vast_api_key))


def fleet_sync(db: Session, account: VastAccount) -> int:
    """Sync show_machines() enriched by search offers (machine_id filter).

    Returns the number of machines upserted.
    """
    client = _client_for(account)
    machines = client.show_machines()
    now = datetime.now(UTC)
    count = 0

    for m in machines:
        vast_machine_id = m.get("machine_id") or m.get("id")
        if vast_machine_id is None:
            continue

        # `show machines` is sparse — enrich with the matching offer row.
        offer = {}
        try:
            offers = client.search_offers(query=f"machine_id={vast_machine_id}", limit=10)
            if offers:
                offer = offers[0]
        except Exception as exc:  # noqa: BLE001
            logger.warning("offer enrichment failed for machine %s: %s", vast_machine_id, exc)

        # Bind the two source dicts at definition time (pick is called within
        # this same loop iteration, so capturing them as defaults is correct).
        def pick(key, *fallbacks, default=None, _sources=(m, offer)):
            for src in _sources:
                if key in src and src[key] is not None:
                    return src[key]
            for fb in fallbacks:
                for src in _sources:
                    if fb in src and src[fb] is not None:
                        return src[fb]
            return default

        machine = db.scalar(
            select(HostMachine).where(
                HostMachine.vast_account_id == account.id,
                HostMachine.machine_id == int(vast_machine_id),
            )
        )
        if machine is None:
            machine = HostMachine(
                vast_account_id=account.id, machine_id=int(vast_machine_id)
            )
            db.add(machine)

        machine.gpu_name = pick("gpu_name")
        machine.num_gpus = pick("num_gpus")
        machine.gpu_ram_mb = pick("gpu_ram")  # MB from REST
        machine.gpu_max_power_w = pick("gpu_max_power")
        machine.cpu_name = pick("cpu_name")
        machine.cpu_cores = pick("cpu_cores")
        machine.cpu_ram_mb = pick("cpu_ram")
        machine.disk_space_gb = pick("disk_space")
        machine.geolocation = pick("geolocation")
        machine.verified = pick("verified")
        machine.reliability = pick("reliability", "reliability2")
        machine.is_listed = bool(pick("listed", "rentable", default=False))
        machine.is_rentable = bool(pick("rentable", default=False))
        machine.current_price_gpu = pick("dph_base", "listed_gpu_cost_per_hour")
        machine.current_price_disk = pick("storage_cost", "price_disk")
        machine.min_bid_price = pick("min_bid")
        machine.offer_end_date = _ts(pick("end_date"))
        machine.last_seen_at = now
        db.flush()

        # Reliability history point.
        db.add(
            ReliabilityHistory(
                machine_id=machine.id,
                reliability=machine.reliability,
                is_listed=machine.is_listed,
                is_rentable=machine.is_rentable,
            )
        )

        # Rental contract: if the offer reports rented, ensure an active row.
        rented = bool(pick("rented", default=False))
        active = db.scalar(
            select(RentalContract).where(
                RentalContract.machine_id == machine.id,
                RentalContract.status == "active",
            )
        )
        if rented and active is None:
            db.add(
                RentalContract(
                    machine_id=machine.id,
                    rented_at=now,
                    locked_price_gpu=machine.current_price_gpu,
                    rental_type="on-demand",
                    num_gpus_rented=machine.num_gpus,
                    status="active",
                )
            )
        elif not rented and active is not None:
            active.status = "ended"
            active.ended_at = now

        count += 1

    account.last_synced_at = now
    db.commit()
    logger.info("fleet_sync: %s machines for account %s", count, account.id)
    return count


def earnings_sync(db: Session, account: VastAccount, last_days: int = 90) -> int:
    """Sync show_earnings(); upsert earnings_daily, update account_snapshots."""
    client = _client_for(account)
    data = client.show_earnings(last_days=last_days)
    if not isinstance(data, dict):
        logger.warning("earnings_sync: unexpected payload type %s", type(data))
        return 0

    # Map Vast machine_id -> our host_machines.id
    machine_map = {
        hm.machine_id: hm.id
        for hm in db.scalars(
            select(HostMachine).where(HostMachine.vast_account_id == account.id)
        )
    }

    rows = 0
    for day in data.get("per_day", []) or []:
        unix_day = day.get("day")
        if unix_day is None:
            continue
        earn_date = date.fromtimestamp(int(unix_day) * 86400) if int(unix_day) < 10**6 else _ts(
            unix_day
        ).date()
        # per_day rows in Vast are account-wide; attribute to a NULL machine.
        existing = db.scalar(
            select(EarningsDaily).where(
                EarningsDaily.vast_account_id == account.id,
                EarningsDaily.machine_id.is_(None),
                EarningsDaily.earn_date == earn_date,
            )
        )
        if existing is None:
            existing = EarningsDaily(
                vast_account_id=account.id, machine_id=None, earn_date=earn_date
            )
            db.add(existing)
        existing.gpu_earn = day.get("gpu_earn", 0) or 0
        existing.storage_earn = day.get("sto_earn", 0) or 0
        existing.bw_upload_earn = day.get("bwu_earn", 0) or 0
        existing.bw_download_earn = day.get("bwd_earn", 0) or 0
        rows += 1

    # Per-machine totals -> attribute to today's date keyed by machine.
    today = datetime.now(UTC).date()
    for pm in data.get("per_machine", []) or []:
        vast_mid = pm.get("machine_id")
        our_id = machine_map.get(vast_mid)
        if our_id is None:
            continue
        existing = db.scalar(
            select(EarningsDaily).where(
                EarningsDaily.machine_id == our_id,
                EarningsDaily.earn_date == today,
            )
        )
        if existing is None:
            existing = EarningsDaily(
                vast_account_id=account.id, machine_id=our_id, earn_date=today
            )
            db.add(existing)
        existing.gpu_earn = pm.get("gpu_earn", 0) or 0
        existing.storage_earn = pm.get("sto_earn", 0) or 0
        existing.bw_upload_earn = pm.get("bwu_earn", 0) or 0
        existing.bw_download_earn = pm.get("bwd_earn", 0) or 0
        rows += 1

    current = data.get("current", {}) or {}
    if current:
        db.add(
            AccountSnapshot(
                vast_account_id=account.id,
                balance=current.get("balance"),
                service_fee=current.get("service_fee"),
                total_credit=current.get("credit"),
            )
        )
        if current.get("balance") is not None:
            account.account_balance = current["balance"]

    account.last_synced_at = datetime.now(UTC)
    db.commit()
    logger.info("earnings_sync: %s rows for account %s", rows, account.id)
    return rows
