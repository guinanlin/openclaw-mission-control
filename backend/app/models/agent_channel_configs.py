"""Agent channel config: per-Agent, per-Channel-type bindings (e.g. Feishu appId/appSecret)."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel

RUNTIME_ANNOTATION_TYPES = (datetime,)


class AgentChannelConfig(QueryModel, table=True):
    """One Channel (e.g. feishu) config for one Agent; credentials written back to OpenClaw."""

    __tablename__ = "agent_channel_configs"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (UniqueConstraint("agent_id", "channel_type", name="uq_agent_channel_configs_agent_channel"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    agent_id: UUID = Field(foreign_key="agents.id", index=True)
    gateway_id: UUID = Field(foreign_key="gateways.id", index=True)
    channel_type: str = Field(index=True)
    account_id: str = Field(index=True)
    config: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
