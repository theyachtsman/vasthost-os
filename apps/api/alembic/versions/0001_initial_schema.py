"""initial schema — all Phase 0 tables

Revision ID: 0001
Revises:
Create Date: 2026-06-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)
GEN_UUID = sa.text("gen_random_uuid()")
NOW = sa.text("now()")


def upgrade() -> None:
    # ── vast_accounts ──────────────────────────────────────────
    op.create_table(
        "vast_accounts",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("vast_api_key", sa.Text, nullable=False),
        sa.Column("vast_user_id", sa.Integer),
        sa.Column("email", sa.Text),
        sa.Column("display_name", sa.Text),
        sa.Column("account_balance", sa.Numeric(10, 4)),
        sa.Column("connected_at", sa.DateTime(timezone=True), server_default=NOW),
        sa.Column("last_synced_at", sa.DateTime(timezone=True)),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
    )

    # ── host_machines ──────────────────────────────────────────
    op.create_table(
        "host_machines",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("vast_account_id", UUID, sa.ForeignKey("vast_accounts.id")),
        sa.Column("machine_id", sa.Integer, nullable=False),
        sa.Column("gpu_name", sa.Text),
        sa.Column("num_gpus", sa.Integer),
        sa.Column("gpu_ram_mb", sa.Integer),
        sa.Column("gpu_max_power_w", sa.Integer),
        sa.Column("cpu_name", sa.Text),
        sa.Column("cpu_cores", sa.Integer),
        sa.Column("cpu_ram_mb", sa.Integer),
        sa.Column("disk_space_gb", sa.Numeric(10, 2)),
        sa.Column("geolocation", sa.Text),
        sa.Column("verified", sa.Text),
        sa.Column("reliability", sa.Numeric(5, 4)),
        sa.Column("is_listed", sa.Boolean),
        sa.Column("is_rentable", sa.Boolean),
        sa.Column("current_price_gpu", sa.Numeric(10, 6)),
        sa.Column("current_price_disk", sa.Numeric(10, 6)),
        sa.Column("current_price_inetu", sa.Numeric(10, 6)),
        sa.Column("current_price_inetd", sa.Numeric(10, 6)),
        sa.Column("min_bid_price", sa.Numeric(10, 6)),
        sa.Column("offer_end_date", sa.DateTime(timezone=True)),
        sa.Column("last_seen_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=NOW),
    )
    op.create_index(
        "ix_host_machines_account_machine",
        "host_machines",
        ["vast_account_id", "machine_id"],
    )

    # ── rental_contracts ───────────────────────────────────────
    op.create_table(
        "rental_contracts",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("machine_id", UUID, sa.ForeignKey("host_machines.id")),
        sa.Column("vast_contract_id", sa.Integer),
        sa.Column("rented_at", sa.DateTime(timezone=True)),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("locked_price_gpu", sa.Numeric(10, 6)),
        sa.Column("rental_type", sa.Text),
        sa.Column("num_gpus_rented", sa.Integer),
        sa.Column("status", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW),
    )

    # ── reliability_history ────────────────────────────────────
    op.create_table(
        "reliability_history",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("machine_id", UUID, sa.ForeignKey("host_machines.id")),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=NOW),
        sa.Column("reliability", sa.Numeric(5, 4)),
        sa.Column("is_listed", sa.Boolean),
        sa.Column("is_rentable", sa.Boolean),
    )

    # ── earnings_daily ─────────────────────────────────────────
    op.create_table(
        "earnings_daily",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("vast_account_id", UUID, sa.ForeignKey("vast_accounts.id")),
        sa.Column("machine_id", UUID, sa.ForeignKey("host_machines.id")),
        sa.Column("earn_date", sa.Date, nullable=False),
        sa.Column("gpu_earn", sa.Numeric(10, 6)),
        sa.Column("storage_earn", sa.Numeric(10, 6)),
        sa.Column("bw_upload_earn", sa.Numeric(10, 6)),
        sa.Column("bw_download_earn", sa.Numeric(10, 6)),
        sa.Column(
            "total_earn",
            sa.Numeric(10, 6),
            sa.Computed(
                "COALESCE(gpu_earn,0) + COALESCE(storage_earn,0) "
                "+ COALESCE(bw_upload_earn,0) + COALESCE(bw_download_earn,0)",
                persisted=True,
            ),
        ),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=NOW),
        sa.UniqueConstraint("machine_id", "earn_date", name="uq_earnings_machine_day"),
    )

    # ── account_snapshots ──────────────────────────────────────
    op.create_table(
        "account_snapshots",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("vast_account_id", UUID, sa.ForeignKey("vast_accounts.id")),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=NOW),
        sa.Column("balance", sa.Numeric(10, 4)),
        sa.Column("service_fee", sa.Numeric(10, 4)),
        sa.Column("total_credit", sa.Numeric(10, 4)),
    )

    # ── cost_config ────────────────────────────────────────────
    op.create_table(
        "cost_config",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("vast_account_id", UUID, sa.ForeignKey("vast_accounts.id")),
        sa.Column("machine_id", UUID, sa.ForeignKey("host_machines.id")),
        sa.Column("kwh_rate", sa.Numeric(8, 4)),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=NOW),
    )

    # ── offer_snapshots (PUBLIC) ───────────────────────────────
    op.create_table(
        "offer_snapshots",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("offer_id", sa.Integer, nullable=False),
        sa.Column("machine_id", sa.Integer),
        sa.Column("gpu_name", sa.Text, nullable=False),
        sa.Column("num_gpus", sa.Integer),
        sa.Column("gpu_ram_mb", sa.Integer),
        sa.Column("gpu_max_power_w", sa.Integer),
        sa.Column("reliability", sa.Numeric(5, 4)),
        sa.Column("verified", sa.Text),
        sa.Column("geolocation", sa.Text),
        sa.Column("price_gpu", sa.Numeric(10, 6)),
        sa.Column("price_disk", sa.Numeric(10, 6)),
        sa.Column("price_inetu", sa.Numeric(10, 6)),
        sa.Column("price_inetd", sa.Numeric(10, 6)),
        sa.Column("dph_total", sa.Numeric(10, 6)),
        sa.Column("dlperf", sa.Numeric(10, 4)),
        sa.Column("dlperf_per_dphtotal", sa.Numeric(10, 4)),
        sa.Column("rentable", sa.Boolean),
        sa.Column("rented", sa.Boolean),
        sa.Column("num_gpus_available", sa.Integer),
        sa.Column("end_date", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "ix_offer_snapshots_bucket",
        "offer_snapshots",
        ["gpu_name", "num_gpus", "observed_at"],
    )
    op.create_index("ix_offer_snapshots_offer_id", "offer_snapshots", ["offer_id"])

    # ── clearing_events (PUBLIC) ───────────────────────────────
    op.create_table(
        "clearing_events",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("offer_id", sa.Integer, nullable=False),
        sa.Column("gpu_name", sa.Text),
        sa.Column("num_gpus", sa.Integer),
        sa.Column("verified", sa.Text),
        sa.Column("geolocation", sa.Text),
        sa.Column("last_price_gpu", sa.Numeric(10, 6)),
        sa.Column("dwell_minutes", sa.Integer),
        sa.Column("is_partial_fill", sa.Boolean, server_default=sa.text("false")),
        sa.Column("confidence", sa.Text, server_default="MEDIUM"),
    )
    op.create_index(
        "ix_clearing_events_bucket",
        "clearing_events",
        ["gpu_name", "num_gpus", "detected_at"],
    )

    # ── market_distributions (PUBLIC) ──────────────────────────
    op.create_table(
        "market_distributions",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("gpu_name", sa.Text, nullable=False),
        sa.Column("num_gpus", sa.Integer, nullable=False),
        sa.Column("verified", sa.Text),
        sa.Column("geolocation", sa.Text),
        sa.Column("p10_price", sa.Numeric(10, 6)),
        sa.Column("p25_price", sa.Numeric(10, 6)),
        sa.Column("p50_price", sa.Numeric(10, 6)),
        sa.Column("p75_price", sa.Numeric(10, 6)),
        sa.Column("p90_price", sa.Numeric(10, 6)),
        sa.Column("supply_count", sa.Integer),
        sa.Column("rented_count", sa.Integer),
        sa.Column("utilization_pct", sa.Numeric(5, 2)),
        sa.Column("clearing_rate_1h", sa.Numeric(5, 4)),
        sa.Column("clearing_rate_24h", sa.Numeric(5, 4)),
    )
    op.create_index(
        "ix_market_distributions_bucket",
        "market_distributions",
        ["gpu_name", "num_gpus", "computed_at"],
    )

    # ── price_change_events ────────────────────────────────────
    op.create_table(
        "price_change_events",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=NOW),
        sa.Column("machine_id", UUID, sa.ForeignKey("host_machines.id")),
        sa.Column("old_price_gpu", sa.Numeric(10, 6)),
        sa.Column("new_price_gpu", sa.Numeric(10, 6)),
        sa.Column("reason", sa.Text),
        sa.Column("market_dist_id", sa.BigInteger, sa.ForeignKey("market_distributions.id")),
        sa.Column("market_percentile", sa.Numeric(5, 2)),
        sa.Column("applied_to_vast", sa.Boolean, server_default=sa.text("false")),
        sa.Column("applied_at", sa.DateTime(timezone=True)),
        sa.Column("error_message", sa.Text),
    )

    # ── simulated_hosts ────────────────────────────────────────
    op.create_table(
        "simulated_hosts",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("name", sa.Text),
        sa.Column("gpu_name", sa.Text),
        sa.Column("num_gpus", sa.Integer),
        sa.Column("gpu_ram_mb", sa.Integer),
        sa.Column("gpu_max_power_w", sa.Integer),
        sa.Column("verified", sa.Text, server_default="unverified"),
        sa.Column("reliability", sa.Numeric(5, 4), server_default="0.90"),
        sa.Column("geolocation", sa.Text),
        sa.Column("kwh_rate", sa.Numeric(8, 4)),
        sa.Column("vast_service_fee_pct", sa.Numeric(5, 4), server_default="0.20"),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW),
    )

    # ── watched_classes ────────────────────────────────────────
    op.create_table(
        "watched_classes",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("gpu_name", sa.Text, nullable=False),
        sa.Column("num_gpus", sa.Integer, nullable=False, server_default="1"),
        sa.Column("geolocation", sa.Text),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW),
        sa.UniqueConstraint("gpu_name", "num_gpus", "geolocation", name="uq_watched_class"),
    )


def downgrade() -> None:
    for table in [
        "watched_classes",
        "simulated_hosts",
        "price_change_events",
        "market_distributions",
        "clearing_events",
        "offer_snapshots",
        "cost_config",
        "account_snapshots",
        "earnings_daily",
        "reliability_history",
        "rental_contracts",
        "host_machines",
        "vast_accounts",
    ]:
        op.drop_table(table)
