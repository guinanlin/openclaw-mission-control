"""BotChat channel session: persisted chat session for a channel (Session 2, 3, ...).

Session 1 is the agent's default openclaw_session_id; additional sessions
are stored here so they survive page refresh and are shared across clients.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel

RUNTIME_ANNOTATION_TYPES = (datetime,)


class BotChatChannelSession(QueryModel, table=True):
    """A named chat session under a BotChat channel (persisted in DB).

    Session 1 is implicit (agent's openclaw_session_id). Sessions 2+ are
    created via POST and stored here; session_key is used for gateway chat/history.
    """

    __tablename__ = "botchat_channel_sessions"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    channel_id: UUID = Field(foreign_key="botchat_channels.id", index=True)
    session_key: str = Field(index=True)
    label: str = Field(default="Session")
    created_at: datetime = Field(default_factory=utcnow)
