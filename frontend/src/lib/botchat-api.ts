/**
 * BotChat API helpers. GET /api/v1/botchat/board is used until api-gen includes it.
 */

import { customFetch } from "@/api/mutator";

export type BotChatBoardResponse = {
  board_id: string;
  name: string;
  slug: string;
};

type BotChatBoardApiResponse = {
  data: BotChatBoardResponse;
  status: number;
};

export async function getBotchatBoard(): Promise<BotChatBoardResponse> {
  const res = await customFetch<BotChatBoardApiResponse>("/api/v1/botchat/board", {
    method: "GET",
  });
  if (res.status !== 200 || !res.data) {
    throw new Error("Failed to load BotChat board");
  }
  return res.data;
}

/** Channel: chat window bound to an existing agent (BotsChat-style). */
export type BotChatChannelRead = {
  id: string;
  board_id: string;
  agent_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  agent: import("@/api/generated/model").AgentRead | null;
};

export type BotChatChannelListResponse = {
  channels: BotChatChannelRead[];
};

type BotChatChannelListApiResponse = {
  data: BotChatChannelListResponse;
  status: number;
};

export async function getBotchatChannels(
  boardId: string,
): Promise<BotChatChannelListResponse> {
  const res = await customFetch<BotChatChannelListApiResponse>(
    `/api/v1/botchat/channels?board_id=${encodeURIComponent(boardId)}`,
    { method: "GET" },
  );
  if (res.status !== 200 || !res.data) {
    throw new Error("Failed to load channels");
  }
  return res.data;
}

export type BotChatChannelCreatePayload = {
  name: string;
  description?: string;
  agent_id: string;
};

export async function createBotchatChannel(
  payload: BotChatChannelCreatePayload,
): Promise<BotChatChannelRead> {
  const res = await customFetch<{ data: BotChatChannelRead; status: number }>(
    "/api/v1/botchat/channels",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (res.status !== 200 || !res.data) {
    throw new Error("Failed to create channel");
  }
  return res.data;
}

/** Session for a channel (Session 1 = agent default; 2+ from DB). */
export type BotChatChannelSessionRead = {
  id: string | null;
  session_key: string;
  label: string;
  created_at: string | null;
};

export type BotChatChannelSessionsListResponse = {
  sessions: BotChatChannelSessionRead[];
};

export async function getChannelSessions(
  channelId: string,
): Promise<BotChatChannelSessionsListResponse> {
  const res = await customFetch<{
    data: BotChatChannelSessionsListResponse;
    status: number;
  }>(`/api/v1/botchat/channels/${encodeURIComponent(channelId)}/sessions`, {
    method: "GET",
  });
  if (res.status !== 200 || !res.data) {
    throw new Error("Failed to load channel sessions");
  }
  return res.data;
}

export async function createChannelSession(
  channelId: string,
  payload?: { label?: string },
): Promise<BotChatChannelSessionRead> {
  const res = await customFetch<{
    data: BotChatChannelSessionRead;
    status: number;
  }>(`/api/v1/botchat/channels/${encodeURIComponent(channelId)}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  if (res.status !== 200 || !res.data) {
    throw new Error("Failed to create session");
  }
  return res.data;
}

export type GatewayModelsResponse = {
  models: Record<string, unknown>[];
};

type GatewayModelsApiResponse = {
  data: GatewayModelsResponse;
  status: number;
};

export async function getGatewayModels(
  boardId: string,
): Promise<GatewayModelsResponse> {
  const res = await customFetch<GatewayModelsApiResponse>(
    `/api/v1/gateways/models?board_id=${encodeURIComponent(boardId)}`,
    { method: "GET" },
  );
  if (res.status !== 200 || !res.data) {
    throw new Error("Failed to load gateway models");
  }
  return res.data;
}
