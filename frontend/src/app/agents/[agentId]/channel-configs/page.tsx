"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useAuth } from "@/auth/clerk";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { buttonVariants } from "@/components/ui/button";

import {
  useListAgentChannelConfigs,
  usePutAgentChannelConfig,
  useDeleteAgentChannelConfig,
  getListAgentChannelConfigsQueryKey,
} from "@/api/generated/agents/agentChannelConfigs";
import { useQueryClient } from "@tanstack/react-query";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import type { AgentChannelConfigRead } from "@/api/generated/model";

const CHANNEL_TYPE_LABELS: Record<string, string> = {
  feishu: "飞书",
};

export default function AgentChannelConfigsPage() {
  const params = useParams();
  const agentId = typeof params?.agentId === "string" ? params.agentId : "";
  const queryClient = useQueryClient();
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const [feishuForm, setFeishuForm] = useState({ appId: "", appSecret: "", botName: "" });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentChannelConfigRead | null>(null);

  const listQuery = useListAgentChannelConfigs(agentId, {
    query: { enabled: Boolean(agentId && isSignedIn && isAdmin) },
  });
  const putMutation = usePutAgentChannelConfig(agentId, "feishu", {
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAgentChannelConfigsQueryKey(agentId) });
        setFeishuForm({ appId: "", appSecret: "", botName: "" });
        setSubmitError(null);
      },
      onError: (err) => setSubmitError(err.message),
    },
  });
  const deleteMutation = useDeleteAgentChannelConfig(agentId, "feishu", {
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAgentChannelConfigsQueryKey(agentId) });
        setDeleteTarget(null);
      },
    },
  });

  const configs = listQuery.data?.status === 200 ? listQuery.data.data : [];
  const hasFeishu = configs.some((c) => c.channel_type === "feishu");

  const handleSubmitFeishu = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const appId = feishuForm.appId.trim();
    const appSecret = feishuForm.appSecret.trim();
    const botName = feishuForm.botName.trim();
    if (!appId || !appSecret) {
      setSubmitError("App ID 和 App Secret 必填");
      return;
    }
    putMutation.mutate({
      config: {
        appId,
        appSecret,
        ...(botName ? { botName } : {}),
      },
    });
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(undefined);
  };

  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to manage channel config.",
        forceRedirectUrl: `/agents/${agentId}/channel-configs`,
      }}
      title="Channel 配置"
      description={
        agentId ? (
          <>
            为 Agent 配置渠道（如飞书）。配置将写回 OpenClaw。
            <Link
              href="/agents"
              className={buttonVariants({ variant: "link", size: "sm" })}
              style={{ marginLeft: 8 }}
            >
              返回 Agents
            </Link>
          </>
        ) : null
      }
      isAdmin={isAdmin}
      adminOnlyMessage="仅组织管理员可管理 Channel 配置。"
      stickyHeader
    >
      {!agentId ? (
        <p className="text-sm text-slate-500">缺少 agent ID。</p>
      ) : listQuery.isLoading ? (
        <p className="text-sm text-slate-500">加载中…</p>
      ) : listQuery.error ? (
        <p className="text-sm text-red-500">{listQuery.error.message}</p>
      ) : (
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-800">已配置渠道</h2>
            {configs.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">暂无渠道配置。</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {configs.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
                  >
                    <span className="text-sm text-slate-700">
                      {CHANNEL_TYPE_LABELS[c.channel_type] ?? c.channel_type}：account_id = {c.account_id}
                      {typeof c.config?.botName === "string" && c.config.botName
                        ? `（${c.config.botName}）`
                        : ""}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(c)}
                      className="text-red-600 hover:text-red-700"
                    >
                      删除
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!hasFeishu && (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800">添加飞书</h2>
              <form onSubmit={handleSubmitFeishu} className="mt-4 max-w-md space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">App ID</label>
                  <input
                    type="text"
                    value={feishuForm.appId}
                    onChange={(e) => setFeishuForm((p) => ({ ...p, appId: e.target.value }))}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="cli_xxx"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">App Secret</label>
                  <input
                    type="password"
                    value={feishuForm.appSecret}
                    onChange={(e) => setFeishuForm((p) => ({ ...p, appSecret: e.target.value }))}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="密钥"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Bot 名称（可选）</label>
                  <input
                    type="text"
                    value={feishuForm.botName}
                    onChange={(e) => setFeishuForm((p) => ({ ...p, botName: e.target.value }))}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="机器人在飞书中的显示名"
                  />
                </div>
                {submitError && (
                  <p className="text-sm text-red-500">{submitError}</p>
                )}
                <Button type="submit" disabled={putMutation.isPending}>
                  {putMutation.isPending ? "保存中…" : "保存并写回 OpenClaw"}
                </Button>
              </form>
            </section>
          )}

          {hasFeishu && (
            <p className="text-sm text-slate-500">
              该 Agent 已配置飞书。如需更换凭证，请先删除后重新添加。
            </p>
          )}
        </div>
      )}

      <ConfirmActionDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="删除渠道配置？"
        description={
          deleteTarget
            ? `将删除「${CHANNEL_TYPE_LABELS[deleteTarget.channel_type] ?? deleteTarget.channel_type}」配置，并同步从 OpenClaw 移除。`
            : ""
        }
        errorMessage={deleteMutation.error?.message}
        onConfirm={handleConfirmDelete}
        isConfirming={deleteMutation.isPending}
      />
    </DashboardPageLayout>
  );
}
