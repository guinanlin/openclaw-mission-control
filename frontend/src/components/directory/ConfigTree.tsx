"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConfigTreeNode as ConfigTreeNodeType } from "@/api/openclaw-config";

type ConfigTreeProps = {
  root: string;
  tree: ConfigTreeNodeType;
  onRefresh?: () => void;
  onFileSelect?: (relativePath: string) => void;
  selectedPath?: string | null;
};

function TreeNode({
  node,
  depth = 0,
  parentPath = "",
  onFileSelect,
  selectedPath,
}: {
  node: ConfigTreeNodeType;
  depth?: number;
  parentPath?: string;
  onFileSelect?: (relativePath: string) => void;
  selectedPath?: string | null;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = node.type === "dir";
  const hasChildren = isDir && node.children && node.children.length > 0;
  const relativePath =
    parentPath ? `${parentPath}/${node.name}` : node.name;
  const isSelected = selectedPath === relativePath;

  if (node.type === "file") {
    return (
      <button
        type="button"
        onClick={() => onFileSelect?.(relativePath)}
        className={cn(
          "flex w-full items-center gap-2 rounded py-1 text-left text-sm text-slate-700 transition hover:bg-slate-100",
          isSelected && "bg-amber-50 text-amber-900 hover:bg-amber-100",
        )}
        style={{ paddingLeft: depth * 24 }}
      >
        <span className="flex w-5 shrink-0" aria-hidden />
        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  return (
    <div className="py-0.5">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          "flex w-full items-center gap-2 rounded py-1 text-left text-sm text-slate-700 transition hover:bg-slate-100",
        )}
        style={{ paddingLeft: depth * 24 }}
      >
        <span className="flex w-5 shrink-0">
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-500" />
            )
          ) : null}
        </span>
        {expanded ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-amber-500" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {expanded && hasChildren && (
        <div>
          {node.children!.map((child, i) => (
            <TreeNode
              key={`${child.name}-${i}`}
              node={child}
              depth={depth + 1}
              parentPath={depth === 0 ? "" : relativePath}
              onFileSelect={onFileSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ConfigTree({
  root,
  tree,
  onRefresh,
  onFileSelect,
  selectedPath,
}: ConfigTreeProps) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <p className="text-xs text-slate-500">
          Root: <span className="font-mono text-slate-600">{root}</span>
        </p>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            className="rounded px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-800"
          >
            Refresh
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <TreeNode
          node={tree}
          depth={0}
          parentPath=""
          onFileSelect={onFileSelect}
          selectedPath={selectedPath}
        />
      </div>
    </div>
  );
}
