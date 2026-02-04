"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { SignInButton, SignedIn, SignedOut, useAuth, useUser } from "@clerk/nextjs";
import { Globe, Info, RotateCcw, Save, User } from "lucide-react";

import { DashboardShell } from "@/components/templates/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SearchableSelect from "@/components/ui/searchable-select";
import { getApiBaseUrl } from "@/lib/api-base";

const apiBase = getApiBaseUrl();

type UserProfile = {
  id: string;
  name?: string | null;
  preferred_name?: string | null;
  pronouns?: string | null;
  timezone?: string | null;
  notes?: string | null;
  context?: string | null;
};

const isCompleteProfile = (profile: UserProfile | null) => {
  if (!profile) return false;
  const resolvedName = profile.preferred_name?.trim() || profile.name?.trim();
  return Boolean(resolvedName) && Boolean(profile.timezone?.trim());
};

export default function OnboardingPage() {
  const router = useRouter();
  const { getToken, isSignedIn } = useAuth();
  const { user } = useUser();

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiredMissing = useMemo(
    () => [name, timezone].some((value) => !value.trim()),
    [name, timezone]
  );

  const timezones = useMemo(() => {
    if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
      return (Intl as typeof Intl & { supportedValuesOf: (key: string) => string[] })
        .supportedValuesOf("timeZone")
        .sort();
    }
    return [
      "America/Los_Angeles",
      "America/Denver",
      "America/Chicago",
      "America/New_York",
      "America/Sao_Paulo",
      "Europe/London",
      "Europe/Berlin",
      "Europe/Paris",
      "Asia/Dubai",
      "Asia/Kolkata",
      "Asia/Singapore",
      "Asia/Tokyo",
      "Australia/Sydney",
    ];
  }, []);

  const timezoneOptions = useMemo(
    () => timezones.map((tz) => ({ value: tz, label: tz })),
    [timezones],
  );

  const loadProfile = async () => {
    if (!isSignedIn) return;
    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const response = await fetch(`${apiBase}/api/v1/users/me`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!response.ok) {
        throw new Error("Unable to load profile.");
      }
      const data = (await response.json()) as UserProfile;
      const fallbackName =
        user?.fullName ?? user?.firstName ?? user?.username ?? "";
      setName(data.preferred_name ?? data.name ?? fallbackName);
      setTimezone(data.timezone ?? "");
      if (isCompleteProfile(data)) {
        router.replace("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!name.trim() && user) {
      const fallbackName =
        user.fullName ?? user.firstName ?? user.username ?? "";
      if (fallbackName) {
        setName(fallbackName);
      }
    }
  }, [user, name]);

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSignedIn) return;
    if (requiredMissing) {
      setError("Please complete the required fields.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const normalizedName = name.trim();
      const payload = {
        name: normalizedName,
        preferred_name: normalizedName,
        timezone: timezone.trim(),
      };
      const response = await fetch(`${apiBase}/api/v1/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("Unable to update profile.");
      }
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DashboardShell>
      <SignedOut>
        <div className="lg:col-span-2 flex min-h-[70vh] items-center justify-center">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Mission Control profile
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Sign in to configure your profile and timezone.
              </p>
            </div>
            <div className="px-6 py-6">
              <SignInButton
                mode="modal"
                forceRedirectUrl="/onboarding"
                signUpForceRedirectUrl="/onboarding"
              >
                <Button size="lg">Sign in</Button>
              </SignInButton>
            </div>
          </div>
        </div>
      </SignedOut>
      <SignedIn>
        <div className="lg:col-span-2 flex min-h-[70vh] items-center justify-center">
          <section className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Mission Control profile
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Configure your mission control settings and preferences.
              </p>
            </div>
            <div className="px-6 py-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                      <User className="h-4 w-4 text-slate-500" />
                      Name
                      <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Enter your name"
                      disabled={isLoading}
                      className="border-slate-300 text-slate-900 focus-visible:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                      <Globe className="h-4 w-4 text-slate-500" />
                      Timezone
                      <span className="text-red-500">*</span>
                    </label>
                    <SearchableSelect
                      ariaLabel="Select timezone"
                      value={timezone}
                      onValueChange={setTimezone}
                      options={timezoneOptions}
                      placeholder="Select timezone"
                      searchPlaceholder="Search timezones..."
                      emptyMessage="No matching timezones."
                      triggerClassName="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      contentClassName="rounded-xl border border-slate-200 shadow-lg"
                      itemClassName="px-4 py-3 text-sm text-slate-700 data-[selected=true]:bg-slate-50 data-[selected=true]:text-slate-900"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 flex items-start gap-3">
                  <Info className="mt-0.5 h-4 w-4 text-blue-600" />
                  <p>
                    <strong>Note:</strong> Your timezone is used to display all
                    timestamps and schedule mission-critical events accurately.
                  </p>
                </div>

                {error ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    {error}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3 pt-2">
                  <Button
                    type="submit"
                    className="flex-1 bg-blue-600 text-white hover:bg-blue-700 py-2.5"
                    disabled={isLoading || requiredMissing}
                  >
                    <Save className="h-4 w-4" />
                    {isLoading ? "Saving…" : "Save Profile"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setName("");
                      setTimezone("");
                      setError(null);
                    }}
                    className="flex-1 rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <span className="inline-flex items-center gap-2">
                      <RotateCcw className="h-4 w-4" />
                      Reset
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      </SignedIn>
    </DashboardShell>
  );
}
