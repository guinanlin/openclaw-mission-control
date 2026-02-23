"""Add agent_channel_configs table.

Revision ID: e8f3a2b1c5d6
Revises: d4e8f2a1b5c9
Create Date: 2026-02-23

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "e8f3a2b1c5d6"
down_revision = "d4e8f2a1b5c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_channel_configs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("agent_id", sa.Uuid(), nullable=False),
        sa.Column("gateway_id", sa.Uuid(), nullable=False),
        sa.Column("channel_type", sa.String(), nullable=False),
        sa.Column("account_id", sa.String(), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["gateway_id"], ["gateways.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_agent_channel_configs_agent_id"),
        "agent_channel_configs",
        ["agent_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_agent_channel_configs_gateway_id"),
        "agent_channel_configs",
        ["gateway_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_agent_channel_configs_channel_type"),
        "agent_channel_configs",
        ["channel_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_agent_channel_configs_account_id"),
        "agent_channel_configs",
        ["account_id"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_agent_channel_configs_agent_channel",
        "agent_channel_configs",
        ["agent_id", "channel_type"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_agent_channel_configs_agent_channel",
        "agent_channel_configs",
        type_="unique",
    )
    op.drop_index(
        op.f("ix_agent_channel_configs_account_id"),
        table_name="agent_channel_configs",
    )
    op.drop_index(
        op.f("ix_agent_channel_configs_channel_type"),
        table_name="agent_channel_configs",
    )
    op.drop_index(
        op.f("ix_agent_channel_configs_gateway_id"),
        table_name="agent_channel_configs",
    )
    op.drop_index(
        op.f("ix_agent_channel_configs_agent_id"),
        table_name="agent_channel_configs",
    )
    op.drop_table("agent_channel_configs")
