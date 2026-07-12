"""Add local_auth_users table for username/password + bound token.

Revision ID: d5e9f2b2c6c0
Revises: c7d2e8f1a3b5
Create Date: 2026-03-12

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "d5e9f2b2c6c0"
down_revision = "c7d2e8f1a3b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "local_auth_users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("bound_access_token", sa.String(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_local_auth_users_username"),
        "local_auth_users",
        ["username"],
        unique=True,
    )
    op.create_index(
        op.f("ix_local_auth_users_bound_access_token"),
        "local_auth_users",
        ["bound_access_token"],
        unique=True,
    )
    op.create_index(
        op.f("ix_local_auth_users_user_id"),
        "local_auth_users",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_local_auth_users_user_id"),
        table_name="local_auth_users",
    )
    op.drop_index(
        op.f("ix_local_auth_users_bound_access_token"),
        table_name="local_auth_users",
    )
    op.drop_index(
        op.f("ix_local_auth_users_username"),
        table_name="local_auth_users",
    )
    op.drop_table("local_auth_users")
