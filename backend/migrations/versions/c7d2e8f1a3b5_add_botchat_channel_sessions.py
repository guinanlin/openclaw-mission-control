"""Add botchat_channel_sessions table for persisted Session 2+.

Revision ID: c7d2e8f1a3b5
Revises: b1c2d3e4f5a6
Create Date: 2026-03-12

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "c7d2e8f1a3b5"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "botchat_channel_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("channel_id", sa.Uuid(), nullable=False),
        sa.Column("session_key", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False, server_default="Session"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["channel_id"], ["botchat_channels.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_botchat_channel_sessions_channel_id"),
        "botchat_channel_sessions",
        ["channel_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_botchat_channel_sessions_session_key"),
        "botchat_channel_sessions",
        ["session_key"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_botchat_channel_sessions_session_key"),
        table_name="botchat_channel_sessions",
    )
    op.drop_index(
        op.f("ix_botchat_channel_sessions_channel_id"),
        table_name="botchat_channel_sessions",
    )
    op.drop_table("botchat_channel_sessions")
