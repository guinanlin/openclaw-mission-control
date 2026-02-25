"""API routes for OpenClaw config directory tree (Core Directory feature)."""

from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import require_org_admin
from app.core.config import settings
from app.schemas.openclaw_config import ConfigTreeResponse, ConfigTreeNode
from app.services.organizations import OrganizationContext

router = APIRouter(prefix="/openclaw", tags=["openclaw-config"])
ORG_ADMIN_DEP = Depends(require_org_admin)

MAX_DEPTH = 10
MAX_NODES = 2000


def _build_tree(
    path: Path,
    *,
    depth: int,
    node_count: list[int],
    is_root_level: bool = False,
) -> ConfigTreeNode:
    """Recursively build directory tree, respecting depth and node limits.

    At root level (depth 0), we always include all direct children so that
    identity, logs, etc. are never truncated when agents/credentials/extensions
    have many nested nodes.
    """
    if depth >= MAX_DEPTH or (not is_root_level and node_count[0] >= MAX_NODES):
        # When truncating, preserve correct type (file vs dir) for display
        is_file = not path.is_dir()
        if is_file:
            node_count[0] += 1
            return ConfigTreeNode(name=path.name, type="file", children=None)
        return ConfigTreeNode(name=path.name, type="dir", children=[])

    # Only treat as directory if it actually is one; otherwise show as file.
    # This prevents symlinks, broken symlinks, or special files from being
    # misrendered as folders (e.g. openclaw.json showing a folder icon).
    if not path.is_dir():
        node_count[0] += 1
        return ConfigTreeNode(name=path.name, type="file", children=None)

    node_count[0] += 1
    children: list[ConfigTreeNode] = []
    try:
        entries = sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except OSError:
        return ConfigTreeNode(name=path.name, type="dir", children=[])

    for entry in entries:
        # At root level, always add all children; otherwise respect MAX_NODES
        if not is_root_level and node_count[0] >= MAX_NODES:
            break
        children.append(
            _build_tree(
                entry,
                depth=depth + 1,
                node_count=node_count,
                is_root_level=False,  # Only root (depth 0) gets is_root_level=True
            ),
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
    tree = _build_tree(root_path, depth=0, node_count=node_count, is_root_level=True)
    return ConfigTreeResponse(root=str(root_path), tree=tree)


def _resolve_config_path(relative_path: str) -> Path:
    """Resolve a relative path within OPENCLAW_CONFIG_DIR; raise if outside."""
    raw = (settings.openclaw_config_dir or "~/.openclaw").strip()
    root = Path(raw).expanduser().resolve()
    if not root.is_dir():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="OpenClaw config directory not found",
        ) from None
    clean = Path(relative_path.lstrip("/"))
    if ".." in clean.parts or clean.is_absolute():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path must be relative and cannot contain '..'",
        ) from None
    root_resolved = root.resolve()
    full = (root_resolved / clean).resolve()
    try:
        full.relative_to(root_resolved)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Path is outside config directory",
        ) from None
    return full


@router.get("/config-file")
async def get_config_file(
    path: str = Query(..., description="Relative path within the config directory"),
    _ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> dict:
    """Return file content for a path under the OpenClaw config directory.

    Path must be relative (e.g. openclaw.json, agents/main).
    Binary files return an error.
    """
    full_path = _resolve_config_path(path)
    if not full_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File or directory not found",
        ) from None
    if full_path.is_dir():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path is a directory; only files can be read",
        ) from None

    mime, _ = mimetypes.guess_type(str(full_path))
    if mime and not mime.startswith("text/") and mime not in (
        "application/json",
        "application/yaml",
        "application/x-yaml",
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Binary files cannot be displayed",
        ) from None

    try:
        content = full_path.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not read file",
        ) from e

    return {"path": path, "content": content}
