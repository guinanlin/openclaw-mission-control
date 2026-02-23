"""Sync Agent channel config (e.g. Feishu) to OpenClaw gateway config via config.patch."""

from __future__ import annotations

import json
from typing import Any

from app.models.agents import Agent
from app.models.gateways import Gateway
from app.services.openclaw.config_service import get_gateway_config
from app.services.openclaw.gateway_rpc import GatewayConfig, OpenClawGatewayError, openclaw_call
from app.services.openclaw.internal.agent_key import agent_key as get_openclaw_agent_id


def _ensure_channels_bindings(data: dict[str, Any]) -> None:
    if "channels" not in data or not isinstance(data["channels"], dict):
        data["channels"] = {}
    if "bindings" not in data or not isinstance(data["bindings"], list):
        data["bindings"] = []


def _binding_matches(binding: object, openclaw_agent_id: str, channel_type: str) -> bool:
    if not isinstance(binding, dict):
        return False
    if binding.get("agentId") != openclaw_agent_id:
        return False
    match = binding.get("match")
    if not isinstance(match, dict):
        return False
    return match.get("channel") == channel_type


async def sync_channel_config_to_gateway(
    agent: Agent,
    channel_type: str,
    account_id: str,
    credentials: dict[str, Any],
    client_config: GatewayConfig,
) -> None:
    """Write one Agent's channel config (e.g. Feishu account) into OpenClaw config and bindings."""
    config_hash, data = await get_gateway_config(client_config)
    _ensure_channels_bindings(data)

    if channel_type not in data["channels"] or not isinstance(data["channels"][channel_type], dict):
        data["channels"][channel_type] = {}
    chan = data["channels"][channel_type]
    if "accounts" not in chan or not isinstance(chan["accounts"], dict):
        chan["accounts"] = {}
    chan["accounts"][account_id] = dict(credentials)

    openclaw_agent_id = get_openclaw_agent_id(agent)
    bindings: list[object] = list(data["bindings"])
    bindings = [b for b in bindings if not _binding_matches(b, openclaw_agent_id, channel_type)]
    bindings.append({
        "agentId": openclaw_agent_id,
        "match": {"channel": channel_type, "accountId": account_id},
    })
    data["bindings"] = bindings

    params: dict[str, Any] = {"raw": json.dumps({"channels": data["channels"], "bindings": data["bindings"]})}
    if config_hash:
        params["baseHash"] = config_hash
    await openclaw_call("config.patch", params, config=client_config)


async def remove_channel_config_from_gateway(
    agent: Agent,
    channel_type: str,
    account_id: str,
    client_config: GatewayConfig,
) -> None:
    """Remove one Agent's channel binding and account from OpenClaw config."""
    config_hash, data = await get_gateway_config(client_config)
    _ensure_channels_bindings(data)

    if channel_type in data["channels"] and isinstance(data["channels"][channel_type], dict):
        accounts = data["channels"][channel_type].get("accounts")
        if isinstance(accounts, dict) and account_id in accounts:
            del accounts[account_id]

    openclaw_agent_id = get_openclaw_agent_id(agent)
    data["bindings"] = [
        b for b in data["bindings"]
        if not _binding_matches(b, openclaw_agent_id, channel_type)
    ]

    params: dict[str, Any] = {"raw": json.dumps({"channels": data["channels"], "bindings": data["bindings"]})}
    if config_hash:
        params["baseHash"] = config_hash
    await openclaw_call("config.patch", params, config=client_config)
