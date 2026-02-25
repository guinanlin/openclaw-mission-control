"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/auth/clerk";
import { useQueryClient } from "@tanstack/react-query";

import { AgentsTable } from "@/components/agents/AgentsTable";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";

import { ApiError } from "@/api/mutator";
import {
  type listAgentsApiV1AgentsGetResponse,
  getListAgentsApiV1AgentsGetQueryKey,
  useCreateAgentApiV1AgentsPost,
  useDeleteAgentApiV1AgentsAgentIdDelete,
  useListAgentsApiV1AgentsGet,
} from "@/api/generated/agents/agents";
import {
  type listBoardsApiV1BoardsGetResponse,
  getListBoardsApiV1BoardsGetQueryKey,
  useListBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import { type AgentCreate, type AgentRead } from "@/api/generated/model";
import { createOptimisticListDeleteMutation } from "@/lib/list-delete";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { useUrlSorting } from "@/lib/use-url-sorting";

const AGENT_SORTABLE_COLUMNS = [
  "name",
  "status",
  "openclaw_session_id",
  "board_id",
  "last_seen_at",
  "updated_at",
];

const DEFAULT_HEARTBEAT_CONFIG = {
  every: "10m",
  target: "last",
  includeReasoning: false,
} as const;

function agentReadToCreatePayload(
  source: AgentRead,
  newName: string,
): AgentCreate {
  const heartbeatConfig =
    source.heartbeat_config &&
    typeof source.heartbeat_config === "object" &&
    Object.keys(source.heartbeat_config).length > 0
      ? (source.heartbeat_config as Record<string, unknown>)
      : { ...DEFAULT_HEARTBEAT_CONFIG };
  return {
    name: newName,
    board_id: source.board_id ?? null,
    heartbeat_config: heartbeatConfig,
    identity_profile: source.identity_profile ?? undefined,
    identity_template: source.identity_template ?? null,
    soul_template: source.soul_template ?? null,
  };
}

const BOARD_FILTER_PARAM = "board";

export default function AgentsPage() {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawBoardId = searchParams.get(BOARD_FILTER_PARAM)?.trim() || null;

  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const { sorting, onSortingChange } = useUrlSorting({
    allowedColumnIds: AGENT_SORTABLE_COLUMNS,
    defaultSorting: [{ id: "name", desc: false }],
    paramPrefix: "agents",
  });

  const [deleteTarget, setDeleteTarget] = useState<AgentRead | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const boardsKey = getListBoardsApiV1BoardsGetQueryKey();

  const boardsQuery = useListBoardsApiV1BoardsGet<
    listBoardsApiV1BoardsGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      refetchInterval: 30_000,
      refetchOnMount: "always",
    },
  });

  const boards = useMemo(
    () =>
      boardsQuery.data?.status === 200
        ? (boardsQuery.data.data.items ?? [])
        : [],
    [boardsQuery.data],
  );

  const sortedBoards = useMemo(
    () => [...boards].sort((a, b) => a.name.localeCompare(b.name)),
    [boards],
  );

  const selectedBoardId = useMemo(() => {
    if (rawBoardId && boards.some((b) => b.id === rawBoardId)) {
      return rawBoardId;
    }
    return sortedBoards[0]?.id ?? null;
  }, [rawBoardId, boards, sortedBoards]);

  const agentsQueryParams = useMemo(
    () => (selectedBoardId ? { board_id: selectedBoardId } : undefined),
    [selectedBoardId],
  );
  const agentsKey = getListAgentsApiV1AgentsGetQueryKey(agentsQueryParams);

  const agentsQuery = useListAgentsApiV1AgentsGet<
    listAgentsApiV1AgentsGetResponse,
    ApiError
  >(agentsQueryParams, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      refetchInterval: 15_000,
      refetchOnMount: "always",
    },
  });

  const agents = useMemo(
    () =>
      agentsQuery.data?.status === 200
        ? (agentsQuery.data.data.items ?? [])
        : [],
    [agentsQuery.data],
  );

  const createAgentMutation = useCreateAgentApiV1AgentsPost<ApiError>({
    mutation: {
      onSuccess: (result) => {
        setCopyError(null);
        if (result.status === 200) {
          queryClient.invalidateQueries({ queryKey: agentsKey });
          queryClient.invalidateQueries({ queryKey: boardsKey });
          router.push(`/agents/${result.data.id}`);
        }
      },
      onError: (err) => {
        setCopyError(err.message ?? "Failed to copy agent.");
      },
    },
  });

  const deleteMutation = useDeleteAgentApiV1AgentsAgentIdDelete<
    ApiError,
    { previous?: listAgentsApiV1AgentsGetResponse }
  >(
    {
      mutation: createOptimisticListDeleteMutation<
        AgentRead,
        listAgentsApiV1AgentsGetResponse,
        { agentId: string }
      >({
        queryClient,
        queryKey: agentsKey,
        getItemId: (agent) => agent.id,
        getDeleteId: ({ agentId }) => agentId,
        onSuccess: () => {
          setDeleteTarget(null);
        },
        invalidateQueryKeys: [agentsKey, boardsKey],
      }),
    },
    queryClient,
  );

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ agentId: deleteTarget.id });
  };

  const handleCopy = (agent: AgentRead) => {
    setCopyError(null);
    if (!agent.board_id) {
      setCopyError("Gateway main agents cannot be copied.");
      return;
    }
    createAgentMutation.mutate({
      data: agentReadToCreatePayload(agent, `Copy of ${agent.name}`),
    });
  };

  useEffect(() => {
    if (!rawBoardId && sortedBoards.length > 0) {
      const params = new URLSearchParams(searchParams.toString());
      params.set(BOARD_FILTER_PARAM, sortedBoards[0].id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [pathname, rawBoardId, router, searchParams, sortedBoards]);

  const handleBoardSelect = (boardId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(BOARD_FILTER_PARAM, boardId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const selectedBoard = useMemo(
    () => boards.find((b) => b.id === selectedBoardId) ?? null,
    [boards, selectedBoardId],
  );

  const descriptionText =
    selectedBoard != null
      ? `${agents.length} agent${agents.length === 1 ? "" : "s"} on ${selectedBoard.name}.`
      : `${agents.length} agent${agents.length === 1 ? "" : "s"}.`;

  return (
    <>
      <DashboardPageLayout
        signedOut={{
          message: "Sign in to view agents.",
          forceRedirectUrl: "/agents",
          signUpForceRedirectUrl: "/agents",
        }}
        title="Agents"
        description={descriptionText}
        headerActions={
          agents.length > 0 ? (
            <Button onClick={() => router.push("/agents/new")}>
              New agent
            </Button>
          ) : null
        }
        isAdmin={isAdmin}
        adminOnlyMessage="Only organization owners and admins can access agents."
        stickyHeader
      >
        {sortedBoards.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {sortedBoards.map((board) => {
              const isSelected = selectedBoardId === board.id;
              return (
                <button
                  key={board.id}
                  type="button"
                  onClick={() => handleBoardSelect(board.id)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isSelected
                      ? "bg-blue-100 text-blue-800"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {board.name}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <AgentsTable
            agents={agents}
            boards={boards}
            isLoading={agentsQuery.isLoading}
            sorting={sorting}
            onSortingChange={onSortingChange}
            showActions
            stickyHeader
            onCopy={handleCopy}
            onDelete={setDeleteTarget}
            emptyState={{
              title: "No agents yet",
              description:
                "Create your first agent to start executing tasks on this board.",
              actionHref: "/agents/new",
              actionLabel: "Create your first agent",
            }}
          />
        </div>

        {agentsQuery.error ? (
          <p className="mt-4 text-sm text-red-500">
            {agentsQuery.error.message}
          </p>
        ) : null}
        {copyError ? (
          <p className="mt-4 text-sm text-red-500">{copyError}</p>
        ) : null}
      </DashboardPageLayout>

      <ConfirmActionDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        ariaLabel="Delete agent"
        title="Delete agent"
        description={
          <>
            This will remove {deleteTarget?.name}. This action cannot be undone.
          </>
        }
        errorMessage={deleteMutation.error?.message}
        onConfirm={handleDelete}
        isConfirming={deleteMutation.isPending}
      />
    </>
  );
}
