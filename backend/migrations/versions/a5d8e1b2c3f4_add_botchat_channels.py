"""Add botchat_channels table.

Revision ID: a5d8e1b2c3f4
Revises: c2e9f1a6d4b8
Create Date: 2026-03-12

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "a5d8e1b2c3f4"
down_revision = "c2e9f1a6d4b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "botchat_channels",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("board_id", sa.Uuid(), nullable=False),
        sa.Column("agent_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["board_id"], ["boards.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_botchat_channels_organization_id"),
        "botchat_channels",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_botchat_channels_board_id"),
        "botchat_channels",
        ["board_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_botchat_channels_agent_id"),
        "botchat_channels",
        ["agent_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_botchat_channels_name"),
        "botchat_channels",
        ["name"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_botchat_channels_name"), table_name="botchat_channels")
    op.drop_index(op.f("ix_botchat_channels_agent_id"), table_name="botchat_channels")
    op.drop_index(op.f("ix_botchat_channels_board_id"), table_name="botchat_channels")
    op.drop_index(op.f("ix_botchat_channels_organization_id"), table_name="botchat_channels")
    op.drop_table("botchat_channels")
