"""fix: cascade-delete price_change_events when a simulated rig is deleted

price_change_events.simulated_host_id was added in 0008 without ON DELETE
CASCADE, so the DB default (RESTRICT) blocks deleting any simulated rig that
has price history — which, once autopilot/manual-apply/bulk-apply write
history, is every rig. DELETE /simulator/hosts/{id} was 500ing on the FK
violation. Sandbox history has no audit requirement past the rig's own
lifetime, so cascading the delete is correct (unlike the real machine_id FK,
which stays RESTRICT — a real machine's price history is a genuine audit
trail and machines aren't user-deletable anyway).

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-01
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        "price_change_events_simulated_host_id_fkey", "price_change_events", type_="foreignkey"
    )
    op.create_foreign_key(
        "price_change_events_simulated_host_id_fkey",
        "price_change_events",
        "simulated_hosts",
        ["simulated_host_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "price_change_events_simulated_host_id_fkey", "price_change_events", type_="foreignkey"
    )
    op.create_foreign_key(
        "price_change_events_simulated_host_id_fkey",
        "price_change_events",
        "simulated_hosts",
        ["simulated_host_id"],
        ["id"],
    )
