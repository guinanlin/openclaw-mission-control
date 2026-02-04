"""Add agent identity profile.

Revision ID: f7b3d0a1c9e2
Revises: c1c8b3b9f4d1
Create Date: 2026-02-04 22:45:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "f7b3d0a1c9e2"
down_revision = "c1c8b3b9f4d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "agents",
        sa.Column("identity_profile", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("agents", "identity_profile")
