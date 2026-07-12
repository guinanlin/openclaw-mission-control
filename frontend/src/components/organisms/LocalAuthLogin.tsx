"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

import { setLocalAuthToken } from "@/auth/localAuth";
import { getApiBaseUrl } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const LOCAL_AUTH_TOKEN_MIN_LENGTH = 50;

async function validateLocalToken(token: string): Promise<string | null> {
  const baseUrl = getApiBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/v1/users/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    return "Unable to reach backend to validate token.";
  }
  if (response.ok) return null;
  if (response.status === 401 || response.status === 403) return "Token is invalid.";
  return `Unable to validate token (HTTP ${response.status}).`;
}

type LocalAuthLoginProps = {
  onAuthenticated?: () => void;
};

const defaultOnAuthenticated = () => window.location.reload();

export function LocalAuthLogin({ onAuthenticated }: LocalAuthLoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [useTokenEntry, setUseTokenEntry] = useState(false);

  const handlePasswordLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const u = username.trim();
    const p = password;
    if (!u) {
      setError("Username is required.");
      return;
    }
    setIsValidating(true);
    setError(null);
    const baseUrl = getApiBaseUrl();
    try {
      const response = await fetch(`${baseUrl}/api/v1/auth/local/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      });
      if (response.status === 429) {
        setError("Too many failed attempts. Try again later.");
        setIsValidating(false);
        return;
      }
      if (!response.ok) {
        setError("Invalid username or password.");
        setIsValidating(false);
        return;
      }
      const data = (await response.json()) as { access_token?: string };
      const accessToken = data?.access_token;
      if (!accessToken || typeof accessToken !== "string") {
        setError("Invalid response from server.");
        setIsValidating(false);
        return;
      }
      setLocalAuthToken(accessToken);
      setError(null);
      (onAuthenticated ?? defaultOnAuthenticated)();
    } catch {
      setError("Unable to reach backend to sign in.");
    } finally {
      setIsValidating(false);
    }
  };

  const handleTokenSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleaned = token.trim();
    if (!cleaned) {
      setError("Bearer token is required.");
      return;
    }
    if (cleaned.length < LOCAL_AUTH_TOKEN_MIN_LENGTH) {
      setError(
        `Bearer token must be at least ${LOCAL_AUTH_TOKEN_MIN_LENGTH} characters.`,
      );
      return;
    }
    setIsValidating(true);
    setError(null);
    const validationError = await validateLocalToken(cleaned);
    setIsValidating(false);
    if (validationError) {
      setError(validationError);
      return;
    }
    setLocalAuthToken(cleaned);
    (onAuthenticated ?? defaultOnAuthenticated)();
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-app px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 -left-24 h-72 w-72 rounded-full bg-[color:var(--accent-soft)] blur-3xl" />
        <div className="absolute -right-28 -bottom-24 h-80 w-80 rounded-full bg-[rgba(14,165,233,0.12)] blur-3xl" />
      </div>

      <Card className="relative w-full max-w-lg animate-fade-in-up">
        <CardHeader className="space-y-5 border-b border-[color:var(--border)] pb-5">
          <div className="flex items-center justify-between">
            <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Self-host mode
            </span>
            <div className="rounded-xl bg-[color:var(--accent-soft)] p-2 text-[color:var(--accent)]">
              <Lock className="h-5 w-5" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-strong">
              Local Authentication
            </h1>
            <p className="text-sm text-muted">
              {useTokenEntry
                ? "Enter your access token to unlock Mission Control."
                : "Sign in with your username and password."}
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          {!useTokenEntry ? (
            <>
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="local-auth-username"
                    className="text-xs font-semibold uppercase tracking-[0.08em] text-muted"
                  >
                    Username
                  </label>
                  <Input
                    id="local-auth-username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                    disabled={isValidating}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="local-auth-password"
                    className="text-xs font-semibold uppercase tracking-[0.08em] text-muted"
                  >
                    Password
                  </label>
                  <Input
                    id="local-auth-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    disabled={isValidating}
                  />
                </div>
                {error ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={isValidating}
                >
                  {isValidating ? "Signing in..." : "Continue"}
                </Button>
              </form>
              <p className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setUseTokenEntry(true);
                    setError(null);
                  }}
                  className="text-sm text-muted underline hover:text-strong"
                >
                  Use access token instead
                </button>
              </p>
            </>
          ) : (
            <>
              <form onSubmit={handleTokenSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="local-auth-token"
                    className="text-xs font-semibold uppercase tracking-[0.08em] text-muted"
                  >
                    Access token
                  </label>
                  <Input
                    id="local-auth-token"
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Paste token"
                    autoFocus
                    disabled={isValidating}
                    className="font-mono"
                  />
                </div>
                {error ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </p>
                ) : (
                  <p className="text-xs text-muted">
                    Token must be at least {LOCAL_AUTH_TOKEN_MIN_LENGTH} characters.
                  </p>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={isValidating}
                >
                  {isValidating ? "Validating..." : "Continue"}
                </Button>
              </form>
              <p className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setUseTokenEntry(false);
                    setError(null);
                  }}
                  className="text-sm text-muted underline hover:text-strong"
                >
                  Use username and password
                </button>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
