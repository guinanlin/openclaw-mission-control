"""add approvals task_id

Revision ID: 1d844b04ee06
Revises: a5aab244d32d
Create Date: 2026-02-06 17:26:43.336466

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "1d844b04ee06"
down_revision = "a5aab244d32d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # This migration may run in databases where the column/index/constraint were created via
    # SQLModel `create_all()` (or a previous hotfix). Make it idempotent to avoid blocking
    # upgrades in dev environments.
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    approval_cols = {c["name"] for c in inspector.get_columns("approvals")}
    if "task_id" not in approval_cols:
        op.add_column("approvals", sa.Column("task_id", sa.Uuid(), nullable=True))

    approval_index_names = {i["name"] for i in inspector.get_indexes("approvals")}
    if "ix_approvals_task_id" not in approval_index_names:
        op.create_index("ix_approvals_task_id", "approvals", ["task_id"], unique=False)

    # Backfill from legacy JSON payload keys when they contain a valid UUID.
    op.execute(
        """
        WITH src AS (
          SELECT
            id,
            COALESCE(
              payload->>'task_id',
              payload->>'taskId',
              payload->>'taskID'
            ) AS task_id_str
          FROM approvals
          WHERE task_id IS NULL
        ),
        valid AS (
          SELECT
            id,
            task_id_str::uuid AS task_id
          FROM src
          WHERE task_id_str ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        ),
        existing AS (
          SELECT v.id, v.task_id
          FROM valid AS v
          JOIN tasks AS t ON t.id = v.task_id
        )
        UPDATE approvals AS a
        SET task_id = existing.task_id
        FROM existing
        WHERE a.id = existing.id;
        """
    )

    # Avoid FK failures if any approvals point at deleted tasks.
    op.execute(
        """
        UPDATE approvals AS a
        SET task_id = NULL
        WHERE task_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM tasks AS t WHERE t.id = a.task_id
          );
        """
    )

    approval_fks = inspector.get_foreign_keys("approvals")
    has_task_fk = any(
        (fk.get("referred_table") == "tasks" and "task_id" in (fk.get("constrained_columns") or []))
        for fk in approval_fks
    )
    if not has_task_fk:
        op.create_foreign_key(
            "fk_approvals_task_id_tasks",
            "approvals",
            "tasks",
            ["task_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    op.drop_constraint("fk_approvals_task_id_tasks", "approvals", type_="foreignkey")
    op.drop_index("ix_approvals_task_id", table_name="approvals")
    op.drop_column("approvals", "task_id")
