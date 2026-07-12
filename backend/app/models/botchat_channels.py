"""BotChat channel: chat window bound to an existing Agent (BotsChat-style, no new agent)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel

RUNTIME_ANNOTATION_TYPES = (datetime,)


class BotChatChannel(QueryModel, table=True):
    """A BotChat channel is a chat window bound to an existing Agent.

    Creating a channel does not create a new OpenClaw agent; it only stores
    a reference to an existing agent on the given board (see docs/botchat-channel-vs-agent.md).
    """

    __tablename__ = "botchat_channels"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: UUID = Field(foreign_key="organizations.id", index=True)
    board_id: UUID = Field(foreign_key="boards.id", index=True)
    agent_id: UUID = Field(foreign_key="agents.id", index=True)
    name: str = Field(index=True)
    description: str = Field(default="")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
