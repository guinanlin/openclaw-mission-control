"use client";

export const dynamic = "force-dynamic";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, MessageSquare, Paperclip, Plus } from "lucide-react";

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Markdown } from "@/components/atoms/Markdown";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getBotchatBoard, getGatewayModels, getBotchatChannels, createBotchatChannel, getChannelSessions, createChannelSession } from "@/lib/botchat-api";
import type { BotChatChannelRead } from "@/lib/botchat-api";
import { cn } from "@/lib/utils";
import {
  useListAgentsApiV1AgentsGet,
} from "@/api/generated/agents/agents";
import {
  getGatewaySessionApiV1GatewaysSessionsSessionIdGet,
  getSessionHistoryApiV1GatewaysSessionsSessionIdHistoryGet,
  useSendGatewaySessionMessageApiV1GatewaysSessionsSessionIdMessagePost,
} from "@/api/generated/gateways/gateways";
import type { AgentRead } from "@/api/generated/model";

const SLASH_COMMANDS = [
  "/help",
  "/status",
  "/model",
  "/clear",
  "/think",
  "/image",
  "/search",
  "/summarize",
  "/translate",
  "/reset",
];

/**
 * BotChat Messages page — channels (chat windows bound to existing agents) and chat area.
 * Creating a channel does not create a new agent; it binds a chat window to an existing agent.
 */
export default function BotChatMessagesPage() {
  const queryClient = useQueryClient();
  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelAgentId, setNewChannelAgentId] = useState<string | null>(null);

  const { data: board, isLoading: boardLoading, error: boardError } = useQuery({
    queryKey: ["botchat", "board"],
    queryFn: getBotchatBoard,
  });

  const boardId = board?.board_id ?? null;

  const { data: channelsData, isLoading: channelsLoading, error: channelsError } = useQuery({
    queryKey: ["botchat", "channels", boardId],
    queryFn: () => getBotchatChannels(boardId!),
    enabled: Boolean(boardId),
    refetchOnMount: "always",
  });

  const channels: BotChatChannelRead[] = channelsData?.channels ?? [];

  const {
    data: agentsRes,
    isLoading: _agentsLoading,
  } = useListAgentsApiV1AgentsGet(
    boardId ? { board_id: boardId, limit: 200 } : undefined,
    {
      query: {
        enabled: Boolean(boardId),
        refetchOnMount: "always",
      },
    },
  );

  const agents: AgentRead[] =
    agentsRes?.status === 200 ? (agentsRes.data?.items ?? []) : [];

  const createChannelMutation = useMutation({
    mutationFn: (payload: { name: string; agent_id: string; description?: string }) =>
      createBotchatChannel(payload),
    onSuccess: (data) => {
      setSelectedChannelId(data.id);
      setCreateOpen(false);
      setNewChannelName("");
      setNewChannelAgentId(null);
      queryClient.invalidateQueries({ queryKey: ["botchat", "channels"] });
    },
  });

  const handleCreateChannel = useCallback(() => {
    const name = newChannelName.trim();
    if (!name || !boardId || !newChannelAgentId) return;
    createChannelMutation.mutate({
      name,
      agent_id: newChannelAgentId,
      description: "",
    });
  }, [boardId, newChannelName, newChannelAgentId, createChannelMutation]);

  const errorMessage =
    boardError instanceof Error
      ? boardError.message
      : channelsError instanceof Error
        ? channelsError.message
        : null;

  const selectedChannel: BotChatChannelRead | null = selectedChannelId
    ? channels.find((c) => c.id === selectedChannelId) ?? null
    : null;

  const { data: sessionsData } = useQuery({
    queryKey: ["botchat", "channels", selectedChannelId, "sessions"],
    queryFn: () => getChannelSessions(selectedChannelId!),
    enabled: Boolean(selectedChannelId),
  });

  const sessions = useMemo(
    () =>
      (sessionsData?.sessions ?? []).map((s) => ({
        key: s.session_key,
        label: s.label,
      })),
    [sessionsData],
  );

  const [activeSessionIdx, setActiveSessionIdx] = useState<Record<string, number>>({});

  const currentSessionIdx = selectedChannelId
    ? Math.min(
        activeSessionIdx[selectedChannelId] ?? 0,
        Math.max(0, sessions.length - 1),
      )
    : 0;
  const sessionKey = sessions[currentSessionIdx]?.key ?? null;
  const canChat = Boolean(boardId && sessionKey);

  const createSessionMutation = useMutation({
    mutationFn: (channelId: string) => createChannelSession(channelId),
    onSuccess: (newSession, channelId) => {
      const old = queryClient.getQueryData<{ sessions: { session_key: string; label: string }[] }>(
        ["botchat", "channels", channelId, "sessions"],
      );
      const newIdx = old?.sessions?.length ?? 0;
      queryClient.setQueryData(
        ["botchat", "channels", channelId, "sessions"],
        { sessions: [...(old?.sessions ?? []), newSession] },
      );
      setActiveSessionIdx((prev) => ({ ...prev, [channelId]: newIdx }));
    },
  });

  const handleNewSession = useCallback(() => {
    if (!selectedChannelId) return;
    createSessionMutation.mutate(selectedChannelId);
  }, [selectedChannelId, createSessionMutation]);

  const [pollHistory, setPollHistory] = useState(false);

  const { data: historyRes } = useQuery({
    queryKey: ["gateways", "sessions", sessionKey, "history", boardId],
    queryFn: () =>
      getSessionHistoryApiV1GatewaysSessionsSessionIdHistoryGet(
        sessionKey!,
        { board_id: boardId ?? undefined },
      ),
    enabled: canChat,
    refetchInterval: pollHistory ? 2000 : false,
  });

  const history =
    historyRes?.status === 200 && Array.isArray(historyRes.data?.history)
      ? (historyRes.data.history as Record<string, unknown>[])
      : [];

  const { data: sessionRes } = useQuery({
    queryKey: ["gateways", "sessions", sessionKey, boardId, "detail"],
    queryFn: () =>
      getGatewaySessionApiV1GatewaysSessionsSessionIdGet(sessionKey!, {
        board_id: boardId ?? undefined,
      }),
    enabled: canChat,
  });

  const { data: modelsData } = useQuery({
    queryKey: ["gateways", "models", boardId],
    queryFn: () => getGatewayModels(boardId!),
    enabled: Boolean(boardId),
  });

  const models = modelsData?.models ?? [];
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const currentSession =
    sessionRes?.status === 200 && typeof sessionRes.data?.session === "object"
      ? (sessionRes.data.session as Record<string, unknown>)
      : null;
  const sessionModel =
    (currentSession?.model as string | undefined) ??
    (currentSession?.modelId as string | undefined) ??
    (currentSession?.model_id as string | undefined);
  const displayModel =
    selectedModelId ??
    sessionModel ??
    (typeof models[0] === "object" && models[0] !== null && "id" in models[0]
      ? String((models[0] as Record<string, unknown>).id)
      : typeof models[0] === "object" && models[0] !== null && "name" in models[0]
        ? String((models[0] as Record<string, unknown>).name)
        : "Select model");

  /** Optimistic messages: show immediately on send until history refetch includes them */
  const [optimisticMessages, setOptimisticMessages] = useState<{ content: string }[]>([]);

  const [inputValue, setInputValue] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendMutation = useSendGatewaySessionMessageApiV1GatewaysSessionsSessionIdMessagePost({
    mutation: {
      onSuccess: () => {
        setSendError(null);
        setPollHistory(true);
        queryClient.invalidateQueries({
          queryKey: ["gateways", "sessions", sessionKey, "history"],
        });
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        pollTimerRef.current = setTimeout(() => setPollHistory(false), 15000);
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : "Failed to send message.";
        setSendError(message);
      },
    },
  });

  const historyTexts = new Set(
    history.map((msg) => messageDisplayText(msg).trim()).filter(Boolean),
  );
  const pendingOptimisticMessages =
    optimisticMessages.length === 0
      ? []
      : optimisticMessages.filter((m) => !historyTexts.has(m.content.trim()));

  const sendMessage = useCallback(
    (content: string) => {
      const text = content.trim();
      if (!text || !sessionKey || !boardId) return;
      setOptimisticMessages((prev) => [...prev, { content: text }]);
      setInputValue("");
      sendMutation.mutate(
        {
          sessionId: sessionKey,
          data: { content: text },
          params: { board_id: boardId },
        },
        {
          onError: (_err, variables) => {
            const sentContent =
              variables?.data && typeof variables.data === "object" && "content" in variables.data
                ? String((variables.data as { content: string }).content).trim()
                : text;
            setOptimisticMessages((prev) => {
              const idx = prev.findIndex((m) => m.content === sentContent);
              if (idx === -1) return prev;
              return prev.filter((_, i) => i !== idx);
            });
          },
        },
      );
    },
    [sessionKey, boardId, sendMutation],
  );

  const handleSend = useCallback(() => {
    sendMessage(inputValue);
    inputRef.current?.focus();
  }, [inputValue, sendMessage]);

  const handleSlashCommand = useCallback((cmd: string) => {
    setInputValue(`${cmd}  `);
    inputRef.current?.focus();
  }, []);

  const handleModelSelect = useCallback(
    (id: string) => {
      setSelectedModelId(id);
      sendMessage(`/model ${id}`);
    },
    [sendMessage],
  );

  function extractTextFromContent(content: unknown): string | null {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const item of content) {
        if (typeof item === "string") {
          parts.push(item);
        } else if (typeof item === "object" && item !== null) {
          const obj = item as Record<string, unknown>;
          if (typeof obj.text === "string") parts.push(obj.text);
          else if (typeof obj.content === "string") parts.push(obj.content);
        }
      }
      if (parts.length > 0) return parts.join("\n");
    }
    if (typeof content === "object" && content !== null) {
      const obj = content as Record<string, unknown>;
      if (typeof obj.text === "string") return obj.text;
    }
    return null;
  }

  function messageDisplayText(msg: Record<string, unknown>): string {
    const fromContent = extractTextFromContent(msg.content);
    if (fromContent !== null) return fromContent;
    if (typeof msg.text === "string") return msg.text;
    if (typeof msg.message === "string") return msg.message;
    const { role: _r, sender: _s, type: _t, ...rest } = msg;
    return JSON.stringify(rest, null, 2);
  }

  function messageRole(msg: Record<string, unknown>): "user" | "assistant" | "system" {
    const r = msg.role ?? msg.sender ?? msg.type;
    if (r === "user" || r === "assistant" || r === "system") return r;
    if (typeof r === "string" && r.toLowerCase() === "assistant") return "assistant";
    if (typeof r === "string" && r.toLowerCase() === "system") return "system";
    return "assistant";
  }

  const displayMessages: Record<string, unknown>[] = [
    ...history,
    ...pendingOptimisticMessages.map((m) => ({ role: "user" as const, content: m.content })),
  ];

  const messagesScrollRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    // Keep the newest message visible within chat scroller.
    el.scrollTop = el.scrollHeight;
  }, [selectedChannelId, sessionKey, displayMessages.length]);

  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to view BotChat messages.",
        forceRedirectUrl: "/botchat/messages",
        signUpForceRedirectUrl: "/botchat/messages",
      }}
      title="Messages"
      hideHeader
      contentClassName="p-4"
    >
      <div className="grid h-[max(480px,calc(100vh-56px-2rem))] grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Left: CHANNELS sidebar */}
        <aside
          className={cn(
            "flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 shadow-sm",
            "bg-white text-slate-700",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <button
              type="button"
              onClick={() => setChannelsExpanded((e) => !e)}
              className="flex items-center gap-2 text-left text-sm font-semibold uppercase tracking-wider text-slate-700 hover:text-slate-900"
              aria-expanded={channelsExpanded}
            >
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", !channelsExpanded && "-rotate-90")}
                aria-hidden
              />
              Channels
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              disabled={!boardId || boardLoading}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              title="Create channel"
              aria-label="Create channel"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {channelsExpanded && (
            <div className="flex-1 overflow-y-auto py-2">
              {errorMessage && (
                <p className="px-4 py-2 text-xs text-amber-600">{errorMessage}</p>
              )}
              {boardLoading || (boardId && channelsLoading) ? (
                <p className="px-4 py-4 text-sm text-slate-500">Loading…</p>
              ) : !boardId ? (
                <p className="px-4 py-4 text-sm text-slate-500">
                  No gateway. Add a gateway to create channels.
                </p>
              ) : channels.length === 0 ? (
                <p className="px-4 py-4 text-sm text-slate-500">
                  No channels yet. Click + to create one (pick an existing agent).
                </p>
              ) : (
                <ul className="space-y-0.5 px-2">
                  {channels.map((ch) => (
                    <li key={ch.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedChannelId(ch.id);
                          setSelectedModelId(null);
                          setOptimisticMessages([]);
                          setSendError(null);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                          selectedChannelId === ch.id
                            ? "bg-slate-200 font-semibold text-slate-900"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-800",
                        )}
                      >
                        <span className="text-slate-400">#</span>
                        <span className="min-w-0 truncate">
                          {ch.name}
                          {ch.agent?.name && (
                            <span className="ml-1 text-slate-400">· {ch.agent.name}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </aside>

        {/* Right: Chat area — show channel chat view when a channel is selected */}
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {selectedChannel ? (
            <>
              {/* Channel header: # Name - custom channel */}
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <h2 className="font-semibold text-slate-800">
                    # {selectedChannel.name}
                    <span className="ml-1 font-normal text-slate-500">
                      {selectedChannel.agent?.name
                        ? `· ${selectedChannel.agent.name}`
                        : " - custom channel"}
                    </span>
                  </h2>
                  {/* Session tabs */}
                  <div className="mt-2 flex items-center gap-2 overflow-x-auto">
                    {sessions.map((s, idx) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() =>
                          selectedChannelId &&
                          (setActiveSessionIdx((prev) => ({ ...prev, [selectedChannelId]: idx })),
                          setSelectedModelId(null),
                          setOptimisticMessages([]),
                          setSendError(null))
                        }
                        className={cn(
                          "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition",
                          idx === currentSessionIdx
                            ? "bg-blue-100 text-blue-800"
                            : "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={handleNewSession}
                      disabled={createSessionMutation.isPending}
                      className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                      aria-label="New session"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <Select
                  value={models.length ? displayModel : ""}
                  onValueChange={handleModelSelect}
                  disabled={models.length === 0}
                >
                  <SelectTrigger className="h-8 w-auto min-w-[6rem] border-0 bg-transparent px-0 text-xs text-slate-400 shadow-none hover:text-slate-600">
                    <SelectValue placeholder="echo-1.0" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m, i) => {
                      const id =
                        typeof m === "object" && m !== null && "id" in m
                          ? String((m as Record<string, unknown>).id)
                          : String(i);
                      const name =
                        typeof m === "object" && m !== null && "name" in m
                          ? String((m as Record<string, unknown>).name)
                          : id;
                      return (
                        <SelectItem key={id} value={id}>
                          {name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Message area — scrollable, takes remaining height; min-w-0 so content does not stretch grid column */}
              <div
                ref={messagesScrollRef}
                className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4"
              >
                {!sessionKey ? (
                  <p className="text-center text-sm text-slate-500">
                    Agent is provisioning… Session will be ready shortly.
                  </p>
                ) : displayMessages.length === 0 ? (
                  <p className="text-center text-sm text-slate-500">
                    No messages yet. Start a conversation.
                  </p>
                ) : (
                  <ul className="min-w-0 space-y-3">
                    {displayMessages.map((msg, i) => {
                      const role = messageRole(msg);
                      const text = messageDisplayText(msg);
                      return (
                        <li
                          key={i}
                          className={cn(
                            "flex w-full",
                            role === "user" ? "justify-end" : "justify-start",
                          )}
                        >
                          <div
                            className={cn(
                              "min-w-0 rounded-lg px-3 py-2 text-sm",
                              role === "user"
                                ? "w-[80%] bg-blue-50 text-slate-800"
                                : "max-w-[min(78%,72ch)] bg-slate-100 text-slate-700",
                            )}
                          >
                            <span className="font-medium text-slate-500">
                              {role === "user" ? "You" : role === "system" ? "System" : "Agent"}
                            </span>
                            <div className="mt-0.5 min-w-0 max-w-full break-words [overflow-wrap:anywhere]">
                              <Markdown content={text} variant="comment" />
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Input area — fixed at bottom of chat panel */}
              <div className="shrink-0 border-t border-slate-200 bg-white p-4">
                {sendError && (
                  <p className="mb-2 text-xs text-rose-600">{sendError}</p>
                )}
                <div className="mb-2 flex flex-wrap gap-1">
                  {SLASH_COMMANDS.map((cmd) => (
                    <button
                      key={cmd}
                      type="button"
                      onClick={() => handleSlashCommand(cmd)}
                      disabled={!canChat || sendMutation.isPending}
                      className="rounded px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                    >
                      {cmd}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2">
                  <button
                    type="button"
                    className="text-slate-400 hover:text-slate-600"
                    aria-label="Attach file"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder={`Message #${selectedChannel.name}`}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    disabled={!canChat || sendMutation.isPending}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 disabled:opacity-50"
                  />
                  <Button
                    size="sm"
                    className="shrink-0"
                    onClick={handleSend}
                    disabled={!inputValue.trim() || !canChat || sendMutation.isPending}
                  >
                    <span className="mr-1">▷</span>
                    Send
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="rounded-full bg-slate-100 p-4">
                <MessageSquare className="h-8 w-8 text-slate-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-700">
                  Select a channel to start
                </h3>
                <p className="mt-1 max-w-sm text-sm text-slate-500">
                  Choose a channel from the list, or create one with + (bound to an existing agent).
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateOpen(true)}
                disabled={!boardId || boardLoading}
              >
                Create channel
              </Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create channel</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            Bind a chat window to an existing agent on the BotChat board. No new agent is created.
          </p>
          <div className="mt-2 space-y-2">
            <label className="text-sm font-medium text-slate-700">Agent</label>
            <Select
              value={newChannelAgentId ?? ""}
              onValueChange={(v) => setNewChannelAgentId(v || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="text-sm font-medium text-slate-700">Channel name</label>
            <Input
              placeholder="Channel name (e.g. General)"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateChannel();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
                setNewChannelName("");
                setNewChannelAgentId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateChannel}
              disabled={
                !newChannelName.trim() ||
                !boardId ||
                !newChannelAgentId ||
                createChannelMutation.isPending
              }
            >
              {createChannelMutation.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPageLayout>
  );
}
