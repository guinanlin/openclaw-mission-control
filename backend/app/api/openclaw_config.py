"""API routes for OpenClaw config directory tree (Core Directory feature)."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import require_org_admin
from app.core.config import settings
from app.schemas.openclaw_config import ConfigTreeResponse, ConfigTreeNode
from app.services.organizations import OrganizationContext

router = APIRouter(prefix="/openclaw", tags=["openclaw-config"])
ORG_ADMIN_DEP = Depends(require_org_admin)

MAX_DEPTH = 10
MAX_NODES = 500


def _build_tree(
    path: Path,
    *,
    depth: int,
    node_count: list[int],
) -> ConfigTreeNode:
    """Recursively build directory tree, respecting depth and node limits."""
    if depth >= MAX_DEPTH or node_count[0] >= MAX_NODES:
        return ConfigTreeNode(name=path.name, type="dir", children=[])

    if path.is_file():
        node_count[0] += 1
        return ConfigTreeNode(name=path.name, type="file", children=None)

    node_count[0] += 1
    children: list[ConfigTreeNode] = []
    try:
        entries = sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except OSError:
        return ConfigTreeNode(name=path.name, type="dir", children=[])

    for entry in entries:
        if node_count[0] >= MAX_NODES:
            break
        children.append(
            _build_tree(entry, depth=depth + 1, node_count=node_count),
        )
    return ConfigTreeNode(name=path.name, type="dir", children=children)


@router.get("/config-tree", response_model=ConfigTreeResponse)
async def get_config_tree(
    _ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> ConfigTreeResponse:
    """Return the OpenClaw config directory (~/.openclaw/) as a tree structure."""
    raw_path = (settings.openclaw_config_dir or "~/.openclaw").strip()
    root_path = Path(raw_path).expanduser().resolve()
    if not root_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="OpenClaw config directory not found",
        ) from None
    if not root_path.is_dir():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="OpenClaw config path is not a directory",
        ) from None
    node_count: list[int] = [0]
    tree = _build_tree(root_path, depth=0, node_count=node_count)
    return ConfigTreeResponse(root=str(root_path), tree=tree)
