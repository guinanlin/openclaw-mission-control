"""Gateway-to-skill installation state records."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import UniqueConstraint
from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel

RUNTIME_ANNOTATION_TYPES = (datetime,)


class GatewayInstalledSkill(QueryModel, table=True):
    """Marks that a marketplace skill is installed for a specific gateway."""

    __tablename__ = "gateway_installed_skills"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (
        UniqueConstraint(
            "gateway_id",
            "skill_id",
            name="uq_gateway_installed_skills_gateway_id_skill_id",
        ),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    gateway_id: UUID = Field(foreign_key="gateways.id", index=True)
    skill_id: UUID = Field(foreign_key="marketplace_skills.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
