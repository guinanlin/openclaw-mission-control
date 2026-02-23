"""Fetch OpenClaw gateway config via config.get RPC (used for main-agent read)."""

from __future__ import annotations

from typing import Any

from app.services.openclaw.gateway_rpc import GatewayConfig, OpenClawGatewayError, openclaw_call


async def get_gateway_config(config: GatewayConfig) -> tuple[str | None, dict[str, Any]]:
    """Call config.get and return (hash, parsed config dict). Raises OpenClawGatewayError on failure."""
    cfg = await openclaw_call("config.get", config=config)
    if not isinstance(cfg, dict):
        raise OpenClawGatewayError("config.get returned invalid payload")

    data = cfg.get("config") or cfg.get("parsed") or {}
    if not isinstance(data, dict):
        raise OpenClawGatewayError("config.get returned invalid config")

    return cfg.get("hash"), data


async def get_agents_list_main_key(config: GatewayConfig) -> str | None:
    """Call agents.list and return mainKey if present. Returns None on failure or missing."""
    try:
        result = await openclaw_call("agents.list", config=config)
        if isinstance(result, dict) and "mainKey" in result:
            val = result["mainKey"]
            return str(val) if val is not None else None
    except OpenClawGatewayError:
        pass
    return None
