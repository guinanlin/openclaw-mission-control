"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useQueryClient } from "@tanstack/react-query";

import { StatusPill } from "@/components/atoms/StatusPill";
import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, useAuthedMutation, useAuthedQuery } from "@/lib/api-query";

type Agent = {
  id: string;
  name: string;
  status: string;
  openclaw_session_id?: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  board_id?: string | null;
};

type Board = {
  id: string;
  name: string;
  slug: string;
};

type GatewayStatus = {
  connected: boolean;
  gateway_url: string;
  sessions_count?: number;
  sessions?: Record<string, unknown>[];
  error?: string;
};

const parseTimestamp = (value?: string | null) => {
  if (!value) return null;
  const hasTz = /[zZ]|[+-]\d\d:\d\d$/.test(value);
  const normalized = hasTz ? value : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const formatTimestamp = (value?: string | null) => {
  const date = parseTimestamp(value);
  if (!date) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatRelative = (value?: string | null) => {
  const date = parseTimestamp(value);
  if (!date) return "—";
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
};

const truncate = (value?: string | null, max = 18) => {
  if (!value) return "—";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
};

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const [boardId, setBoardId] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ]);

  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);

  const boardsQuery = useAuthedQuery<Board[]>(["boards"], "/api/v1/boards", {
    refetchInterval: 30_000,
    refetchOnMount: "always",
  });
  const agentsQuery = useAuthedQuery<Agent[]>(["agents"], "/api/v1/agents", {
    refetchInterval: 15_000,
    refetchOnMount: "always",
  });

  const boards = useMemo(() => boardsQuery.data ?? [], [boardsQuery.data]);
  const agents = useMemo(() => agentsQuery.data ?? [], [agentsQuery.data]);

  useEffect(() => {
    if (!boardId && boards.length > 0) {
      setBoardId(boards[0].id);
    }
  }, [boardId, boards]);

  const statusPath = boardId
    ? `/api/v1/gateways/status?board_id=${boardId}`
    : null;

  const gatewayStatusQuery = useAuthedQuery<GatewayStatus>(
    ["gateway-status", boardId || "all"],
    statusPath,
    {
      enabled: Boolean(statusPath),
      refetchInterval: 15_000,
    }
  );

  const gatewayStatus = gatewayStatusQuery.data ?? null;

  const deleteMutation = useAuthedMutation<void, Agent, { previous?: Agent[] }>(
    async (agent, token) =>
      apiRequest(`/api/v1/agents/${agent.id}`, {
        method: "DELETE",
        token,
      }),
    {
      onMutate: async (agent) => {
        await queryClient.cancelQueries({ queryKey: ["agents"] });
        const previous = queryClient.getQueryData<Agent[]>(["agents"]);
        queryClient.setQueryData<Agent[]>(["agents"], (old = []) =>
          old.filter((item) => item.id !== agent.id)
        );
        return { previous };
      },
      onError: (_error, _agent, context) => {
        if (context?.previous) {
          queryClient.setQueryData(["agents"], context.previous);
        }
      },
      onSuccess: () => {
        setDeleteTarget(null);
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: ["agents"] });
      },
    }
  );

  const sortedAgents = useMemo(() => [...agents], [agents]);

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget);
  };

  const handleRefresh = async () => {
    await Promise.all([
      boardsQuery.refetch(),
      agentsQuery.refetch(),
      gatewayStatusQuery.refetch(),
    ]);
  };

  const columns = useMemo<ColumnDef<Agent>[]>(
    () => {
      const resolveBoardName = (agent: Agent) =>
        boards.find((board) => board.id === agent.board_id)?.name ?? "—";

      return [
        {
          accessorKey: "name",
          header: "Agent",
          cell: ({ row }) => (
            <div>
              <p className="font-medium text-strong">{row.original.name}</p>
              <p className="text-xs text-quiet">ID {row.original.id}</p>
            </div>
          ),
        },
        {
          accessorKey: "status",
          header: "Status",
          cell: ({ row }) => <StatusPill status={row.original.status} />,
        },
        {
          accessorKey: "openclaw_session_id",
          header: "Session",
          cell: ({ row }) => (
            <span className="text-xs text-muted">
              {truncate(row.original.openclaw_session_id)}
            </span>
          ),
        },
        {
          accessorKey: "board_id",
          header: "Board",
          cell: ({ row }) => (
            <span className="text-xs text-muted">
              {resolveBoardName(row.original)}
            </span>
          ),
        },
        {
          accessorKey: "last_seen_at",
          header: "Last seen",
          cell: ({ row }) => (
            <div className="text-xs text-muted">
              <p className="font-medium text-strong">
                {formatRelative(row.original.last_seen_at)}
              </p>
              <p className="text-quiet">
                {formatTimestamp(row.original.last_seen_at)}
              </p>
            </div>
          ),
        },
        {
          accessorKey: "updated_at",
          header: "Updated",
          cell: ({ row }) => (
            <span className="text-xs text-muted">
              {formatTimestamp(row.original.updated_at)}
            </span>
          ),
        },
        {
          id: "actions",
          header: "",
          cell: ({ row }) => (
            <div
              className="flex items-center justify-end gap-2"
              onClick={(event) => event.stopPropagation()}
            >
              <Link
                href={`/agents/${row.original.id}`}
                className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              >
                View
              </Link>
              <Link
                href={`/agents/${row.original.id}/edit`}
                className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              >
                Edit
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteTarget(row.original)}
              >
                Delete
              </Button>
            </div>
          ),
        },
      ];
    },
    [boards]
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: sortedAgents,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <DashboardShell>
      <SignedOut>
        <div className="col-span-2 flex min-h-[calc(100vh-64px)] items-center justify-center bg-slate-50 p-10 text-center">
          <div className="rounded-xl border border-slate-200 bg-white px-8 py-6 shadow-sm">
            <p className="text-sm text-slate-600">Sign in to view agents.</p>
            <SignInButton
              mode="modal"
              forceRedirectUrl="/agents"
              signUpForceRedirectUrl="/agents"
            >
              <Button className="mt-4">Sign in</Button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>
      <SignedIn>
        <DashboardSidebar />
        <main className="flex-1 overflow-y-auto bg-slate-50">
          <div className="border-b border-slate-200 bg-white px-8 py-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-heading text-2xl font-semibold text-slate-900 tracking-tight">
                  Agents
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {agents.length} agent{agents.length === 1 ? "" : "s"} total.
                </p>
              </div>
              {agents.length > 0 ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={handleRefresh}
                    disabled={agentsQuery.isLoading}
                  >
                    Refresh
                  </Button>
                  <Button onClick={() => router.push("/agents/new")}>
                    New agent
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="p-8">
            {agentsQuery.error ? (
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600 shadow-sm">
                {agentsQuery.error.message}
              </div>
            ) : null}

            {agents.length === 0 && !agentsQuery.isLoading ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-slate-200 bg-white/70 p-10 text-center text-sm text-slate-500">
                <p>No agents yet. Create your first agent to get started.</p>
                <Button onClick={() => router.push("/agents/new")}>
                  Create your first agent
                </Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                          {headerGroup.headers.map((header) => (
                            <th
                              key={header.id}
                              className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                            >
                              {header.isPlaceholder
                                ? null
                                : flexRender(
                                    header.column.columnDef.header,
                                    header.getContext()
                                  )}
                            </th>
                          ))}
                        </tr>
                      ))}
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {table.getRowModel().rows.map((row) => (
                        <tr
                          key={row.id}
                          className="cursor-pointer transition hover:bg-slate-50"
                          onClick={() => router.push(`/agents/${row.original.id}`)}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="px-4 py-3 align-top">
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Gateway status
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {gatewayStatus?.gateway_url ?? "Gateway URL not set"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Select
                    value={boardId}
                    onValueChange={(value) => setBoardId(value)}
                    disabled={boards.length === 0}
                  >
                    <SelectTrigger className="h-8 w-[200px]">
                      <SelectValue placeholder="Select board" />
                    </SelectTrigger>
                    <SelectContent>
                      {boards.map((board) => (
                        <SelectItem key={board.id} value={board.id}>
                          {board.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <StatusPill status={gatewayStatus?.connected ? "online" : "offline"} />
                  <span className="text-xs text-slate-500">
                    {gatewayStatus?.sessions_count ?? 0} sessions
                  </span>
                </div>
              </div>
              {gatewayStatus?.error ? (
                <p className="mt-3 text-xs text-red-600">{gatewayStatus.error}</p>
              ) : null}
              {gatewayStatusQuery.error ? (
                <p className="mt-3 text-xs text-red-600">
                  {gatewayStatusQuery.error.message}
                </p>
              ) : null}
            </div>
          </div>
        </main>
      </SignedIn>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent aria-label="Delete agent">
          <DialogHeader>
            <DialogTitle>Delete agent</DialogTitle>
            <DialogDescription>
              This will remove {deleteTarget?.name}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteMutation.error ? (
            <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3 text-xs text-muted">
              {deleteMutation.error.message}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
