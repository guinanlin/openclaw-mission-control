"""Seed local auth users from LOCAL_AUTH_SEED_USERS at startup."""

from __future__ import annotations

import secrets
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.auth_mode import AuthMode
from app.core.config import (
    LOCAL_AUTH_TOKEN_MIN_LENGTH,
    LOCAL_AUTH_TOKEN_PLACEHOLDERS,
    settings,
)
from app.core.logging import get_logger
from app.models.local_auth_user import LocalAuthUser
from app.models.users import User
from app.services.organizations import ensure_member_for_user

logger = get_logger(__name__)


def _generate_bound_token() -> str:
    """Return a URL-safe token of length >= LOCAL_AUTH_TOKEN_MIN_LENGTH."""
    return secrets.token_urlsafe(48)


async def run_local_auth_seed(session: AsyncSession) -> None:
    """Parse LOCAL_AUTH_SEED_USERS and upsert local_auth_users (and User rows)."""
    if settings.auth_mode != AuthMode.LOCAL:
        return
    raw = (settings.local_auth_seed_users or "").strip()
    if not raw:
        return
    # Format: "username|password_hash|bound_token" per entry, comma between entries.
    # If bound_token is omitted (only two segments), a token is generated.
    entries: list[tuple[str, str, str]] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        chunks = part.split("|", 2)
        if len(chunks) < 2:
            logger.warning(
                "local_auth_seed.skip invalid_entry format=username|hash|token part=%s",
                part[:50],
            )
            continue
        username = chunks[0].strip()
        password_hash = chunks[1].strip()
        bound_token = chunks[2].strip() if len(chunks) > 2 else ""
        if not username or not password_hash:
            continue
        if not bound_token:
            bound_token = _generate_bound_token()
            logger.info("local_auth_seed.generated_token username=%s", username)
        if len(bound_token) < LOCAL_AUTH_TOKEN_MIN_LENGTH:
            logger.warning(
                "local_auth_seed.skip token_too_short username=%s",
                username,
            )
            continue
        if bound_token.lower() in LOCAL_AUTH_TOKEN_PLACEHOLDERS:
            logger.warning(
                "local_auth_seed.skip token_placeholder username=%s",
                username,
            )
            continue
        entries.append((username, password_hash, bound_token))
    if not entries:
        return
    for idx, (username, password_hash, bound_token) in enumerate(entries):
        try:
            clerk_user_id = f"local:{username}"
            existing = (
                await session.exec(select(LocalAuthUser).where(LocalAuthUser.username == username))
            ).first()
            if existing is not None:
                logger.debug("local_auth_seed.skip username_exists username=%s", username)
                continue
            user = (
                await session.exec(select(User).where(User.clerk_user_id == clerk_user_id))
            ).first()
            if user is None:
                user = User(
                    clerk_user_id=clerk_user_id,
                    email=f"{username}@local",
                    name=username,
                    is_super_admin=(idx == 0),
                )
                session.add(user)
                await session.flush()
            elif idx == 0:
                if not user.is_super_admin:
                    user.is_super_admin = True
                    session.add(user)
                    await session.flush()
            local_user = LocalAuthUser(
                username=username,
                password_hash=password_hash,
                bound_access_token=bound_token,
                user_id=user.id,
            )
            session.add(local_user)
            await session.flush()
            await ensure_member_for_user(session, user)
            logger.info(
                "local_auth_seed.created username=%s user_id=%s super_admin=%s",
                username,
                user.id,
                getattr(user, "is_super_admin", False),
            )
        except Exception:
            logger.exception("local_auth_seed.failed username=%s", username)
            raise
    await session.commit()
