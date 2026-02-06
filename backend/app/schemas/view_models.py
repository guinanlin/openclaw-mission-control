from __future__ import annotations

from sqlmodel import SQLModel

from app.schemas.agents import AgentRead
from app.schemas.approvals import ApprovalRead
from app.schemas.board_memory import BoardMemoryRead
from app.schemas.boards import BoardRead
from app.schemas.tasks import TaskRead


class TaskCardRead(TaskRead):
    assignee: str | None = None
    approvals_count: int = 0
    approvals_pending_count: int = 0


class BoardSnapshot(SQLModel):
    board: BoardRead
    tasks: list[TaskCardRead]
    agents: list[AgentRead]
    approvals: list[ApprovalRead]
    chat_messages: list[BoardMemoryRead]
    pending_approvals_count: int = 0
