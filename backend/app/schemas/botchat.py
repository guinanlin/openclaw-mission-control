"""Schemas for BotChat integration API."""

from __future__ import annotations

from uuid import UUID

from pydantic import Field
from sqlmodel import SQLModel

from app.schemas.agents import AgentRead


class BotChatBoardResponse(SQLModel):
    """Response for get-or-create BotChat board."""

    board_id: UUID = Field(description="ID of the BotChat board.")
    name: str = Field(description="Board display name.")
    slug: str = Field(description="Board slug.")


class BotChatChannelCreate(SQLModel):
    """Create a channel: name + reference to an existing agent (no new agent created)."""

    name: str = Field(min_length=1, description="Channel display name.")
    description: str = Field(default="", description="Optional description.")
    agent_id: UUID = Field(description="Existing agent on the BotChat board to bind this channel to.")


class BotChatChannelRead(SQLModel):
    """A BotChat channel (chat window bound to an existing agent)."""

    id: UUID
    board_id: UUID
    agent_id: UUID
    name: str
    description: str
    created_at: str
    updated_at: str
    agent: AgentRead | None = Field(default=None, description="Embedded agent for chat (session, etc.).")


class BotChatChannelListResponse(SQLModel):
    """List of BotChat channels for a board."""

    channels: list[BotChatChannelRead]


class BotChatChannelSessionRead(SQLModel):
    """A single chat session for a channel (Session 1 = agent default; 2+ from DB)."""

    id: UUID | None = Field(default=None, description="DB id for persisted sessions (null for Session 1).")
    session_key: str = Field(description="Key used for gateway chat/history.")
    label: str = Field(description="Display label, e.g. 'Session 1', 'Session 2'.")
    created_at: str | None = Field(default=None, description="Created at (null for Session 1).")


class BotChatChannelSessionsListResponse(SQLModel):
    """List of sessions for a channel (Session 1 + persisted Session 2+)."""

    sessions: list[BotChatChannelSessionRead]


class BotChatChannelSessionCreate(SQLModel):
    """Optional body when creating a new session (label optional)."""

    label: str = Field(default="", description="Optional label; if empty, backend assigns 'Session N'.")
