import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LocalAuthLogin } from "./LocalAuthLogin";

const setLocalAuthTokenMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth/localAuth", async () => {
  const actual =
    await vi.importActual<typeof import("@/auth/localAuth")>(
      "@/auth/localAuth",
    );
  return {
    ...actual,
    setLocalAuthToken: setLocalAuthTokenMock,
  };
});

vi.mock("@/lib/api-base", () => ({
  getApiBaseUrl: () => "http://localhost:8000",
}));

function switchToTokenEntry(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole("button", { name: /use access token instead/i }));
}

describe("LocalAuthLogin", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    setLocalAuthTokenMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("password login: requires username", async () => {
    const user = userEvent.setup();
    render(<LocalAuthLogin />);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Username is required.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setLocalAuthTokenMock).not.toHaveBeenCalled();
  });

  it("password login: saves token and calls onAuthenticated after successful login", async () => {
    const onAuthenticatedMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "g".repeat(50) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const user = userEvent.setup();
    render(<LocalAuthLogin onAuthenticated={onAuthenticatedMock} />);

    await user.type(screen.getByPlaceholderText("Username"), "admin");
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(setLocalAuthTokenMock).toHaveBeenCalledWith("g".repeat(50)),
    );
    expect(onAuthenticatedMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/auth/local/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ username: "admin", password: "secret" }),
      }),
    );
  });

  it("password login: shows error on 401", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    const user = userEvent.setup();
    render(<LocalAuthLogin />);

    await user.type(screen.getByPlaceholderText("Username"), "u");
    await user.type(screen.getByPlaceholderText("Password"), "p");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(screen.getByText("Invalid username or password.")).toBeInTheDocument(),
    );
    expect(setLocalAuthTokenMock).not.toHaveBeenCalled();
  });

  it("token flow: requires a non-empty token", async () => {
    const user = userEvent.setup();
    render(<LocalAuthLogin />);
    await switchToTokenEntry(user);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Bearer token is required.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setLocalAuthTokenMock).not.toHaveBeenCalled();
  });

  it("token flow: requires token length of at least 50 characters", async () => {
    const user = userEvent.setup();
    render(<LocalAuthLogin />);
    await switchToTokenEntry(user);

    await user.type(screen.getByPlaceholderText("Paste token"), "x".repeat(49));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByText("Bearer token must be at least 50 characters."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setLocalAuthTokenMock).not.toHaveBeenCalled();
  });

  it("token flow: rejects invalid token values", async () => {
    const onAuthenticatedMock = vi.fn();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    const user = userEvent.setup();
    render(<LocalAuthLogin onAuthenticated={onAuthenticatedMock} />);
    await switchToTokenEntry(user);

    await user.type(screen.getByPlaceholderText("Paste token"), "x".repeat(50));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(screen.getByText("Token is invalid.")).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/users/me",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: `Bearer ${"x".repeat(50)}` },
      }),
    );
    expect(setLocalAuthTokenMock).not.toHaveBeenCalled();
    expect(onAuthenticatedMock).not.toHaveBeenCalled();
  });

  it("token flow: saves token only after successful backend validation", async () => {
    const onAuthenticatedMock = vi.fn();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const user = userEvent.setup();
    render(<LocalAuthLogin onAuthenticated={onAuthenticatedMock} />);
    await switchToTokenEntry(user);

    const token = `  ${"g".repeat(50)} `;
    await user.type(screen.getByPlaceholderText("Paste token"), token);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(setLocalAuthTokenMock).toHaveBeenCalledWith("g".repeat(50)),
    );
    expect(onAuthenticatedMock).toHaveBeenCalledTimes(1);
  });

  it("token flow: shows a clear error when backend is unreachable", async () => {
    const onAuthenticatedMock = vi.fn();
    fetchMock.mockRejectedValueOnce(new TypeError("network error"));
    const user = userEvent.setup();
    render(<LocalAuthLogin onAuthenticated={onAuthenticatedMock} />);
    await switchToTokenEntry(user);

    await user.type(screen.getByPlaceholderText("Paste token"), "t".repeat(50));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(
        screen.getByText("Unable to reach backend to validate token."),
      ).toBeInTheDocument(),
    );
    expect(setLocalAuthTokenMock).not.toHaveBeenCalled();
    expect(onAuthenticatedMock).not.toHaveBeenCalled();
  });
});
