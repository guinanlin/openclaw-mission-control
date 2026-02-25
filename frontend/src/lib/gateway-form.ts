import { gatewaysStatusApiV1GatewaysStatusGet } from "@/api/generated/gateways/gateways";

export const DEFAULT_WORKSPACE_ROOT = "~/.openclaw";

export type GatewayCheckStatus = "idle" | "checking" | "success" | "error";

export const validateGatewayUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "Gateway URL is required.";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "ws:" && url.protocol !== "wss:") {
      // Allow http/https GitHub.dev links or sign-in redirects by attempting
      // to normalize them when sending. For validation we accept http/https
      // but require ws/wss after normalization when actually connecting.
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return "Gateway URL must start with ws://, wss://, http:// or https://.";
      }
    }
    return null;
  } catch {
    return "Enter a valid gateway URL.";
  }
};

export const normalizeGatewayUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  try {
    const url = new URL(trimmed);
    // Already ws/wss -> nothing to do
    if (url.protocol === "ws:" || url.protocol === "wss:") return trimmed;

    // If the URL contains an encoded `pb` parameter (GitHub.dev / sign-in),
    // prefer that value if it looks like a URL.
    try {
      const pb = url.searchParams.get("pb");
      if (pb) {
        const decoded = decodeURIComponent(pb);
        const pbUrl = new URL(decoded);
        // convert http/https -> ws/wss
        const proto = pbUrl.protocol === "https:" ? "wss:" : "ws:";
        return urlSanitizeProtocol(pbUrl, proto);
      }
    } catch {
      // ignore pb extraction errors and fallthrough to general conversion
    }

    // If a `port` query parameter exists, use it when building the ws/wss URL.
    const portParam = url.searchParams.get("port");
    const proto = url.protocol === "https:" ? "wss:" : "ws:";
    if (portParam) {
      const host = url.hostname;
      const path = url.pathname === "/" ? "" : url.pathname;
      return `${proto}//${host}:${portParam}${path}`;
    }

    // Default conversion: switch http(s) -> ws(s) and keep host/path
    return `${proto}//${url.host}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
};

function urlSanitizeProtocol(u: URL, proto: string) {
  // Build a string from URL while replacing its protocol
  const host = u.host;
  const path = u.pathname === "/" ? "" : u.pathname;
  const search = u.search || "";
  const hash = u.hash || "";
  return `${proto}//${host}${path}${search}${hash}`;
}

export async function checkGatewayConnection(params: {
  gatewayUrl: string;
  gatewayToken: string;
  gatewayPassword?: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const requestParams: Record<string, string> = {
      gateway_url: normalizeGatewayUrl(params.gatewayUrl.trim()),
    };
    if (params.gatewayToken?.trim()) {
      requestParams.gateway_token = params.gatewayToken.trim();
    }
    if (params.gatewayPassword?.trim()) {
      requestParams.gateway_password = params.gatewayPassword.trim();
    }

    const response = await gatewaysStatusApiV1GatewaysStatusGet(requestParams);
    if (response.status !== 200) {
      return { ok: false, message: "Unable to reach gateway." };
    }
    const data = response.data;
    if (!data.connected) {
      return { ok: false, message: data.error ?? "Unable to reach gateway." };
    }
    return { ok: true, message: "Gateway reachable." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Unable to reach gateway.",
    };
  }
}
