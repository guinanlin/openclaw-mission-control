# ruff: noqa: S101
"""Validation tests for gateway requirements on board mutations."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from app.api import boards
from app.models.boards import Board
from app.models.gateways import Gateway
from app.schemas.boards import BoardUpdate


def _gateway(*, organization_id: UUID) -> Gateway:
    return Gateway(
        id=uuid4(),
        organization_id=organization_id,
        name="Main Gateway",
        url="ws://gateway.example/ws",
        workspace_root="/tmp/openclaw",
    )


@pytest.mark.asyncio
async def test_require_gateway_returns_gateway_when_valid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    organization_id = uuid4()
    gateway = _gateway(organization_id=organization_id)

    async def _fake_get_by_id(_session: object, _model: object, _gateway_id: object) -> Gateway:
        return gateway

    monkeypatch.setattr(boards.crud, "get_by_id", _fake_get_by_id)

    resolved = await boards._require_gateway(
        session=object(),  # type: ignore[arg-type]
        gateway_id=gateway.id,
        organization_id=organization_id,
    )

    assert resolved.id == gateway.id


@pytest.mark.asyncio
async def test_apply_board_update_propagates_gateway_validation_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    board = Board(
        id=uuid4(),
        organization_id=uuid4(),
        name="Platform",
        slug="platform",
        gateway_id=uuid4(),
    )
    payload = BoardUpdate(name="Platform X")
    calls: list[UUID] = []

    async def _fake_require_gateway(
        _session: object,
        gateway_id: object,
        *,
        organization_id: UUID | None = None,
    ) -> Gateway:
        _ = organization_id
        if not isinstance(gateway_id, UUID):
            raise AssertionError("expected UUID gateway id")
        calls.append(gateway_id)
        raise HTTPException(status_code=422, detail="gateway_id is invalid")

    async def _fake_save(_session: object, _board: Board) -> Board:
        return _board

    monkeypatch.setattr(boards, "_require_gateway", _fake_require_gateway)
    monkeypatch.setattr(boards.crud, "save", _fake_save)

    with pytest.raises(HTTPException) as exc_info:
        await boards._apply_board_update(
            payload=payload,
            session=object(),  # type: ignore[arg-type]
            board=board,
        )

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "gateway_id is invalid"
    assert calls == [board.gateway_id]
