export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "";
  const trimmed = raw.trim();
  // Allow empty/relative paths for same-origin development (Next rewrites).
  // If a full URL is provided, normalize by removing trailing slashes.
  if (trimmed === "" || trimmed.startsWith("/")) {
    return trimmed.replace(/\/+$/, "");
  }
  const normalized = trimmed.replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("NEXT_PUBLIC_API_URL is invalid.");
  }
  return normalized;
}
