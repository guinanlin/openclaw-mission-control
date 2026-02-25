"use client";

import { useQuery } from "@tanstack/react-query";
import { FileCode2 } from "lucide-react";
import { getConfigFileContent } from "@/api/openclaw-config";
import { ApiError } from "@/api/mutator";

type FileContentViewerProps = {
  relativePath: string | null;
};

export function FileContentViewer({ relativePath }: FileContentViewerProps) {
  const query = useQuery({
    queryKey: ["openclaw-config-file", relativePath],
    queryFn: () => getConfigFileContent(relativePath!),
    enabled: Boolean(relativePath),
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 404) return false;
      return failureCount < 2;
    },
  });

  if (!relativePath) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50/50 text-slate-500">
        <FileCode2 className="mb-2 h-12 w-12 text-slate-300" />
        <p className="text-sm">Select a file from the tree to view its content</p>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-lg border border-slate-200 bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
        <p className="mt-2 text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  if (query.isError) {
    const err = query.error;
    const msg =
      err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to load file";
    return (
      <div className="flex h-full flex-col justify-center rounded-lg border border-rose-200 bg-rose-50/50 p-6">
        <p className="font-medium text-rose-800">Error</p>
        <p className="mt-1 text-sm text-rose-700">{msg}</p>
      </div>
    );
  }

  const data = query.data;
  if (!data) return null;

  const ext = relativePath.split(".").pop()?.toLowerCase() ?? "";
  const isJson = ext === "json";
  const isYaml = ext === "yaml" || ext === "yml";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
        <FileCode2 className="h-4 w-4 text-slate-500" />
        <span className="font-mono text-sm text-slate-600">{relativePath}</span>
      </div>
      <pre
        className="flex-1 overflow-auto p-4 text-sm leading-relaxed text-slate-800"
        style={{ fontFamily: "ui-monospace, monospace" }}
      >
        <code className={isJson || isYaml ? "whitespace-pre" : ""}>
          {data.content}
        </code>
      </pre>
    </div>
  );
}
