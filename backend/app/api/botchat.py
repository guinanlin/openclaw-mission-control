"""BotChat integration: get-or-create board; channels as chat windows bound to existing agents.

Design: A channel is a chat window + reference to an existing Agent (BotsChat-style).
Creating a channel does NOT create a new OpenClaw agent; it only stores name + agent_id.
Channels are scoped to the BotChat board. See docs/botchat-channel-vs-agent.md.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import col, select

from app.api.deps import require_org_admin
from app.db import crud
from app.db.session import get_session
from app.models.agents import Agent
from app.models.boards import Board
from app.models.botchat_channels import BotChatChannel
from app.models.botchat_channel_sessions import BotChatChannelSession
from app.models.gateways import Gateway
from app.schemas.agents import AgentRead
from app.schemas.botchat import (
    BotChatBoardResponse,
    BotChatChannelCreate,
    BotChatChannelListResponse,
    BotChatChannelRead,
    BotChatChannelSessionCreate,
    BotChatChannelSessionRead,
    BotChatChannelSessionsListResponse,
)
from app.services.openclaw.provisioning_db import AgentLifecycleService
from app.services.organizations import OrganizationContext

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

BOTCHAT_BOARD_NAME = "BotChat"
BOTCHAT_BOARD_SLUG = "botchat"
BOTCHAT_BOARD_DESCRIPTION = "Channels for BotChat messages. Each channel is bound to an existing agent."

router = APIRouter(prefix="/botchat", tags=["botchat"])
SESSION_DEP = Depends(get_session)
ORG_ADMIN_DEP = Depends(require_org_admin)


async def _get_botchat_board(session: AsyncSession, organization_id: UUID) -> Board | None:
    statement = (
        select(Board)
        .where(Board.organization_id == organization_id)
        .where(col(Board.slug) == BOTCHAT_BOARD_SLUG)
    )
    result = await session.exec(statement)
    return result.first()


@router.get("/board", response_model=BotChatBoardResponse)
async def get_or_create_botchat_board(
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> BotChatBoardResponse:
    """Return the BotChat board for the current organization. Creates it if missing."""
    existing = await _get_botchat_board(session, ctx.organization.id)
    if existing is not None:
        return BotChatBoardResponse(
            board_id=existing.id,
            name=existing.name,
            slug=existing.slug,
        )

    gateways = await Gateway.objects.filter_by(
        organization_id=ctx.organization.id,
    ).all(session)
    if not gateways:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No gateway in this organization. Add a gateway first to create BotChat channels.",
        )
    gateway = gateways[0]

    board = await crud.create(
        session,
        Board,
        organization_id=ctx.organization.id,
        name=BOTCHAT_BOARD_NAME,
        slug=BOTCHAT_BOARD_SLUG,
        description=BOTCHAT_BOARD_DESCRIPTION,
        gateway_id=gateway.id,
        board_type="goal",
        goal_confirmed=False,
        max_agents=50,
    )
    return BotChatBoardResponse(
        board_id=board.id,
        name=board.name,
        slug=board.slug,
    )


@router.get("/channels", response_model=BotChatChannelListResponse)
async def list_botchat_channels(
    board_id: UUID = Query(..., description="BotChat board ID (from GET /botchat/board)."),
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> BotChatChannelListResponse:
    """List channels for the BotChat board."""
    board = await _get_botchat_board(session, ctx.organization.id)
    if board is None or board.id != board_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="BotChat board not found or board_id does not match.",
        )
    channels = await BotChatChannel.objects.filter_by(
        organization_id=ctx.organization.id,
        board_id=board_id,
    ).all(session)
    agent_ids = [c.agent_id for c in channels]
    agents_map: dict[UUID, Agent] = {}
    if agent_ids:
        agents = await Agent.objects.by_ids(agent_ids).all(session)
        agents_map = {a.id: a for a in agents}
    lifecycle = AgentLifecycleService(session)
    channel_reads: list[BotChatChannelRead] = []
    for c in channels:
        agent = agents_map.get(c.agent_id)
        agent_read: AgentRead | None = None
        if agent is not None:
            agent_with_status = lifecycle.with_computed_status(agent)
            agent_read = lifecycle.to_agent_read(agent_with_status)
        channel_reads.append(
            BotChatChannelRead(
                id=c.id,
                board_id=c.board_id,
                agent_id=c.agent_id,
                name=c.name,
                description=c.description or "",
                created_at=c.created_at.isoformat(),
                updated_at=c.updated_at.isoformat(),
                agent=agent_read,
            )
        )
    return BotChatChannelListResponse(channels=channel_reads)


@router.post("/channels", response_model=BotChatChannelRead)
async def create_botchat_channel(
    payload: BotChatChannelCreate,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> BotChatChannelRead:
    """Create a channel (chat window) bound to an existing agent. Does not create a new agent."""
    board = await _get_botchat_board(session, ctx.organization.id)
    if board is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="BotChat board does not exist. Open BotChat Messages first to create it.",
        )
    agent = await Agent.objects.by_id(payload.agent_id).first(session)
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found.",
        )
    if agent.board_id != board.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Agent must belong to the BotChat board.",
        )
    channel = await crud.create(
        session,
        BotChatChannel,
        organization_id=ctx.organization.id,
        board_id=board.id,
        agent_id=payload.agent_id,
        name=payload.name.strip(),
        description=(payload.description or "").strip(),
    )
    lifecycle = AgentLifecycleService(session)
    agent_with_status = lifecycle.with_computed_status(agent)
    agent_read = lifecycle.to_agent_read(agent_with_status)
    return BotChatChannelRead(
        id=channel.id,
        board_id=channel.board_id,
        agent_id=channel.agent_id,
        name=channel.name,
        description=channel.description or "",
        created_at=channel.created_at.isoformat(),
        updated_at=channel.updated_at.isoformat(),
        agent=agent_read,
    )


@router.get(
    "/channels/{channel_id}/sessions",
    response_model=BotChatChannelSessionsListResponse,
)
async def list_channel_sessions(
    channel_id: UUID,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> BotChatChannelSessionsListResponse:
    """List sessions for a channel: Session 1 (agent default) + persisted Session 2+."""
    channel = await BotChatChannel.objects.by_id(channel_id).first(session)
    if channel is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Channel not found.",
        )
    if channel.organization_id != ctx.organization.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Channel not found.",
        )
    agent = await Agent.objects.by_id(channel.agent_id).first(session)
    base_session_key = (agent.openclaw_session_id or "").strip() if agent else ""
    out: list[BotChatChannelSessionRead] = []
    if base_session_key:
        out.append(
            BotChatChannelSessionRead(
                id=None,
                session_key=base_session_key,
                label="Session 1",
                created_at=None,
            )
        )
    extra = await BotChatChannelSession.objects.filter_by(
        channel_id=channel_id,
    ).order_by(BotChatChannelSession.created_at.asc()).all(session)
    for s in extra:
        out.append(
            BotChatChannelSessionRead(
                id=s.id,
                session_key=s.session_key,
                label=s.label or "Session",
                created_at=s.created_at.isoformat(),
            )
        )
    return BotChatChannelSessionsListResponse(sessions=out)


@router.post(
    "/channels/{channel_id}/sessions",
    response_model=BotChatChannelSessionRead,
)
async def create_channel_session(
    channel_id: UUID,
    payload: BotChatChannelSessionCreate | None = None,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> BotChatChannelSessionRead:
    """Create a new persisted session for the channel (Session 2+)."""
    channel = await BotChatChannel.objects.by_id(channel_id).first(session)
    if channel is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Channel not found.",
        )
    if channel.organization_id != ctx.organization.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Channel not found.",
        )
    agent = await Agent.objects.by_id(channel.agent_id).first(session)
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found.",
        )
    base_session_key = (agent.openclaw_session_id or "").strip()
    if not base_session_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Agent has no session key. Provision the agent first.",
        )
    existing = await BotChatChannelSession.objects.filter_by(
        channel_id=channel_id,
    ).all(session)
    next_num = len(existing) + 2
    label = (payload.label.strip() if payload and payload.label else "") or f"Session {next_num}"
    new_key = f"{base_session_key}:mc-session-{uuid4()}"
    row = await crud.create(
        session,
        BotChatChannelSession,
        channel_id=channel_id,
        session_key=new_key,
        label=label,
    )
    return BotChatChannelSessionRead(
        id=row.id,
        session_key=row.session_key,
        label=row.label or "Session",
        created_at=row.created_at.isoformat(),
    )
