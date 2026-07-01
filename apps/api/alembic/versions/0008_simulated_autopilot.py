"""Phase 2 — bounded auto-repricing rails for simulated hosts

Adds opt-in autopilot to simulated_hosts (off by default) plus the user-set
rails it must stay within, and lets price_change_events log against a
simulated_host in addition to a real host_machines row — reusing the existing
audit/history table rather than duplicating it. Exactly one of machine_id /
simulated_host_id is set per row (enforced in application code, not a DB
constraint, to match the existing nullable machine_id column).

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.add_column(
        "simulated_hosts",
        sa.Column("autopilot_enabled", sa.Boolean, nullable=False, server_default="false"),
    )
    op.add_column("simulated_hosts", sa.Column("min_price_gpu", sa.Numeric(10, 6), nullable=True))
    op.add_column("simulated_hosts", sa.Column("max_price_gpu", sa.Numeric(10, 6), nullable=True))

    op.add_column(
        "price_change_events",
        sa.Column(
            "simulated_host_id", UUID, sa.ForeignKey("simulated_hosts.id"), nullable=True
        ),
    )
    op.create_index(
        "ix_price_change_events_simulated_host",
        "price_change_events",
        ["simulated_host_id", "changed_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_price_change_events_simulated_host", table_name="price_change_events")
    op.drop_column("price_change_events", "simulated_host_id")
    op.drop_column("simulated_hosts", "max_price_gpu")
    op.drop_column("simulated_hosts", "min_price_gpu")
    op.drop_column("simulated_hosts", "autopilot_enabled")
