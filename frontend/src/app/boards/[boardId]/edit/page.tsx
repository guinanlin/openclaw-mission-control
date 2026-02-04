"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { SignInButton, SignedIn, SignedOut, useAuth } from "@clerk/nextjs";

import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SearchableSelect from "@/components/ui/searchable-select";
import { getApiBaseUrl } from "@/lib/api-base";

const apiBase = getApiBaseUrl();

type Board = {
  id: string;
  name: string;
  slug: string;
  gateway_id?: string | null;
};

type Gateway = {
  id: string;
  name: string;
  url: string;
  main_session_key: string;
  workspace_root: string;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "board";

export default function EditBoardPage() {
  const { getToken, isSignedIn } = useAuth();
  const router = useRouter();
  const params = useParams();
  const boardIdParam = params?.boardId;
  const boardId = Array.isArray(boardIdParam) ? boardIdParam[0] : boardIdParam;

  const [board, setBoard] = useState<Board | null>(null);
  const [name, setName] = useState("");
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [gatewayId, setGatewayId] = useState<string>("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFormReady = Boolean(name.trim() && gatewayId);

  const gatewayOptions = useMemo(
    () => gateways.map((gateway) => ({ value: gateway.id, label: gateway.name })),
    [gateways]
  );

  const loadGateways = async (): Promise<Gateway[]> => {
    if (!isSignedIn) return [];
    const token = await getToken();
    const response = await fetch(`${apiBase}/api/v1/gateways`, {
      headers: { Authorization: token ? `Bearer ${token}` : "" },
    });
    if (!response.ok) {
      throw new Error("Unable to load gateways.");
    }
    const data = (await response.json()) as Gateway[];
    setGateways(data);
    return data;
  };

  const loadBoard = async () => {
    if (!isSignedIn || !boardId) return;
    try {
      const token = await getToken();
      const response = await fetch(`${apiBase}/api/v1/boards/${boardId}`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!response.ok) {
        throw new Error("Unable to load board.");
      }
      const data = (await response.json()) as Board;
      setBoard(data);
      setName(data.name ?? "");
      if (data.gateway_id) {
        setGatewayId(data.gateway_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  useEffect(() => {
    loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) return;
    loadGateways()
      .then((configs) => {
        if (!gatewayId && configs.length > 0) {
          setGatewayId(configs[0].id);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSignedIn || !boardId) return;
    if (!name.trim()) {
      setError("Board name is required.");
      return;
    }
    if (!gatewayId) {
      setError("Select a gateway before saving.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();

      const response = await fetch(`${apiBase}/api/v1/boards/${boardId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({
          name: name.trim(),
          slug: slugify(name.trim()),
          gateway_id: gatewayId || null,
        }),
      });
      if (!response.ok) {
        throw new Error("Unable to update board.");
      }
      const updated = (await response.json()) as Board;
      router.push(`/boards/${updated.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DashboardShell>
      <SignedOut>
        <div className="col-span-2 flex min-h-[calc(100vh-64px)] items-center justify-center bg-slate-50 p-10 text-center">
          <div className="rounded-xl border border-slate-200 bg-white px-8 py-6 shadow-sm">
            <p className="text-sm text-slate-600">Sign in to edit boards.</p>
            <SignInButton
              mode="modal"
              forceRedirectUrl={`/boards/${boardId}/edit`}
              signUpForceRedirectUrl={`/boards/${boardId}/edit`}
            >
              <Button className="mt-4">Sign in</Button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>
      <SignedIn>
        <DashboardSidebar />
        <main className="flex-1 overflow-y-auto bg-slate-50">
          <div className="border-b border-slate-200 bg-white px-8 py-6">
            <div>
              <h1 className="font-heading text-2xl font-semibold text-slate-900 tracking-tight">
                Edit board
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Update board settings and gateway.
              </p>
            </div>
          </div>

          <div className="p-8">
            <form
              onSubmit={handleSubmit}
              className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900">
                    Board name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Board name"
                    disabled={isLoading || !board}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900">
                    Gateway <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    ariaLabel="Select gateway"
                    value={gatewayId}
                    onValueChange={setGatewayId}
                    options={gatewayOptions}
                    placeholder="Select gateway"
                    searchPlaceholder="Search gateways..."
                    emptyMessage="No gateways found."
                    triggerClassName="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    contentClassName="rounded-xl border border-slate-200 shadow-lg"
                    itemClassName="px-4 py-3 text-sm text-slate-700 data-[selected=true]:bg-slate-50 data-[selected=true]:text-slate-900"
                  />
                </div>
              </div>

              {gateways.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p>No gateways available. Create one in Gateways to continue.</p>
                </div>
              ) : null}

              {error ? <p className="text-sm text-red-500">{error}</p> : null}

              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => router.push(`/boards/${boardId}`)}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading || !board || !isFormReady}>
                  {isLoading ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          </div>
        </main>
      </SignedIn>
    </DashboardShell>
  );
}
