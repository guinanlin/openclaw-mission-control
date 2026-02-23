"""Schemas for gateway CRUD and template-sync API payloads."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import field_validator
from sqlmodel import Field, SQLModel

RUNTIME_ANNOTATION_TYPES = (datetime, UUID)


class GatewayBase(SQLModel):
    """Shared gateway fields used across create/read payloads."""

    name: str
    url: str
    workspace_root: str


def _normalize_optional_str(value: object) -> str | None | object:
    """Normalize empty/whitespace strings to `None`."""
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


class GatewayCreate(GatewayBase):
    """Payload for creating a gateway configuration."""

    token: str | None = None
    password: str | None = None

    @field_validator("token", mode="before")
    @classmethod
    def normalize_token(cls, value: object) -> str | None | object:
        return _normalize_optional_str(value)

    @field_validator("password", mode="before")
    @classmethod
    def normalize_password(cls, value: object) -> str | None | object:
        return _normalize_optional_str(value)


class GatewayUpdate(SQLModel):
    """Payload for partial gateway updates."""

    name: str | None = None
    url: str | None = None
    token: str | None = None
    password: str | None = None
    workspace_root: str | None = None

    @field_validator("token", mode="before")
    @classmethod
    def normalize_token(cls, value: object) -> str | None | object:
        return _normalize_optional_str(value)

    @field_validator("password", mode="before")
    @classmethod
    def normalize_password(cls, value: object) -> str | None | object:
        return _normalize_optional_str(value)


class GatewayRead(GatewayBase):
    """Gateway payload returned from read endpoints."""

    id: UUID
    organization_id: UUID
    token: str | None = None
    password: str | None = None
    created_at: datetime
    updated_at: datetime


class GatewayTemplatesSyncError(SQLModel):
    """Per-agent error entry from a gateway template sync operation."""

    agent_id: UUID | None = None
    agent_name: str | None = None
    board_id: UUID | None = None
    message: str


class GatewayTemplatesSyncResult(SQLModel):
    """Summary payload returned by gateway template sync endpoints."""

    gateway_id: UUID
    include_main: bool
    reset_sessions: bool
    agents_updated: int
    agents_skipped: int
    main_updated: bool
    errors: list[GatewayTemplatesSyncError] = Field(default_factory=list)


class MainAgentRead(SQLModel):
    """Read-only view of a gateway's main agent config (agents.defaults from OpenClaw)."""

    gateway_id: UUID
    config_hash: str | None = None
    main_key: str | None = None
    defaults: dict = Field(default_factory=dict)
