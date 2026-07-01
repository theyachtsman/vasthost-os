"""align simulated-host service fee default with MARKET_FEE_PCT

The simulator's per-rig ``vast_service_fee_pct`` is a legitimate override, but the
column's old server_default (0.20, from 0001) and any rows still carrying that
*stale seed default* disagreed with the platform fee constant (MARKET_FEE_PCT =
0.25) now used for the break-even estimate — so the same rig could show two
different "net" numbers. This realigns the legacy default: rows still at exactly
0.20 (the old server_default, never a deliberate user choice) move to 0.25, and
the column default follows. Deliberately-set values other than 0.20 are untouched;
per-rig override remains a feature.

Keep in sync with ``settings.MARKET_FEE_PCT``; this migration encodes the value
at the time of writing (0.25).

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-30
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_DEFAULT = "0.20"
NEW_DEFAULT = "0.25"


def upgrade() -> None:
    op.execute(
        "UPDATE simulated_hosts SET vast_service_fee_pct = 0.25 "
        "WHERE vast_service_fee_pct = 0.20"
    )
    op.alter_column(
        "simulated_hosts",
        "vast_service_fee_pct",
        server_default=NEW_DEFAULT,
    )


def downgrade() -> None:
    op.alter_column(
        "simulated_hosts",
        "vast_service_fee_pct",
        server_default=OLD_DEFAULT,
    )
    op.execute(
        "UPDATE simulated_hosts SET vast_service_fee_pct = 0.20 "
        "WHERE vast_service_fee_pct = 0.25"
    )
