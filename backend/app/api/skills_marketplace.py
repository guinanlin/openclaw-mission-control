"""Skills marketplace API for catalog management and gateway install actions."""

from __future__ import annotations

from typing import TYPE_CHECKING
from urllib.parse import unquote, urlparse
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import col

from app.api.deps import require_org_admin
from app.core.time import utcnow
from app.db.session import get_session
from app.models.gateway_installed_skills import GatewayInstalledSkill
from app.models.gateways import Gateway
from app.models.marketplace_skills import MarketplaceSkill
from app.schemas.common import OkResponse
from app.schemas.skills_marketplace import (
    MarketplaceSkillActionResponse,
    MarketplaceSkillCardRead,
    MarketplaceSkillCreate,
    MarketplaceSkillRead,
)
from app.services.openclaw.gateway_dispatch import GatewayDispatchService
from app.services.openclaw.gateway_resolver import gateway_client_config, require_gateway_workspace_root
from app.services.openclaw.gateway_rpc import OpenClawGatewayError
from app.services.openclaw.shared import GatewayAgentIdentity
from app.services.organizations import OrganizationContext

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

router = APIRouter(prefix="/skills", tags=["skills"])
SESSION_DEP = Depends(get_session)
ORG_ADMIN_DEP = Depends(require_org_admin)
GATEWAY_ID_QUERY = Query(...)


def _skills_install_dir(workspace_root: str) -> str:
    normalized = workspace_root.rstrip("/\\")
    if not normalized:
        return "skills"
    return f"{normalized}/skills"


def _infer_skill_name(source_url: str) -> str:
    parsed = urlparse(source_url)
    path = parsed.path.rstrip("/")
    candidate = path.rsplit("/", maxsplit=1)[-1] if path else parsed.netloc
    candidate = unquote(candidate).removesuffix(".git").replace("-", " ").replace("_", " ")
    if candidate.strip():
        return candidate.strip()
    return "Skill"


def _install_instruction(*, skill: MarketplaceSkill, gateway: Gateway) -> str:
    install_dir = _skills_install_dir(gateway.workspace_root)
    return (
        "MISSION CONTROL SKILL INSTALL REQUEST\n"
        f"Skill name: {skill.name}\n"
        f"Skill source URL: {skill.source_url}\n"
        f"Install destination: {install_dir}\n\n"
        "Actions:\n"
        "1. Ensure the install destination exists.\n"
        "2. Install or update the skill from the source URL into the destination.\n"
        "3. Verify the skill is discoverable by the runtime.\n"
        "4. Reply with success or failure details."
    )


def _uninstall_instruction(*, skill: MarketplaceSkill, gateway: Gateway) -> str:
    install_dir = _skills_install_dir(gateway.workspace_root)
    return (
        "MISSION CONTROL SKILL UNINSTALL REQUEST\n"
        f"Skill name: {skill.name}\n"
        f"Skill source URL: {skill.source_url}\n"
        f"Install destination: {install_dir}\n\n"
        "Actions:\n"
        "1. Remove the skill assets previously installed from this source URL.\n"
        "2. Ensure the skill is no longer discoverable by the runtime.\n"
        "3. Reply with success or failure details."
    )


def _as_card(
    *,
    skill: MarketplaceSkill,
    installation: GatewayInstalledSkill | None,
) -> MarketplaceSkillCardRead:
    return MarketplaceSkillCardRead(
        id=skill.id,
        organization_id=skill.organization_id,
        name=skill.name,
        description=skill.description,
        source_url=skill.source_url,
        created_at=skill.created_at,
        updated_at=skill.updated_at,
        installed=installation is not None,
        installed_at=installation.created_at if installation is not None else None,
    )


async def _require_gateway_for_org(
    *,
    gateway_id: UUID,
    session: AsyncSession,
    ctx: OrganizationContext,
) -> Gateway:
    gateway = await Gateway.objects.by_id(gateway_id).first(session)
    if gateway is None or gateway.organization_id != ctx.organization.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gateway not found",
        )
    return gateway


async def _require_marketplace_skill_for_org(
    *,
    skill_id: UUID,
    session: AsyncSession,
    ctx: OrganizationContext,
) -> MarketplaceSkill:
    skill = await MarketplaceSkill.objects.by_id(skill_id).first(session)
    if skill is None or skill.organization_id != ctx.organization.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Marketplace skill not found",
        )
    return skill


async def _dispatch_gateway_instruction(
    *,
    session: AsyncSession,
    gateway: Gateway,
    message: str,
) -> None:
    dispatch = GatewayDispatchService(session)
    config = gateway_client_config(gateway)
    session_key = GatewayAgentIdentity.session_key(gateway)
    await dispatch.send_agent_message(
        session_key=session_key,
        config=config,
        agent_name="Gateway Agent",
        message=message,
        deliver=True,
    )


@router.get("/marketplace", response_model=list[MarketplaceSkillCardRead])
async def list_marketplace_skills(
    gateway_id: UUID = GATEWAY_ID_QUERY,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> list[MarketplaceSkillCardRead]:
    """List marketplace cards for an org and annotate install state for a gateway."""
    gateway = await _require_gateway_for_org(gateway_id=gateway_id, session=session, ctx=ctx)
    skills = (
        await MarketplaceSkill.objects.filter_by(organization_id=ctx.organization.id)
        .order_by(col(MarketplaceSkill.created_at).desc())
        .all(session)
    )
    installations = await GatewayInstalledSkill.objects.filter_by(gateway_id=gateway.id).all(session)
    installed_by_skill_id = {record.skill_id: record for record in installations}
    return [
        _as_card(skill=skill, installation=installed_by_skill_id.get(skill.id))
        for skill in skills
    ]


@router.post("/marketplace", response_model=MarketplaceSkillRead)
async def create_marketplace_skill(
    payload: MarketplaceSkillCreate,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> MarketplaceSkill:
    """Register a skill source URL in the organization's marketplace catalog."""
    source_url = str(payload.source_url).strip()
    existing = await MarketplaceSkill.objects.filter_by(
        organization_id=ctx.organization.id,
        source_url=source_url,
    ).first(session)
    if existing is not None:
        changed = False
        if payload.name and existing.name != payload.name:
            existing.name = payload.name
            changed = True
        if payload.description is not None and existing.description != payload.description:
            existing.description = payload.description
            changed = True
        if changed:
            existing.updated_at = utcnow()
            session.add(existing)
            await session.commit()
            await session.refresh(existing)
        return existing

    skill = MarketplaceSkill(
        organization_id=ctx.organization.id,
        source_url=source_url,
        name=payload.name or _infer_skill_name(source_url),
        description=payload.description,
    )
    session.add(skill)
    await session.commit()
    await session.refresh(skill)
    return skill


@router.delete("/marketplace/{skill_id}", response_model=OkResponse)
async def delete_marketplace_skill(
    skill_id: UUID,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> OkResponse:
    """Delete a marketplace catalog entry and any install records that reference it."""
    skill = await _require_marketplace_skill_for_org(skill_id=skill_id, session=session, ctx=ctx)
    installations = await GatewayInstalledSkill.objects.filter_by(skill_id=skill.id).all(session)
    for installation in installations:
        await session.delete(installation)
    await session.delete(skill)
    await session.commit()
    return OkResponse()


@router.post(
    "/marketplace/{skill_id}/install",
    response_model=MarketplaceSkillActionResponse,
)
async def install_marketplace_skill(
    skill_id: UUID,
    gateway_id: UUID = GATEWAY_ID_QUERY,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> MarketplaceSkillActionResponse:
    """Install a marketplace skill by dispatching instructions to the gateway agent."""
    gateway = await _require_gateway_for_org(gateway_id=gateway_id, session=session, ctx=ctx)
    require_gateway_workspace_root(gateway)
    skill = await _require_marketplace_skill_for_org(skill_id=skill_id, session=session, ctx=ctx)
    try:
        await _dispatch_gateway_instruction(
            session=session,
            gateway=gateway,
            message=_install_instruction(skill=skill, gateway=gateway),
        )
    except OpenClawGatewayError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    installation = await GatewayInstalledSkill.objects.filter_by(
        gateway_id=gateway.id,
        skill_id=skill.id,
    ).first(session)
    if installation is None:
        session.add(
            GatewayInstalledSkill(
                gateway_id=gateway.id,
                skill_id=skill.id,
            ),
        )
    else:
        installation.updated_at = utcnow()
        session.add(installation)
    await session.commit()
    return MarketplaceSkillActionResponse(
        skill_id=skill.id,
        gateway_id=gateway.id,
        installed=True,
    )


@router.post(
    "/marketplace/{skill_id}/uninstall",
    response_model=MarketplaceSkillActionResponse,
)
async def uninstall_marketplace_skill(
    skill_id: UUID,
    gateway_id: UUID = GATEWAY_ID_QUERY,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> MarketplaceSkillActionResponse:
    """Uninstall a marketplace skill by dispatching instructions to the gateway agent."""
    gateway = await _require_gateway_for_org(gateway_id=gateway_id, session=session, ctx=ctx)
    require_gateway_workspace_root(gateway)
    skill = await _require_marketplace_skill_for_org(skill_id=skill_id, session=session, ctx=ctx)
    try:
        await _dispatch_gateway_instruction(
            session=session,
            gateway=gateway,
            message=_uninstall_instruction(skill=skill, gateway=gateway),
        )
    except OpenClawGatewayError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    installation = await GatewayInstalledSkill.objects.filter_by(
        gateway_id=gateway.id,
        skill_id=skill.id,
    ).first(session)
    if installation is not None:
        await session.delete(installation)
        await session.commit()
    return MarketplaceSkillActionResponse(
        skill_id=skill.id,
        gateway_id=gateway.id,
        installed=False,
    )
