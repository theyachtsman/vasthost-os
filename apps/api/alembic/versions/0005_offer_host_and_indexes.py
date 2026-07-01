"""offer host_id, clearing confidence_reason, distribution price_basis + index

Additive. Supports the Market Intelligence depth upgrades:
* offer_snapshots.host_id — tag each listing with its Vast host (multi-host seam)
* clearing_events.confidence_reason — human-readable "why this confidence"
* market_distributions.price_basis — 'ask' (available offers) vs 'last-rented'
  (fallback used when a size is fully rented so price is never blank)
* index on offer_snapshots(gpu_name, observed_at) — the per-server listings query
  and the fully-rented price fallback both scan latest snapshots per gpu_name

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-30
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("offer_snapshots", sa.Column("host_id", sa.Integer, nullable=True))
    op.add_column(
        "clearing_events", sa.Column("confidence_reason", sa.String, nullable=True)
    )
    op.add_column(
        "market_distributions",
        sa.Column(
            "price_basis",
            sa.String,
            nullable=False,
            server_default="ask",
        ),
    )
    op.create_index(
        "ix_offer_snapshots_gpu_observed",
        "offer_snapshots",
        ["gpu_name", "observed_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_offer_snapshots_gpu_observed", table_name="offer_snapshots")
    op.drop_column("market_distributions", "price_basis")
    op.drop_column("clearing_events", "confidence_reason")
    op.drop_column("offer_snapshots", "host_id")
