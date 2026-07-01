"""Alerting — configurable per-user thresholds + simulated rig alert fields

A full alert suite: offer expiring, idle too long, rented too long, and
offline/unlisted — each independently toggleable with its own threshold
(idle/rented/expiry), scoped globally per user (one row in alert_settings).

Simulated hosts gain the bookkeeping real machines already have via
RentalContract: rented_since/idle_since to compute idle/rented duration, and
offer_end_date to test the expiry alert in the sandbox.

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)
GEN_UUID = sa.text("gen_random_uuid()")
NOW = sa.text("now()")


def upgrade() -> None:
    op.add_column(
        "simulated_hosts", sa.Column("rented_since", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "simulated_hosts", sa.Column("idle_since", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "simulated_hosts", sa.Column("offer_end_date", sa.DateTime(timezone=True), nullable=True)
    )

    op.create_table(
        "alert_settings",
        sa.Column("id", UUID, primary_key=True, server_default=GEN_UUID),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id"), nullable=False, unique=True),
        sa.Column("offer_expiry_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("offer_expiry_threshold_hours", sa.Integer, nullable=False, server_default="48"),
        sa.Column("idle_enabled", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("idle_threshold_hours", sa.Integer, nullable=False, server_default="4"),
        sa.Column("rented_enabled", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("rented_threshold_hours", sa.Integer, nullable=False, server_default="24"),
        sa.Column("offline_enabled", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=NOW),
    )


def downgrade() -> None:
    op.drop_table("alert_settings")
    op.drop_column("simulated_hosts", "offer_end_date")
    op.drop_column("simulated_hosts", "idle_since")
    op.drop_column("simulated_hosts", "rented_since")
