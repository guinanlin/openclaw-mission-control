"""Schemas for local (self-host) auth: login and admin."""

from __future__ import annotations

from uuid import UUID

from pydantic import Field
from sqlmodel import SQLModel


class LocalLoginRequest(SQLModel):
    """Request body for POST /auth/local/login."""

    username: str = Field(description="Local auth username.")
    password: str = Field(description="Password.")


class LocalLoginResponse(SQLModel):
    """Response for successful local login."""

    access_token: str = Field(description="Bound access token to use as Bearer token.")


class LocalUserCreate(SQLModel):
    """Request body for POST /auth/local/users (admin)."""

    username: str = Field(description="Username (unique).")
    password: str = Field(description="Password (will be hashed).")
    bound_access_token: str = Field(description="Access token to bind to this user (min 50 chars).")


class LocalUserRead(SQLModel):
    """Response item for GET /auth/local/users (token not exposed)."""

    id: UUID = Field(description="Local auth user ID.")
    username: str = Field(description="Username.")
    user_id: UUID = Field(description="Linked User ID.")
