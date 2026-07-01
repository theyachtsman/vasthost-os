"""add current_price_gpu to simulated_hosts

The Pricing Control sandbox (for users testing recommendations before hosting a
real rig) needs an "asking price" on simulated rigs to recommend against and to
update on apply — mirrors host_machines.current_price_gpu. Nullable: a fresh rig
has no price until the user applies a recommendation or sets one. The apply path
is local-only (no Vast write), so this column is never touched outside this app.

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "simulated_hosts",
        sa.Column("current_price_gpu", sa.Numeric(10, 6), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("simulated_hosts", "current_price_gpu")
