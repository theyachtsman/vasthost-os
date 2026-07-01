"""auth, two-key model, multi-market seam, simulator marker

Additive migration. Creates the auth + provider-key tables, adds the
multi-tenant owner column to the private fleet/earnings/account tables, adds the
``market_source`` forward seam to the public Observer tables, and the
``is_simulated`` marker to simulated rigs. Touches NO existing data destructively
— every change is a new table, a new nullable column, or a new column with a
safe server default. The 0001/0002 tables and their accrued rows are preserved.

Zero-gap Observer: if a legacy ``vast_accounts`` key exists, it is copied into
``platform_provider_keys`` so the Observer keeps polling with no interruption the
moment this migration lands (the encryption uses the same SECRET_KEY, so the
ciphertext is portable).

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)
GEN_UUID = sa.text("gen_random_uuid()")
NOW = sa.text("now()")


def upgrade() -> None:
    # ── users / admins ─────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("email", sa.Text, nullable=False, unique=True),
        sa.Column("password_hash", sa.Text, nullable=False),
        sa.Column("display_name", sa.Text),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=NOW),
    )
    op.create_table(
        "admin_users",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("email", sa.Text, nullable=False, unique=True),
        sa.Column("password_hash", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW),
    )

    # ── sessions ───────────────────────────────────────────────
    op.create_table(
        "sessions",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("token_hash", sa.Text, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW),
    )
    op.create_index("ix_sessions_token_hash", "sessions", ["token_hash"])
    op.create_table(
        "admin_sessions",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("admin_user_id", UUID, sa.ForeignKey("admin_users.id", ondelete="CASCADE")),
        sa.Column("token_hash", sa.Text, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW),
    )
    op.create_index("ix_admin_sessions_token_hash", "admin_sessions", ["token_hash"])

    # ── platform_provider_keys ─────────────────────────────────
    op.create_table(
        "platform_provider_keys",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("provider", sa.Text, nullable=False),
        sa.Column("encrypted_api_key", sa.Text, nullable=False),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("added_by_admin_id", UUID, sa.ForeignKey("admin_users.id")),
        sa.Column("last_validated_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW),
        sa.UniqueConstraint("provider", name="uq_platform_provider"),
    )

    # ── user_provider_keys ─────────────────────────────────────
    op.create_table(
        "user_provider_keys",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("provider", sa.Text, nullable=False),
        sa.Column("encrypted_api_key", sa.Text, nullable=False),
        sa.Column("detected_scopes", postgresql.JSONB),
        sa.Column("vast_user_id", sa.Integer),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("last_validated_at", sa.DateTime(timezone=True)),
        sa.Column("last_synced_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=NOW),
        sa.UniqueConstraint("user_id", "provider", name="uq_user_provider"),
    )

    # ── key_access_audit ───────────────────────────────────────
    op.create_table(
        "key_access_audit",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id")),
        sa.Column("provider", sa.Text),
        sa.Column("action", sa.Text),
        sa.Column("performed_at", sa.DateTime(timezone=True), server_default=NOW),
        sa.Column("success", sa.Boolean),
        sa.Column("error_message", sa.Text),
    )
    op.create_index("ix_key_access_audit_user", "key_access_audit", ["user_id", "performed_at"])

    # ── user_entitlements ──────────────────────────────────────
    op.create_table(
        "user_entitlements",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("feature", sa.Text, nullable=False),
        sa.Column("enabled", sa.Boolean, server_default=sa.text("true")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=NOW),
        sa.UniqueConstraint("user_id", "feature", name="uq_user_entitlement"),
    )

    # ── ownership column on the private pool (nullable; backfilled at connect) ─
    for table in ("host_machines", "earnings_daily", "account_snapshots"):
        op.add_column(
            table,
            sa.Column(
                "user_provider_key_id",
                UUID,
                sa.ForeignKey("user_provider_keys.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
    op.create_index(
        "ix_host_machines_user_key", "host_machines", ["user_provider_key_id", "machine_id"]
    )

    # ── multi-market forward seam on the PUBLIC Observer tables ─
    for table in ("offer_snapshots", "clearing_events", "market_distributions"):
        op.add_column(
            table,
            sa.Column(
                "market_source",
                sa.Text,
                nullable=False,
                server_default="vast",
            ),
        )

    # ── simulator real/simulated marker ────────────────────────
    op.add_column(
        "simulated_hosts",
        sa.Column("is_simulated", sa.Boolean, nullable=False, server_default=sa.text("true")),
    )

    # ── zero-gap Observer: seed the platform key from a legacy account ──
    op.execute(
        """
        INSERT INTO platform_provider_keys (provider, encrypted_api_key, is_active)
        SELECT 'vast', vast_api_key, true
          FROM vast_accounts
         WHERE is_active = true
         ORDER BY connected_at ASC
         LIMIT 1
        ON CONFLICT ON CONSTRAINT uq_platform_provider DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_column("simulated_hosts", "is_simulated")
    for table in ("market_distributions", "clearing_events", "offer_snapshots"):
        op.drop_column(table, "market_source")
    op.drop_index("ix_host_machines_user_key", table_name="host_machines")
    for table in ("account_snapshots", "earnings_daily", "host_machines"):
        op.drop_column(table, "user_provider_key_id")
    op.drop_table("user_entitlements")
    op.drop_index("ix_key_access_audit_user", table_name="key_access_audit")
    op.drop_table("key_access_audit")
    op.drop_table("user_provider_keys")
    op.drop_table("platform_provider_keys")
    op.drop_index("ix_admin_sessions_token_hash", table_name="admin_sessions")
    op.drop_table("admin_sessions")
    op.drop_index("ix_sessions_token_hash", table_name="sessions")
    op.drop_table("sessions")
    op.drop_table("admin_users")
    op.drop_table("users")
