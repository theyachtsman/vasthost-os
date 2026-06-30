"""admin must_change_password flag

Additive. Seeded admins get a temp password and are forced to set their own on
first login, so a real admin password never lives in .env.

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-30
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "admin_users",
        sa.Column(
            "must_change_password",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("admin_users", "must_change_password")
