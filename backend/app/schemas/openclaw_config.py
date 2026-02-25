"""Schemas for OpenClaw config directory tree API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ConfigTreeNode(BaseModel):
    """A node in the OpenClaw config directory tree."""

    name: str = Field(description="File or directory name")
    type: Literal["dir", "file"] = Field(description="Whether this is a directory or file")
    children: list["ConfigTreeNode"] | None = Field(
        default=None,
        description="Child nodes for directories; null for files",
    )


ConfigTreeNode.model_rebuild()


class ConfigTreeResponse(BaseModel):
    """Response payload for the config directory tree."""

    root: str = Field(description="Absolute path of the root directory")
    tree: ConfigTreeNode = Field(description="Root node of the directory tree")
