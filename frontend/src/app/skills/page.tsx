"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

import { useAuth } from "@/auth/clerk";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Package, PlusCircle, Trash2 } from "lucide-react";

import { ApiError } from "@/api/mutator";
import {
  type listGatewaysApiV1GatewaysGetResponse,
  useListGatewaysApiV1GatewaysGet,
} from "@/api/generated/gateways/gateways";
import type { MarketplaceSkillCardRead } from "@/api/generated/model";
import {
  getListMarketplaceSkillsApiV1SkillsMarketplaceGetQueryKey,
  type listMarketplaceSkillsApiV1SkillsMarketplaceGetResponse,
  useCreateMarketplaceSkillApiV1SkillsMarketplacePost,
  useDeleteMarketplaceSkillApiV1SkillsMarketplaceSkillIdDelete,
  useInstallMarketplaceSkillApiV1SkillsMarketplaceSkillIdInstallPost,
  useListMarketplaceSkillsApiV1SkillsMarketplaceGet,
  useUninstallMarketplaceSkillApiV1SkillsMarketplaceSkillIdUninstallPost,
} from "@/api/generated/skills-marketplace/skills-marketplace";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTimestamp } from "@/lib/formatters";
import { useOrganizationMembership } from "@/lib/use-organization-membership";

export default function SkillsMarketplacePage() {
  const queryClient = useQueryClient();
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const [selectedGatewayId, setSelectedGatewayId] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [skillName, setSkillName] = useState("");
  const [description, setDescription] = useState("");

  const gatewaysQuery = useListGatewaysApiV1GatewaysGet<
    listGatewaysApiV1GatewaysGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      refetchOnMount: "always",
      refetchInterval: 30_000,
    },
  });

  const gateways = useMemo(
    () =>
      gatewaysQuery.data?.status === 200
        ? (gatewaysQuery.data.data.items ?? [])
        : [],
    [gatewaysQuery.data],
  );

  const resolvedGatewayId = useMemo(() => {
    if (selectedGatewayId && gateways.some((gateway) => gateway.id === selectedGatewayId)) {
      return selectedGatewayId;
    }
    return gateways[0]?.id ?? "";
  }, [gateways, selectedGatewayId]);

  const skillsQueryKey = getListMarketplaceSkillsApiV1SkillsMarketplaceGetQueryKey(
    resolvedGatewayId ? { gateway_id: resolvedGatewayId } : undefined,
  );

  const skillsQuery = useListMarketplaceSkillsApiV1SkillsMarketplaceGet<
    listMarketplaceSkillsApiV1SkillsMarketplaceGetResponse,
    ApiError
  >(
    { gateway_id: resolvedGatewayId },
    {
      query: {
        enabled: Boolean(isSignedIn && isAdmin && resolvedGatewayId),
        refetchOnMount: "always",
        refetchInterval: 15_000,
      },
    },
  );

  const skills = useMemo<MarketplaceSkillCardRead[]>(
    () => (skillsQuery.data?.status === 200 ? skillsQuery.data.data : []),
    [skillsQuery.data],
  );

  const createMutation =
    useCreateMarketplaceSkillApiV1SkillsMarketplacePost<ApiError>(
      {
        mutation: {
          onSuccess: async () => {
            setSourceUrl("");
            setSkillName("");
            setDescription("");
            await queryClient.invalidateQueries({
              queryKey: skillsQueryKey,
            });
          },
        },
      },
      queryClient,
    );

  const installMutation =
    useInstallMarketplaceSkillApiV1SkillsMarketplaceSkillIdInstallPost<ApiError>(
      {
        mutation: {
          onSuccess: async () => {
            await queryClient.invalidateQueries({
              queryKey: skillsQueryKey,
            });
          },
        },
      },
      queryClient,
    );

  const uninstallMutation =
    useUninstallMarketplaceSkillApiV1SkillsMarketplaceSkillIdUninstallPost<ApiError>(
      {
        mutation: {
          onSuccess: async () => {
            await queryClient.invalidateQueries({
              queryKey: skillsQueryKey,
            });
          },
        },
      },
      queryClient,
    );

  const deleteMutation =
    useDeleteMarketplaceSkillApiV1SkillsMarketplaceSkillIdDelete<ApiError>(
      {
        mutation: {
          onSuccess: async () => {
            await queryClient.invalidateQueries({
              queryKey: skillsQueryKey,
            });
          },
        },
      },
      queryClient,
    );

  const mutationError =
    createMutation.error?.message ??
    installMutation.error?.message ??
    uninstallMutation.error?.message ??
    deleteMutation.error?.message;

  const handleAddSkill = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedUrl = sourceUrl.trim();
    if (!normalizedUrl) return;
    createMutation.mutate({
      data: {
        source_url: normalizedUrl,
        name: skillName.trim() || undefined,
        description: description.trim() || undefined,
      },
    });
  };

  const isMutating =
    createMutation.isPending ||
    installMutation.isPending ||
    uninstallMutation.isPending ||
    deleteMutation.isPending;

  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to manage marketplace skills.",
        forceRedirectUrl: "/skills",
      }}
      title="Skills Marketplace"
      description="Register skill links and install or uninstall them per gateway."
      isAdmin={isAdmin}
      adminOnlyMessage="Only organization owners and admins can manage skills."
      stickyHeader
    >
      <div className="space-y-6">
        {gateways.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            <p className="font-medium text-slate-900">No gateways available yet.</p>
            <p className="mt-2">
              Create a gateway first, then return here to install skills.
            </p>
            <Link
              href="/gateways/new"
              className={`${buttonVariants({ variant: "primary", size: "md" })} mt-4`}
            >
              Create gateway
            </Link>
          </div>
        ) : (
          <Card>
            <CardHeader className="border-b border-[color:var(--border)] pb-4">
              <h2 className="font-heading text-lg font-semibold text-slate-900">
                Add skill source
              </h2>
              <p className="text-sm text-slate-500">
                Add a URL once, then install or uninstall the skill for the selected gateway.
              </p>
            </CardHeader>
            <CardContent className="pt-5">
              <form className="space-y-4" onSubmit={handleAddSkill}>
                <div className="grid gap-4 md:grid-cols-[260px_1fr]">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Gateway
                    </label>
                    <Select value={resolvedGatewayId} onValueChange={setSelectedGatewayId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select gateway" />
                      </SelectTrigger>
                      <SelectContent>
                        {gateways.map((gateway) => (
                          <SelectItem key={gateway.id} value={gateway.id}>
                            {gateway.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="skill-url"
                      className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Skill URL
                    </label>
                    <Input
                      id="skill-url"
                      type="url"
                      value={sourceUrl}
                      onChange={(event) => setSourceUrl(event.target.value)}
                      placeholder="https://github.com/org/skill-repo"
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label
                      htmlFor="skill-name"
                      className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Display name (optional)
                    </label>
                    <Input
                      id="skill-name"
                      value={skillName}
                      onChange={(event) => setSkillName(event.target.value)}
                      placeholder="Deploy Helper"
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="skill-description"
                      className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Description (optional)
                    </label>
                    <Textarea
                      id="skill-description"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Short summary shown on the marketplace card."
                      className="min-h-[44px] py-3"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || !resolvedGatewayId}
                  >
                    <PlusCircle className="h-4 w-4" />
                    {createMutation.isPending ? "Adding…" : "Add skill"}
                  </Button>
                  {createMutation.error ? (
                    <p className="text-sm text-rose-600">
                      {createMutation.error.message}
                    </p>
                  ) : null}
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {mutationError ? <p className="text-sm text-rose-600">{mutationError}</p> : null}

        <div className="space-y-3">
          <h2 className="font-heading text-lg font-semibold text-slate-900">
            Marketplace skills
          </h2>
          {skillsQuery.isLoading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
              Loading skills…
            </div>
          ) : skillsQuery.error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
              {skillsQuery.error.message}
            </div>
          ) : skills.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
              No skill links added yet.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {skills.map((skill) => (
                <Card key={skill.id}>
                  <CardHeader className="border-b border-[color:var(--border)] pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h3 className="text-base font-semibold text-slate-900">
                          {skill.name}
                        </h3>
                        <p className="text-sm text-slate-500">
                          {skill.description || "No description provided."}
                        </p>
                      </div>
                      <Badge variant={skill.installed ? "success" : "outline"}>
                        {skill.installed ? "Installed" : "Not installed"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-5">
                    <a
                      href={skill.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--accent)] hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open source link
                    </a>
                    <p className="text-xs text-slate-500">
                      {skill.installed && skill.installed_at
                        ? `Installed ${formatRelativeTimestamp(skill.installed_at)}`
                        : "Not installed on selected gateway"}
                    </p>
                    <div className="flex items-center gap-2">
                      {skill.installed ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            uninstallMutation.mutate({
                              skillId: skill.id,
                              params: { gateway_id: resolvedGatewayId },
                            })
                          }
                          disabled={isMutating || !resolvedGatewayId}
                        >
                          <Package className="h-4 w-4" />
                          Uninstall
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          onClick={() =>
                            installMutation.mutate({
                              skillId: skill.id,
                              params: { gateway_id: resolvedGatewayId },
                            })
                          }
                          disabled={isMutating || !resolvedGatewayId}
                        >
                          <Package className="h-4 w-4" />
                          Install
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate({ skillId: skill.id })}
                        disabled={isMutating}
                        aria-label={`Delete ${skill.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardPageLayout>
  );
}
