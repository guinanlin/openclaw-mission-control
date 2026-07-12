"""Tests for local auth login API."""

from __future__ import annotations

import pytest
from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app import models as _models  # noqa: F401 - register tables
from app.api import auth as auth_api
from app.api.auth import router as auth_router
from app.core.config import settings
from app.db.session import get_session
from app.models.local_auth_user import LocalAuthUser
from app.models.users import User

pytestmark = pytest.mark.asyncio


async def _make_engine() -> AsyncEngine:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.connect() as conn, conn.begin():
        await conn.run_sync(SQLModel.metadata.create_all)
    return engine


@pytest.mark.asyncio
async def test_local_login_returns_404_when_not_local_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "auth_mode", __import__("app.core.auth_mode", fromlist=["AuthMode"]).AuthMode.CLERK)
    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    app = FastAPI()
    api = APIRouter(prefix="/api/v1")
    api.include_router(auth_router)
    app.include_router(api)

    async def _get_session():
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_session] = _get_session

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        r = await client.post(
            "/api/v1/auth/local/login",
            json={"username": "alice", "password": "secret"},
        )
    assert r.status_code == 404
    await engine.dispose()


@pytest.mark.asyncio
async def test_local_login_returns_401_and_200_with_token(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.auth_mode import AuthMode

    monkeypatch.setattr(settings, "auth_mode", AuthMode.LOCAL)
    monkeypatch.setattr(settings, "local_auth_token", "fallback-token")

    def _fake_verify(password: str, hash: str) -> bool:
        return password == "secret" and hash == "stored_hash"

    monkeypatch.setattr(auth_api._password_ctx, "verify", _fake_verify)

    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_maker() as session:
        user = User(clerk_user_id="local:alice", email="alice@local", name="Alice")
        session.add(user)
        await session.flush()
        bound_token = "x" * 50
        session.add(
            LocalAuthUser(
                username="alice",
                password_hash="stored_hash",
                bound_access_token=bound_token,
                user_id=user.id,
            )
        )
        await session.commit()

    app = FastAPI()
    api = APIRouter(prefix="/api/v1")
    api.include_router(auth_router)
    app.include_router(api)

    async def _get_session():
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_session] = _get_session

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            r401 = await client.post(
                "/api/v1/auth/local/login",
                json={"username": "alice", "password": "wrong"},
            )
            assert r401.status_code == 401

            r401b = await client.post(
                "/api/v1/auth/local/login",
                json={"username": "nobody", "password": "secret"},
            )
            assert r401b.status_code == 401

            r200 = await client.post(
                "/api/v1/auth/local/login",
                json={"username": "alice", "password": "secret"},
            )
            assert r200.status_code == 200
            assert r200.json().get("access_token") == bound_token
    finally:
        await engine.dispose()
