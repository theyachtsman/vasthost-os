"""Pydantic response/request schemas for the Phase 0 API surface."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Health ─────────────────────────────────────────────────────
class HealthComponent(BaseModel):
    status: str  # ok | error
    detail: str | None = None


class HealthResponse(BaseModel):
    status: str  # healthy | degraded
    components: dict[str, HealthComponent]
    time: datetime


# ── Account ────────────────────────────────────────────────────
class AccountConnectRequest(BaseModel):
    api_key: str = Field(min_length=8)


class AccountStatus(BaseModel):
    connected: bool
    vast_user_id: int | None = None
    email: str | None = None
    display_name: str | None = None
    account_balance: float | None = None
    last_synced_at: datetime | None = None
    connected_at: datetime | None = None
    api_key_masked: str | None = None


# ── Fleet ──────────────────────────────────────────────────────
class MachineOut(ORMModel):
    id: uuid.UUID
    machine_id: int
    gpu_name: str | None
    num_gpus: int | None
    gpu_ram_mb: int | None
    gpu_max_power_w: int | None
    cpu_name: str | None
    cpu_cores: int | None
    cpu_ram_mb: int | None
    disk_space_gb: float | None
    geolocation: str | None
    verified: str | None
    reliability: float | None
    is_listed: bool | None
    is_rentable: bool | None
    current_price_gpu: float | None
    min_bid_price: float | None
    offer_end_date: datetime | None
    last_seen_at: datetime | None


class ContractOut(ORMModel):
    id: uuid.UUID
    vast_contract_id: int | None
    rented_at: datetime | None
    ended_at: datetime | None
    locked_price_gpu: float | None
    rental_type: str | None
    num_gpus_rented: int | None
    status: str | None


class ReliabilityPointOut(ORMModel):
    recorded_at: datetime
    reliability: float | None
    is_listed: bool | None
    is_rentable: bool | None


class MachineDetail(MachineOut):
    contracts: list[ContractOut] = []
    reliability_history: list[ReliabilityPointOut] = []


# ── Earnings ───────────────────────────────────────────────────
class PerMachineEarning(BaseModel):
    machine_id: uuid.UUID | None
    vast_machine_id: int | None
    gpu_name: str | None
    gpu_earn: float
    storage_earn: float
    bw_earn: float
    total_earn: float
    est_power_cost: float | None = None
    net_margin: float | None = None


class EarningsSummary(BaseModel):
    total_gpu: float
    total_storage: float
    total_bw: float
    total_all: float
    service_fee: float | None
    balance: float | None
    all_time_total: float
    per_machine: list[PerMachineEarning]


class DailyEarningPoint(BaseModel):
    earn_date: date
    gpu_earn: float
    storage_earn: float
    bw_earn: float
    total_earn: float


# ── Market ─────────────────────────────────────────────────────
class DistributionOut(ORMModel):
    id: int
    computed_at: datetime
    gpu_name: str
    num_gpus: int
    verified: str | None
    geolocation: str | None
    p10_price: float | None
    p25_price: float | None
    p50_price: float | None
    p75_price: float | None
    p90_price: float | None
    supply_count: int | None
    rented_count: int | None
    utilization_pct: float | None
    clearing_rate_1h: float | None
    clearing_rate_24h: float | None


class ClearingEventOut(ORMModel):
    id: int
    detected_at: datetime
    offer_id: int
    gpu_name: str | None
    num_gpus: int | None
    verified: str | None
    geolocation: str | None
    last_price_gpu: float | None
    dwell_minutes: int | None
    is_partial_fill: bool
    confidence: str


class ObserverStatus(BaseModel):
    last_poll_at: datetime | None
    total_offer_snapshots: int
    total_clearing_events: int
    watched_classes: int
    poll_interval_seconds: int


# ── Simulator ──────────────────────────────────────────────────
class SimulatedHostIn(BaseModel):
    name: str | None = None
    gpu_name: str | None = None
    num_gpus: int | None = 1
    gpu_ram_mb: int | None = None
    gpu_max_power_w: int | None = None
    verified: str = "unverified"
    reliability: float = 0.90
    geolocation: str | None = None
    kwh_rate: float | None = None
    vast_service_fee_pct: float = 0.20
    is_active: bool = True


class SimulatedHostOut(SimulatedHostIn, ORMModel):
    id: uuid.UUID
    created_at: datetime
    break_even_floor: float | None = None


# ── Cost config ────────────────────────────────────────────────
class CostConfigIn(BaseModel):
    machine_id: uuid.UUID
    kwh_rate: float
    gpu_max_power_w: int | None = None  # optional override; persisted on machine


class CostConfigOut(ORMModel):
    id: uuid.UUID
    machine_id: uuid.UUID | None
    kwh_rate: float | None
    updated_at: datetime


# ── Watched classes ────────────────────────────────────────────
class WatchedClassIn(BaseModel):
    gpu_name: str
    num_gpus: int = 1
    geolocation: str | None = None


class WatchedClassOut(ORMModel):
    id: uuid.UUID
    gpu_name: str
    num_gpus: int
    geolocation: str | None
    is_active: bool
