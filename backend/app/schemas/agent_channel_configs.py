"""Schemas for Agent channel config (e.g. Feishu) API."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import field_validator
from sqlmodel import SQLModel

ALLOWED_CHANNEL_TYPES = frozenset({"feishu"})


def _desensitize_config(config: dict[str, object]) -> dict[str, object]:
    """Return a copy of config with appSecret (and similar) replaced by placeholder."""
    out = dict(config)
    for key in ("appSecret", "app_secret"):
        if key in out and out[key] is not None and str(out[key]).strip():
            out[key] = "***"
    return out


class AgentChannelConfigRead(SQLModel):
    """Channel config for one Agent; config may be desensitized."""

    id: UUID
    agent_id: UUID
    gateway_id: UUID
    channel_type: str
    account_id: str
    config: dict = {}
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm_desensitized(cls, row: object) -> AgentChannelConfigRead:
        """Build from ORM row with config desensitized."""
        from app.models.agent_channel_configs import AgentChannelConfig

        if not isinstance(row, AgentChannelConfig):
            raise TypeError("expected AgentChannelConfig")
        config = (row.config or {}).copy()
        config = _desensitize_config(config)
        return cls(
            id=row.id,
            agent_id=row.agent_id,
            gateway_id=row.gateway_id,
            channel_type=row.channel_type,
            account_id=row.account_id,
            config=config,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )


class AgentChannelConfigCreate(SQLModel):
    """Payload to create or update one channel config (e.g. Feishu)."""

    account_id: str | None = None
    config: dict = {}

    @field_validator("config")
    @classmethod
    def config_non_empty(cls, v: object) -> object:
        if not isinstance(v, dict) or not v:
            raise ValueError("config is required and must be non-empty")
        return v


class AgentChannelConfigUpdate(SQLModel):
    """Payload to update channel config (partial)."""

    account_id: str | None = None
    config: dict | None = None
