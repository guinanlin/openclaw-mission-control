"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useAuth } from "@/auth/clerk";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { ApiError } from "@/api/mutator";
import {
  type listGatewaysApiV1GatewaysGetResponse,
  useGetGatewayMainAgentApiV1GatewaysGatewayIdMainAgentGet,
  useListGatewaysApiV1GatewaysGet,
} from "@/api/generated/gateways/gateways";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import type { GatewayRead } from "@/api/generated/model";

function readDefault<T>(defaults: Record<string, unknown>, path: string): T | undefined {
  const parts = path.split(".");
  let current: unknown = defaults;
  for (const key of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current as T;
}

export default function MainAgentPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>(null);

  const gatewaysQuery = useListGatewaysApiV1GatewaysGet<
    listGatewaysApiV1GatewaysGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      refetchInterval: 30_000,
      refetchOnMount: "always",
    },
  });

  const gateways = useMemo(
    () =>
      gatewaysQuery.data?.status === 200
        ? (gatewaysQuery.data.data.items ?? [])
        : [],
    [gatewaysQuery.data],
  );

  // Default to first gateway when list loads so Main Agent config shows immediately
  useEffect(() => {
    if (gateways.length > 0) {
      if (selectedGatewayId === null) {
        setSelectedGatewayId(gateways[0].id);
      } else if (!gateways.some((g) => g.id === selectedGatewayId)) {
        setSelectedGatewayId(gateways[0].id);
      }
    } else {
      setSelectedGatewayId(null);
    }
  }, [gateways, selectedGatewayId]);

  const mainAgentQuery = useGetGatewayMainAgentApiV1GatewaysGatewayIdMainAgentGet(
    selectedGatewayId ?? "",
    {
      query: {
        enabled: Boolean(selectedGatewayId),
        refetchOnMount: "always",
      },
    },
  );

  const mainAgentData =
    mainAgentQuery.data?.status === 200 ? mainAgentQuery.data.data : null;
  const defaults = mainAgentData?.defaults ?? {};
  const primary = readDefault<string>(defaults, "model.primary");
  const fallbacks = readDefault<string[]>(defaults, "model.fallbacks") ?? [];
  const models = readDefault<Record<string, { alias?: string }>>(defaults, "models") ?? {};
  const workspace = readDefault<string>(defaults, "workspace");
  const compactionMode = readDefault<string>(defaults, "compaction.mode");
  const maxConcurrent = readDefault<number>(defaults, "maxConcurrent");
  const subagentsMaxConcurrent = readDefault<number>(defaults, "subagents.maxConcurrent");
  const mainKey = mainAgentData?.main_key;

  const gatewayError =
    mainAgentQuery.error &&
    (mainAgentQuery.data == null || mainAgentQuery.data.status !== 200);
  const gatewayErrorMessage = mainAgentQuery.error?.message ?? null;

  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to view Main Agent config.",
        forceRedirectUrl: "/main-agent",
      }}
      title="Main Agent"
      description="View OpenClaw default agent config (model, workspace, concurrency) per gateway"
      isAdmin={isAdmin}
      adminOnlyMessage="Only organization owners and admins can access Main Agent config."
      stickyHeader
    >
      {gatewaysQuery.isLoading ? (
        <p className="text-sm text-slate-500">Loading gateways…</p>
      ) : gateways.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-slate-600">No gateways yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Add a gateway first to view its Main Agent config.
          </p>
          <Link
            href="/gateways"
            className={buttonVariants({ variant: "primary", size: "md" })}
            style={{ marginTop: "1rem" }}
          >
            Go to Gateways
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Gateway
            </label>
            <Select
              value={selectedGatewayId ?? ""}
              onValueChange={(value) => setSelectedGatewayId(value || null)}
            >
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Select a gateway" />
              </SelectTrigger>
              <SelectContent>
                {gateways.map((gw: GatewayRead) => (
                  <SelectItem key={gw.id} value={gw.id}>
                    {gw.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedGatewayId && (
            <>
              {mainAgentQuery.isLoading ? (
                <p className="text-sm text-slate-500">Loading Main Agent config…</p>
              ) : gatewayError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {gatewayErrorMessage ?? "Failed to load Main Agent config."}
                </div>
              ) : mainAgentData ? (
                <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-800">
                    Main Agent config
                    {mainKey ? (
                      <span className="ml-2 text-sm font-normal text-slate-500">
                        (main: {mainKey})
                      </span>
                    ) : null}
                  </h2>

                  <dl className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
                    {primary != null && (
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                          Primary model
                        </dt>
                        <dd className="mt-1 font-mono text-sm text-slate-800">
                          {primary}
                        </dd>
                      </div>
                    )}
                    {workspace != null && (
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                          Workspace
                        </dt>
                        <dd className="mt-1 font-mono text-sm text-slate-800">
                          {workspace}
                        </dd>
                      </div>
                    )}
                    {compactionMode != null && (
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                          Compaction mode
                        </dt>
                        <dd className="mt-1 text-sm text-slate-800">
                          {compactionMode}
                        </dd>
                      </div>
                    )}
                    {maxConcurrent != null && (
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                          Max concurrent
                        </dt>
                        <dd className="mt-1 text-sm text-slate-800">
                          {maxConcurrent}
                        </dd>
                      </div>
                    )}
                    {subagentsMaxConcurrent != null && (
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                          Subagents max concurrent
                        </dt>
                        <dd className="mt-1 text-sm text-slate-800">
                          {subagentsMaxConcurrent}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {fallbacks.length > 0 && (
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        Fallback models
                      </dt>
                      <ul className="mt-1 list-inside list-disc font-mono text-sm text-slate-800">
                        {fallbacks.map((fb, i) => (
                          <li key={i}>{fb}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {Object.keys(models).length > 0 && (
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        Model aliases
                      </dt>
                      <div className="mt-1 overflow-x-auto rounded border border-slate-200">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                              <th className="px-3 py-2 text-left font-medium text-slate-600">
                                Model ID
                              </th>
                              <th className="px-3 py-2 text-left font-medium text-slate-600">
                                Alias
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(models).map(([id, meta]) => (
                              <tr
                                key={id}
                                className="border-b border-slate-100 last:border-0"
                              >
                                <td className="px-3 py-2 font-mono text-slate-800">
                                  {id}
                                </td>
                                <td className="px-3 py-2 text-slate-700">
                                  {meta?.alias ?? "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      {gatewaysQuery.error ? (
        <p className="mt-4 text-sm text-red-500">{gatewaysQuery.error.message}</p>
      ) : null}
    </DashboardPageLayout>
  );
}
