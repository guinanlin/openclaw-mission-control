# ruff: noqa: INP001
"""Integration tests for skills marketplace APIs."""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel, col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import require_org_admin
from app.api.skills_marketplace import router as skills_marketplace_router
from app.db.session import get_session
from app.models.gateway_installed_skills import GatewayInstalledSkill
from app.models.gateways import Gateway
from app.models.marketplace_skills import MarketplaceSkill
from app.models.organization_members import OrganizationMember
from app.models.organizations import Organization
from app.services.organizations import OrganizationContext


async def _make_engine() -> AsyncEngine:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.connect() as conn, conn.begin():
        await conn.run_sync(SQLModel.metadata.create_all)
    return engine


def _build_test_app(
    session_maker: async_sessionmaker[AsyncSession],
    *,
    organization: Organization,
) -> FastAPI:
    app = FastAPI()
    api_v1 = APIRouter(prefix="/api/v1")
    api_v1.include_router(skills_marketplace_router)
    app.include_router(api_v1)

    async def _override_get_session() -> AsyncSession:
        async with session_maker() as session:
            yield session

    async def _override_require_org_admin() -> OrganizationContext:
        return OrganizationContext(
            organization=organization,
            member=OrganizationMember(
                organization_id=organization.id,
                user_id=uuid4(),
                role="owner",
                all_boards_read=True,
                all_boards_write=True,
            ),
        )

    app.dependency_overrides[get_session] = _override_get_session
    app.dependency_overrides[require_org_admin] = _override_require_org_admin
    return app


async def _seed_base(
    session: AsyncSession,
) -> tuple[Organization, Gateway]:
    organization = Organization(id=uuid4(), name="Org One")
    gateway = Gateway(
        id=uuid4(),
        organization_id=organization.id,
        name="Gateway One",
        url="https://gateway.example.local",
        workspace_root="/workspace/openclaw",
    )
    session.add(organization)
    session.add(gateway)
    await session.commit()
    return organization, gateway


@pytest.mark.asyncio
async def test_install_skill_dispatches_instruction_and_persists_installation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine = await _make_engine()
    session_maker = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    try:
        async with session_maker() as session:
            organization, gateway = await _seed_base(session)
            skill = MarketplaceSkill(
                organization_id=organization.id,
                name="Deploy Helper",
                source_url="https://example.com/skills/deploy-helper.git",
                description="Handles deploy workflow checks.",
            )
            session.add(skill)
            await session.commit()
            await session.refresh(skill)

        app = _build_test_app(session_maker, organization=organization)
        sent_messages: list[dict[str, str | bool]] = []

        async def _fake_send_agent_message(
            _self: object,
            *,
            session_key: str,
            config: object,
            agent_name: str,
            message: str,
            deliver: bool = False,
        ) -> None:
            del config
            sent_messages.append(
                {
                    "session_key": session_key,
                    "agent_name": agent_name,
                    "message": message,
                    "deliver": deliver,
                },
            )

        monkeypatch.setattr(
            "app.api.skills_marketplace.GatewayDispatchService.send_agent_message",
            _fake_send_agent_message,
        )

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            response = await client.post(
                f"/api/v1/skills/marketplace/{skill.id}/install",
                params={"gateway_id": str(gateway.id)},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["installed"] is True
        assert body["gateway_id"] == str(gateway.id)
        assert len(sent_messages) == 1
        assert sent_messages[0]["agent_name"] == "Gateway Agent"
        assert sent_messages[0]["deliver"] is True
        assert sent_messages[0]["session_key"] == f"agent:mc-gateway-{gateway.id}:main"
        message = str(sent_messages[0]["message"])
        assert "SKILL INSTALL REQUEST" in message
        assert str(skill.source_url) in message
        assert "/workspace/openclaw/skills" in message

        async with session_maker() as session:
            installed_rows = (
                await session.exec(
                    select(GatewayInstalledSkill).where(
                        col(GatewayInstalledSkill.gateway_id) == gateway.id,
                        col(GatewayInstalledSkill.skill_id) == skill.id,
                    ),
                )
            ).all()
            assert len(installed_rows) == 1
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_list_marketplace_skills_marks_installed_cards() -> None:
    engine = await _make_engine()
    session_maker = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    try:
        async with session_maker() as session:
            organization, gateway = await _seed_base(session)
            first = MarketplaceSkill(
                organization_id=organization.id,
                name="First Skill",
                source_url="https://example.com/skills/first",
            )
            second = MarketplaceSkill(
                organization_id=organization.id,
                name="Second Skill",
                source_url="https://example.com/skills/second",
            )
            session.add(first)
            session.add(second)
            await session.commit()
            await session.refresh(first)
            await session.refresh(second)

            session.add(
                GatewayInstalledSkill(
                    gateway_id=gateway.id,
                    skill_id=first.id,
                ),
            )
            await session.commit()

        app = _build_test_app(session_maker, organization=organization)
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            response = await client.get(
                "/api/v1/skills/marketplace",
                params={"gateway_id": str(gateway.id)},
            )

        assert response.status_code == 200
        cards = response.json()
        assert len(cards) == 2
        cards_by_id = {item["id"]: item for item in cards}
        assert cards_by_id[str(first.id)]["installed"] is True
        assert cards_by_id[str(first.id)]["installed_at"] is not None
        assert cards_by_id[str(second.id)]["installed"] is False
        assert cards_by_id[str(second.id)]["installed_at"] is None
    finally:
        await engine.dispose()
