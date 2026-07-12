from __future__ import annotations

import time

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from passlib.context import CryptContext
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.auth import AuthContext, get_auth_context
from app.core.auth_mode import AuthMode
from app.core.config import (
    LOCAL_AUTH_TOKEN_MIN_LENGTH,
    LOCAL_AUTH_TOKEN_PLACEHOLDERS,
    settings,
)
from app.db.session import get_session
from app.models.local_auth_user import LocalAuthUser
from app.models.users import User
from app.schemas.auth_local import (
    LocalLoginRequest,
    LocalLoginResponse,
    LocalUserCreate,
    LocalUserRead,
)
from app.schemas.errors import LLMErrorResponse
from app.schemas.users import UserRead

router = APIRouter(prefix="/auth", tags=["auth"])
AUTH_CONTEXT_DEP = Depends(get_auth_context)
SESSION_DEP = Depends(get_session)

_password_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _verify_password(password: str, password_hash: str) -> bool:
    """Verify password against hash; use bcrypt directly to avoid passlib/bcrypt 5.x issues."""
    if not password_hash or not password_hash.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            return _password_ctx.verify(password, password_hash)
        except Exception:
            return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False

# In-memory rate limit: username -> (fail_count, lock_until_timestamp)
_login_failures: dict[str, tuple[int, float]] = {}
LOGIN_MAX_FAILURES = 5
LOGIN_LOCK_SECONDS = 900  # 15 minutes


def _get_login_failures(username: str) -> tuple[int, float]:
    count, lock_until = _login_failures.get(username, (0, 0.0))
    if lock_until > 0 and time.monotonic() < lock_until:
        return count, lock_until
    if lock_until > 0:
        _login_failures.pop(username, None)
        return 0, 0.0
    return count, 0.0


def _record_login_failure(username: str) -> None:
    count, _ = _get_login_failures(username)
    count += 1
    lock_until = time.monotonic() + LOGIN_LOCK_SECONDS if count >= LOGIN_MAX_FAILURES else 0.0
    _login_failures[username] = (count, lock_until)


def _clear_login_success(username: str) -> None:
    _login_failures.pop(username, None)


@router.post(
    "/local/login",
    response_model=LocalLoginResponse,
    summary="Local login (username + password)",
    description=(
        "Authenticate with username and password in self-host mode. "
        "Returns the bound access token for use as Bearer token. "
        "Only available when AUTH_MODE=local."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Login successful; use access_token as Bearer."},
        status.HTTP_401_UNAUTHORIZED: {"description": "Invalid username or password."},
        status.HTTP_404_NOT_FOUND: {"description": "Local auth not enabled."},
        status.HTTP_429_TOO_MANY_REQUESTS: {"description": "Too many failed attempts; try again later."},
    },
)
async def local_login(
    payload: LocalLoginRequest,
    request: Request,
    session: AsyncSession = SESSION_DEP,
) -> LocalLoginResponse:
    if settings.auth_mode != AuthMode.LOCAL:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Local auth is not enabled.")
    username = (payload.username or "").strip()
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password.")
    fail_count, lock_until = _get_login_failures(username)
    if fail_count >= LOGIN_MAX_FAILURES and lock_until > 0 and time.monotonic() < lock_until:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Try again later.",
        )
    statement = select(LocalAuthUser).where(LocalAuthUser.username == username)
    result = await session.exec(statement)
    row = result.first()
    if row is None:
        _record_login_failure(username)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password.")
    if not _verify_password(payload.password, row.password_hash):
        _record_login_failure(username)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password.")
    _clear_login_success(username)
    return LocalLoginResponse(access_token=row.bound_access_token)


def _require_local_super_admin(auth: AuthContext) -> None:
    if settings.auth_mode != AuthMode.LOCAL:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Local auth is not enabled.")
    if auth.actor_type != "user" or auth.user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated.")
    if not auth.user.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin required.")


@router.get(
    "/local/users",
    response_model=list[LocalUserRead],
    summary="List local auth users (admin)",
    description="List all local auth users. Requires super_admin. Only when AUTH_MODE=local.",
)
async def list_local_users(
    auth: AuthContext = AUTH_CONTEXT_DEP,
    session: AsyncSession = SESSION_DEP,
) -> list[LocalUserRead]:
    _require_local_super_admin(auth)
    statement = select(LocalAuthUser)
    result = await session.exec(statement)
    rows = result.all()
    return [LocalUserRead(id=row.id, username=row.username, user_id=row.user_id) for row in rows]


@router.post(
    "/local/users",
    response_model=LocalUserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create local auth user (admin)",
    description="Create a local user with username, password, and bound token. Requires super_admin.",
    responses={
        status.HTTP_201_CREATED: {"description": "Local user created."},
        status.HTTP_400_BAD_REQUEST: {"description": "Validation failed (e.g. token too short)."},
        status.HTTP_403_FORBIDDEN: {"description": "Not super admin or local auth disabled."},
        status.HTTP_409_CONFLICT: {"description": "Username or bound_access_token already exists."},
    },
)
async def create_local_user(
    payload: LocalUserCreate,
    auth: AuthContext = AUTH_CONTEXT_DEP,
    session: AsyncSession = SESSION_DEP,
) -> LocalUserRead:
    _require_local_super_admin(auth)
    username = (payload.username or "").strip()
    if not username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username is required.")
    token = (payload.bound_access_token or "").strip()
    if len(token) < LOCAL_AUTH_TOKEN_MIN_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"bound_access_token must be at least {LOCAL_AUTH_TOKEN_MIN_LENGTH} characters.",
        )
    if token.lower() in LOCAL_AUTH_TOKEN_PLACEHOLDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="bound_access_token must not be a placeholder.",
        )
    if not (payload.password or "").strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password is required.")
    existing_username = (await session.exec(select(LocalAuthUser).where(LocalAuthUser.username == username))).first()
    if existing_username is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists.")
    existing_token = (
        await session.exec(select(LocalAuthUser).where(LocalAuthUser.bound_access_token == token))
    ).first()
    if existing_token is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="bound_access_token already in use.")
    clerk_user_id = f"local:{username}"
    existing_user = (await session.exec(select(User).where(User.clerk_user_id == clerk_user_id))).first()
    if existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists.")
    from app.services.organizations import ensure_member_for_user

    user = User(
        clerk_user_id=clerk_user_id,
        email=f"{username}@local",
        name=username,
    )
    session.add(user)
    await session.flush()
    password_hash = bcrypt.hashpw(
        payload.password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")
    local_user = LocalAuthUser(
        username=username,
        password_hash=password_hash,
        bound_access_token=token,
        user_id=user.id,
    )
    session.add(local_user)
    await session.flush()
    await ensure_member_for_user(session, user)
    await session.commit()
    await session.refresh(local_user)
    return LocalUserRead(id=local_user.id, username=local_user.username, user_id=local_user.user_id)


@router.post(
    "/bootstrap",
    response_model=UserRead,
    summary="Bootstrap Authenticated User Context",
    description=(
        "Resolve caller identity from auth headers and return the canonical user profile. "
        "This endpoint does not accept a request body."
    ),
    responses={
        status.HTTP_200_OK: {
            "description": "Authenticated user profile resolved from token claims.",
            "content": {
                "application/json": {
                    "example": {
                        "id": "11111111-1111-1111-1111-111111111111",
                        "clerk_user_id": "user_2abcXYZ",
                        "email": "alex@example.com",
                        "name": "Alex Chen",
                        "preferred_name": "Alex",
                        "pronouns": "they/them",
                        "timezone": "America/Los_Angeles",
                        "notes": "Primary operator for board triage.",
                        "context": "Handles incident coordination and escalation.",
                        "is_super_admin": False,
                    }
                }
            },
        },
        status.HTTP_401_UNAUTHORIZED: {
            "model": LLMErrorResponse,
            "description": "Caller is not authenticated as a user actor.",
            "content": {
                "application/json": {
                    "example": {
                        "detail": {"code": "unauthorized", "message": "Not authenticated"},
                        "code": "unauthorized",
                        "retryable": False,
                    }
                }
            },
        },
    },
)
async def bootstrap_user(auth: AuthContext = AUTH_CONTEXT_DEP) -> UserRead:
    """Return the authenticated user profile from token claims."""
    if auth.actor_type != "user" or auth.user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return UserRead.model_validate(auth.user)
