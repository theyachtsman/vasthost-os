"""Offer Management — backfill / default job (defjob) config

Vast's "default job" lets a host configure a background container that
launches automatically whenever a machine is idle, priced by the host —
effectively self-renting idle GPU time instead of earning nothing. Confirmed
against the installed vastai SDK (1.1.3, see services/vast_client.py):
PUT /machines/create_bids/ to set, DELETE /machines/{id}/defjob/ to remove.
Adds the same config surface to both real machines and simulated rigs.

Revision ID: 0010
Revises: 0009
Create Date: 2026-07-01
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = ("host_machines", "simulated_hosts")


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(
            table,
            sa.Column("defjob_enabled", sa.Boolean, nullable=False, server_default="false"),
        )
        op.add_column(table, sa.Column("defjob_image", sa.String, nullable=True))
        op.add_column(table, sa.Column("defjob_price_gpu", sa.Numeric(10, 6), nullable=True))
        op.add_column(table, sa.Column("defjob_price_inetu", sa.Numeric(10, 6), nullable=True))
        op.add_column(table, sa.Column("defjob_price_inetd", sa.Numeric(10, 6), nullable=True))
        op.add_column(table, sa.Column("defjob_args", sa.String, nullable=True))


def downgrade() -> None:
    for table in _TABLES:
        op.drop_column(table, "defjob_args")
        op.drop_column(table, "defjob_price_inetd")
        op.drop_column(table, "defjob_price_inetu")
        op.drop_column(table, "defjob_price_gpu")
        op.drop_column(table, "defjob_image")
        op.drop_column(table, "defjob_enabled")
