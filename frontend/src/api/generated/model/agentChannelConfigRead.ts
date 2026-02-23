/**
 * Mission Control API - Agent channel config (read, desensitized).
 */
export interface AgentChannelConfigRead {
  id: string;
  agent_id: string;
  gateway_id: string;
  channel_type: string;
  account_id: string;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AgentChannelConfigCreate {
  account_id?: string | null;
  config: Record<string, unknown>;
}
