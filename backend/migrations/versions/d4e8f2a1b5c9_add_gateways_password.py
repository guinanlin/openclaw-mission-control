"""Add password field to gateways.

Revision ID: d4e8f2a1b5c9
Revises: b7a1d9c3e4f5
Create Date: 2026-02-20 00:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "d4e8f2a1b5c9"
down_revision = "b7a1d9c3e4f5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add optional gateway password column for password auth mode."""
    op.add_column(
        "gateways",
        sa.Column("password", sa.String(), nullable=True),
    )


def downgrade() -> None:
    """Remove gateway password column."""
    op.drop_column("gateways", "password")
