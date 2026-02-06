from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence
from typing import Any, TypeVar, cast

from fastapi_pagination.ext.sqlalchemy import paginate as _paginate
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel.sql.expression import Select, SelectOfScalar

from app.schemas.pagination import DefaultLimitOffsetPage

T = TypeVar("T")

Transformer = Callable[[Sequence[Any]], Sequence[Any] | Awaitable[Sequence[Any]]]


async def paginate(
    session: AsyncSession,
    statement: Select[Any] | SelectOfScalar[Any],
    *,
    transformer: Transformer | None = None,
) -> DefaultLimitOffsetPage[T]:
    # fastapi-pagination is not fully typed (it returns Any), but response_model validation
    # ensures runtime correctness. Centralize casts here to keep strict mypy clean.
    return cast(
        DefaultLimitOffsetPage[T],
        await _paginate(session, statement, transformer=transformer),
    )
