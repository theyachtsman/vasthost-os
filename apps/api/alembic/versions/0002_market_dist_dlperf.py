"""add dlperf + perf-per-dollar to market_distributions

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-27
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("market_distributions", sa.Column("dlperf", sa.Numeric(10, 4)))
    op.add_column(
        "market_distributions", sa.Column("dlperf_per_dphtotal", sa.Numeric(10, 4))
    )


def downgrade() -> None:
    op.drop_column("market_distributions", "dlperf_per_dphtotal")
    op.drop_column("market_distributions", "dlperf")
