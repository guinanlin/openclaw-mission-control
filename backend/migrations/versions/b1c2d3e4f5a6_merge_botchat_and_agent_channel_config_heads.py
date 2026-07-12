"""Merge heads: botchat_channels and agent_channel_configs branches.

Revision ID: b1c2d3e4f5a6
Revises: a5d8e1b2c3f4, e8f3a2b1c5d6
Create Date: 2026-03-12

"""

from __future__ import annotations

from alembic import op

revision = "b1c2d3e4f5a6"
down_revision = ("a5d8e1b2c3f4", "e8f3a2b1c5d6")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
