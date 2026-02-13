"""add skills marketplace tables

Revision ID: c9d7e9b6a4f2
Revises: b6f4c7d9e1a2
Create Date: 2026-02-13 00:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision = "c9d7e9b6a4f2"
down_revision = "b6f4c7d9e1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "marketplace_skills",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("source_url", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id",
            "source_url",
            name="uq_marketplace_skills_org_source_url",
        ),
    )
    op.create_index(
        op.f("ix_marketplace_skills_organization_id"),
        "marketplace_skills",
        ["organization_id"],
        unique=False,
    )
    op.create_table(
        "gateway_installed_skills",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("gateway_id", sa.Uuid(), nullable=False),
        sa.Column("skill_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["gateway_id"],
            ["gateways.id"],
        ),
        sa.ForeignKeyConstraint(
            ["skill_id"],
            ["marketplace_skills.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "gateway_id",
            "skill_id",
            name="uq_gateway_installed_skills_gateway_id_skill_id",
        ),
    )
    op.create_index(
        op.f("ix_gateway_installed_skills_gateway_id"),
        "gateway_installed_skills",
        ["gateway_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_gateway_installed_skills_skill_id"),
        "gateway_installed_skills",
        ["skill_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_gateway_installed_skills_skill_id"),
        table_name="gateway_installed_skills",
    )
    op.drop_index(
        op.f("ix_gateway_installed_skills_gateway_id"),
        table_name="gateway_installed_skills",
    )
    op.drop_table("gateway_installed_skills")
    op.drop_index(
        op.f("ix_marketplace_skills_organization_id"),
        table_name="marketplace_skills",
    )
    op.drop_table("marketplace_skills")
