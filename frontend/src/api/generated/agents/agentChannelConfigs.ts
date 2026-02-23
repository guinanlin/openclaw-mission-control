/**
 * Agent channel configs API (hand-written for OpenAPI-not-yet-regenerated).
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import type { QueryKey, UseMutationOptions, UseQueryOptions, UseQueryResult } from "@tanstack/react-query";

import type { AgentChannelConfigCreate, AgentChannelConfigRead } from "../model";
import { customFetch } from "../../mutator";

type SecondParameter<T extends (...args: never[]) => unknown> = Parameters<T>[1];

export type ListAgentChannelConfigsResponse = { data: AgentChannelConfigRead[]; status: 200 };
export type PutAgentChannelConfigResponse = { data: AgentChannelConfigRead; status: 200 };
export type DeleteAgentChannelConfigResponse = { data: { ok: boolean }; status: 200 };

export function getListAgentChannelConfigsUrl(agentId: string) {
  return `/api/v1/agents/${agentId}/channel-configs`;
}

export async function listAgentChannelConfigs(
  agentId: string,
  options?: RequestInit,
): Promise<ListAgentChannelConfigsResponse> {
  return customFetch<ListAgentChannelConfigsResponse>(
    getListAgentChannelConfigsUrl(agentId),
    { ...options, method: "GET" },
  );
}

export function getListAgentChannelConfigsQueryKey(agentId: string) {
  return [getListAgentChannelConfigsUrl(agentId)] as const;
}

export function useListAgentChannelConfigs(
  agentId: string,
  options?: {
    query?: Partial<UseQueryOptions<ListAgentChannelConfigsResponse, Error, ListAgentChannelConfigsResponse, QueryKey>>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<ListAgentChannelConfigsResponse, Error> {
  const { query: queryOptions, request } = options ?? {};
  return useQuery({
    queryKey: getListAgentChannelConfigsQueryKey(agentId),
    queryFn: ({ signal }) => listAgentChannelConfigs(agentId, { signal, ...request }),
    enabled: !!agentId,
    ...queryOptions,
  });
}

export function getPutAgentChannelConfigUrl(agentId: string, channelType: string) {
  return `/api/v1/agents/${agentId}/channel-configs/${channelType}`;
}

export async function putAgentChannelConfig(
  agentId: string,
  channelType: string,
  data: AgentChannelConfigCreate,
  options?: RequestInit,
): Promise<PutAgentChannelConfigResponse> {
  return customFetch<PutAgentChannelConfigResponse>(
    getPutAgentChannelConfigUrl(agentId, channelType),
    { ...options, method: "PUT", body: JSON.stringify(data), headers: { "Content-Type": "application/json", ...options?.headers } },
  );
}

export function usePutAgentChannelConfig(
  agentId: string,
  channelType: string,
  options?: {
    mutation?: UseMutationOptions<PutAgentChannelConfigResponse, Error, AgentChannelConfigCreate>;
    request?: SecondParameter<typeof customFetch>;
  },
) {
  return useMutation({
    mutationFn: (data: AgentChannelConfigCreate) =>
      putAgentChannelConfig(agentId, channelType, data, options?.request),
    ...options?.mutation,
  });
}

export function getDeleteAgentChannelConfigUrl(agentId: string, channelType: string) {
  return `/api/v1/agents/${agentId}/channel-configs/${channelType}`;
}

export async function deleteAgentChannelConfig(
  agentId: string,
  channelType: string,
  options?: RequestInit,
): Promise<DeleteAgentChannelConfigResponse> {
  return customFetch<DeleteAgentChannelConfigResponse>(
    getDeleteAgentChannelConfigUrl(agentId, channelType),
    { ...options, method: "DELETE" },
  );
}

export function useDeleteAgentChannelConfig(
  agentId: string,
  channelType: string,
  options?: {
    mutation?: UseMutationOptions<DeleteAgentChannelConfigResponse, Error, void>;
    request?: SecondParameter<typeof customFetch>;
  },
) {
  return useMutation({
    mutationFn: () => deleteAgentChannelConfig(agentId, channelType, options?.request),
    ...options?.mutation,
  });
}
