"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConfigTreeNode as ConfigTreeNodeType } from "@/api/openclaw-config";

type ConfigTreeProps = {
  root: string;
  tree: ConfigTreeNodeType;
  onRefresh?: () => void;
};

function TreeNode({
  node,
  depth = 0,
}: {
  node: ConfigTreeNodeType;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = node.type === "dir";
  const hasChildren = isDir && node.children && node.children.length > 0;

  if (node.type === "file") {
    return (
      <div
        className="flex items-center gap-2 py-1 text-sm text-slate-700"
        style={{ paddingLeft: depth * 24 }}
      >
        <span className="flex w-5 shrink-0" aria-hidden />
        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
        <span>{node.name}</span>
      </div>
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
        <span>{node.name}</span>
      </button>
      {expanded && hasChildren && (
        <div>
          {node.children!.map((child, i) => (
            <TreeNode key={`${child.name}-${i}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ConfigTree({ root, tree, onRefresh }: ConfigTreeProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
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
      <div className="max-h-[60vh] overflow-auto p-4">
        <TreeNode node={tree} depth={0} />
      </div>
    </div>
  );
}
