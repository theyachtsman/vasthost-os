"""rental-aware pricing — simulate Vast's price-lock behavior on sandbox rigs

On Vast, changing your price re-lists your offer immediately, but it can never
retroactively change an already-active rental's locked price — that renter
keeps paying the rate they started at until their rental ends (verified
against Vast's hosting docs). Real machines already model this correctly via
RentalContract.locked_price_gpu, which the pricing-apply route never touches.
Simulated hosts had no equivalent concept at all, so this adds one:
rented_until / locked_price_gpu, set together by a new simulate-rental route.

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-01
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "simulated_hosts", sa.Column("rented_until", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "simulated_hosts", sa.Column("locked_price_gpu", sa.Numeric(10, 6), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("simulated_hosts", "locked_price_gpu")
    op.drop_column("simulated_hosts", "rented_until")
