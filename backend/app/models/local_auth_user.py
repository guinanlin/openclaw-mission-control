"""Local auth user: username/password + bound access token for self-host mode."""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlmodel import Field

from app.models.base import QueryModel


class LocalAuthUser(QueryModel, table=True):
    """Self-host local user: username, password hash, and bound access token."""

    __tablename__ = "local_auth_users"  # pyright: ignore[reportAssignmentType]

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    username: str = Field(index=True, unique=True)
    password_hash: str = Field()
    bound_access_token: str = Field(index=True, unique=True)
    user_id: UUID = Field(foreign_key="users.id")
