from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import desc
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import ActorContext, require_admin_or_agent
from app.db.pagination import paginate
from app.db.session import get_session
from app.models.activity_events import ActivityEvent
from app.schemas.activity_events import ActivityEventRead
from app.schemas.pagination import DefaultLimitOffsetPage

router = APIRouter(prefix="/activity", tags=["activity"])


@router.get("", response_model=DefaultLimitOffsetPage[ActivityEventRead])
async def list_activity(
    session: AsyncSession = Depends(get_session),
    actor: ActorContext = Depends(require_admin_or_agent),
) -> DefaultLimitOffsetPage[ActivityEventRead]:
    statement = select(ActivityEvent)
    if actor.actor_type == "agent" and actor.agent:
        statement = statement.where(ActivityEvent.agent_id == actor.agent.id)
    statement = statement.order_by(desc(col(ActivityEvent.created_at)))
    return await paginate(session, statement)
