"""add board memory is_chat

Revision ID: a5aab244d32d
Revises: 3b9b2f1a6c2d
Create Date: 2026-02-06 17:57:02.110572

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a5aab244d32d"
down_revision = "3b9b2f1a6c2d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent: the column/indexes might already exist if the table was created via
    # SQLModel `create_all()`.
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    memory_cols = {c["name"] for c in inspector.get_columns("board_memory")}
    if "is_chat" not in memory_cols:
        op.add_column(
            "board_memory",
            sa.Column("is_chat", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        )

    memory_index_names = {i["name"] for i in inspector.get_indexes("board_memory")}
    if "ix_board_memory_is_chat" not in memory_index_names:
        op.create_index("ix_board_memory_is_chat", "board_memory", ["is_chat"], unique=False)
    if "ix_board_memory_board_id_is_chat_created_at" not in memory_index_names:
        op.create_index(
            "ix_board_memory_board_id_is_chat_created_at",
            "board_memory",
            ["board_id", "is_chat", "created_at"],
            unique=False,
        )

    # Backfill from existing tags arrays.
    op.execute(
        """
        UPDATE board_memory
        SET is_chat = TRUE
        WHERE tags IS NOT NULL
          AND tags::jsonb @> '["chat"]'::jsonb;
        """
    )


def downgrade() -> None:
    op.drop_index("ix_board_memory_board_id_is_chat_created_at", table_name="board_memory")
    op.drop_index("ix_board_memory_is_chat", table_name="board_memory")
    op.drop_column("board_memory", "is_chat")
