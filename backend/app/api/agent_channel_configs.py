"""API for Agent channel configs (e.g. Feishu): list, upsert, delete."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import require_org_admin
from app.db.session import get_session
from app.models.agent_channel_configs import AgentChannelConfig
from app.models.agents import Agent
from app.models.gateways import Gateway
from app.schemas.agent_channel_configs import (
    AgentChannelConfigCreate,
    AgentChannelConfigRead,
)
from app.schemas.common import OkResponse
from app.services.openclaw.channel_config_sync import (
    remove_channel_config_from_gateway,
    sync_channel_config_to_gateway,
)
from app.services.openclaw.gateway_rpc import OpenClawGatewayError
from app.services.openclaw.internal.agent_key import slugify
from app.services.openclaw.provisioning_db import AgentLifecycleService
from app.services.openclaw.gateway_resolver import gateway_client_config
from app.services.organizations import OrganizationContext

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

router = APIRouter(prefix="/{agent_id}/channel-configs", tags=["agents"])
SESSION_DEP = Depends(get_session)
ORG_ADMIN_DEP = Depends(require_org_admin)

ALLOWED_CHANNEL_TYPES = frozenset({"feishu"})


@router.get("", response_model=list[AgentChannelConfigRead])
async def list_agent_channel_configs(
    agent_id: str,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> list[AgentChannelConfigRead]:
    """List channel configs for an agent (config desensitized)."""
    try:
        agent_uuid = UUID(agent_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid agent_id")
    service = AgentLifecycleService(session)
    agent = await Agent.objects.by_id(agent_uuid).first(session)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    await service.require_agent_access(agent=agent, ctx=ctx, write=False)

    configs = await AgentChannelConfig.objects.filter_by(agent_id=agent_uuid).all(session)
    return [AgentChannelConfigRead.from_orm_desensitized(c) for c in configs]


@router.put("/{channel_type}", response_model=AgentChannelConfigRead)
async def put_agent_channel_config(
    agent_id: str,
    channel_type: str,
    payload: AgentChannelConfigCreate,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> AgentChannelConfigRead:
    """Create or update one channel config for an agent and sync to OpenClaw."""
    if channel_type not in ALLOWED_CHANNEL_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"channel_type must be one of {sorted(ALLOWED_CHANNEL_TYPES)}",
        )

    try:
        agent_uuid = UUID(agent_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid agent_id")
    service = AgentLifecycleService(session)
    agent = await Agent.objects.by_id(agent_uuid).first(session)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    await service.require_agent_access(agent=agent, ctx=ctx, write=True)

    gateway = await Gateway.objects.by_id(agent.gateway_id).first(session)
    if gateway is None or gateway.organization_id != ctx.organization.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gateway not found")
    try:
        client_config = gateway_client_config(gateway)
    except HTTPException:
        raise

    account_id = (payload.account_id or "").strip() or f"{slugify(agent.name)}-{str(agent.id).replace('-', '')[:8]}"
    credentials = dict(payload.config)
    for k in ("appId", "appSecret", "botName"):
        if k in credentials and credentials[k] is not None:
            credentials[k] = str(credentials[k]).strip() or None
    credentials = {k: v for k, v in credentials.items() if v is not None}

    existing = await AgentChannelConfig.objects.filter_by(
        agent_id=agent_uuid,
        channel_type=channel_type,
    ).first(session)

    if existing is not None:
        existing.account_id = account_id
        existing.config = dict(payload.config)
        existing.gateway_id = agent.gateway_id
        session.add(existing)
        await session.commit()
        await session.refresh(existing)
        record = existing
    else:
        record = AgentChannelConfig(
            agent_id=agent.id,
            gateway_id=agent.gateway_id,
            channel_type=channel_type,
            account_id=account_id,
            config=dict(payload.config),
        )
        session.add(record)
        await session.commit()
        await session.refresh(record)

    try:
        await sync_channel_config_to_gateway(
            agent=agent,
            channel_type=channel_type,
            account_id=account_id,
            credentials=credentials,
            client_config=client_config,
        )
    except OpenClawGatewayError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gateway unreachable or config error: {exc!s}",
        ) from exc

    return AgentChannelConfigRead.from_orm_desensitized(record)


@router.delete("/{channel_type}", response_model=OkResponse)
async def delete_agent_channel_config(
    agent_id: str,
    channel_type: str,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> OkResponse:
    """Remove one channel config for an agent and sync removal to OpenClaw."""
    if channel_type not in ALLOWED_CHANNEL_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"channel_type must be one of {sorted(ALLOWED_CHANNEL_TYPES)}",
        )

    try:
        agent_uuid = UUID(agent_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid agent_id")
    service = AgentLifecycleService(session)
    agent = await Agent.objects.by_id(agent_uuid).first(session)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    await service.require_agent_access(agent=agent, ctx=ctx, write=True)

    record = await AgentChannelConfig.objects.filter_by(
        agent_id=agent_uuid,
        channel_type=channel_type,
    ).first(session)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel config not found")

    gateway = await Gateway.objects.by_id(agent.gateway_id).first(session)
    if gateway is not None and gateway.organization_id == ctx.organization.id:
        try:
            client_config = gateway_client_config(gateway)
            await remove_channel_config_from_gateway(
                agent=agent,
                channel_type=channel_type,
                account_id=record.account_id,
                client_config=client_config,
            )
        except OpenClawGatewayError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gateway unreachable or config error: {exc!s}",
            ) from exc

    await session.delete(record)
    await session.commit()
    return OkResponse()
