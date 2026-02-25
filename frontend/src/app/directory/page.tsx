"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/clerk";
import { ConfigTree } from "@/components/directory/ConfigTree";
import { FileContentViewer } from "@/components/directory/FileContentViewer";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { buttonVariants } from "@/components/ui/button";
import { getConfigTree } from "@/api/openclaw-config";
import { ApiError } from "@/api/mutator";
import { useOrganizationMembership } from "@/lib/use-organization-membership";

export default function DirectoryPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const treeQuery = useQuery({
    queryKey: ["openclaw-config-tree"],
    queryFn: getConfigTree,
    enabled: Boolean(isSignedIn && isAdmin),
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 404) return false;
      return failureCount < 2;
    },
  });

  const isLoading = treeQuery.isLoading;
  const isError = treeQuery.isError;
  const error = treeQuery.error;
  const data = treeQuery.data;
  const refetch = treeQuery.refetch;

  const errorMessage =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Failed to load config tree";

  return (
    <DashboardPageLayout
      title="Directory"
      description="View the OpenClaw config directory (~/.openclaw/) structure."
      headerActions={
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isLoading}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          Refresh
        </button>
      }
      isAdmin={isAdmin}
      adminOnlyMessage="Only organization owners and admins can view the OpenClaw config directory."
    >
      {isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
          </div>
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
          <p className="font-medium">{errorMessage}</p>
          <p className="mt-1 text-rose-700">
            {error instanceof ApiError && error.status === 404
              ? "Check OPENCLAW_CONFIG_DIR or Docker volume mount."
              : "Check backend logs or network connection."}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className={buttonVariants({
              variant: "secondary",
              size: "sm",
              className: "mt-3",
            })}
          >
            Retry
          </button>
        </div>
      ) : data ? (
        <div className="flex h-[calc(100vh-220px)] min-h-[400px] gap-4">
          <div className="w-[30%] min-w-[200px] flex-shrink-0">
            <ConfigTree
              root={data.root}
              tree={data.tree}
              onRefresh={() => refetch()}
              onFileSelect={setSelectedPath}
              selectedPath={selectedPath}
            />
          </div>
          <div className="min-w-0 flex-1">
            <FileContentViewer relativePath={selectedPath} />
          </div>
        </div>
      ) : null}
    </DashboardPageLayout>
  );
}
