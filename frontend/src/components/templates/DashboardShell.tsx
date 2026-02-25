"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { SignedIn, useAuth } from "@/auth/clerk";

import { ApiError } from "@/api/mutator";
import {
  type getMeApiV1UsersMeGetResponse,
  useGetMeApiV1UsersMeGet,
} from "@/api/generated/users/users";
import { BrandMark } from "@/components/atoms/BrandMark";
import { OrgSwitcher } from "@/components/organisms/OrgSwitcher";
import { UserMenu } from "@/components/organisms/UserMenu";
import { isOnboardingComplete } from "@/lib/onboarding";

/** 节流间隔：同一来源的 org-switch 通知在此时间内只触发一次整页刷新，避免误触或重复消息导致频繁刷新 */
const ORG_SWITCH_RELOAD_THROTTLE_MS = 5000;

/** 用于调试：在控制台打印「上一页整页刷新」的原因，便于确认是否由 org-switch 触发 */
const RELOAD_REASON_KEY = "openclaw_last_reload_reason";

function logLastReloadReasonIfAny() {
  if (typeof window === "undefined") return;
  try {
    const reason = window.sessionStorage.getItem(RELOAD_REASON_KEY);
    if (reason) {
      window.sessionStorage.removeItem(RELOAD_REASON_KEY);
      // eslint-disable-next-line no-console
      console.log(
        "[DashboardShell] 上一页整页刷新原因:",
        reason,
        "— 若频繁出现且非你主动切换组织，说明刷新由此逻辑触发，可设置 NEXT_PUBLIC_DISABLE_ORG_SWITCH_RELOAD=true 关闭",
      );
    }
  } catch {
    // ignore
  }
}

const isOrgSwitchReloadDisabled = () =>
  process.env.NEXT_PUBLIC_DISABLE_ORG_SWITCH_RELOAD === "true";

export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const isOnboardingPath = pathname === "/onboarding";

  const meQuery = useGetMeApiV1UsersMeGet<
    getMeApiV1UsersMeGetResponse,
    ApiError
  >({
    query: {
      enabled: Boolean(isSignedIn) && !isOnboardingPath,
      retry: false,
      refetchOnMount: "always",
    },
  });
  const profile = meQuery.data?.status === 200 ? meQuery.data.data : null;
  const displayName = profile?.name ?? profile?.preferred_name ?? "Operator";
  const displayEmail = profile?.email ?? "";

  useEffect(() => {
    if (!isSignedIn || isOnboardingPath) return;
    if (!profile) return;
    if (!isOnboardingComplete(profile)) {
      router.replace("/onboarding");
    }
  }, [isOnboardingPath, isSignedIn, profile, router]);

  useEffect(() => {
    logLastReloadReasonIfAny();
  }, []);

  const lastOrgSwitchReloadRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isOrgSwitchReloadDisabled()) return;

    const scheduleReload = (source: "storage" | "broadcast-channel") => {
      const now = Date.now();
      if (now - lastOrgSwitchReloadRef.current < ORG_SWITCH_RELOAD_THROTTLE_MS) {
        return;
      }
      lastOrgSwitchReloadRef.current = now;
      try {
        window.sessionStorage.setItem(
          RELOAD_REASON_KEY,
          `org-switch (${source})`,
        );
      } catch {
        // ignore
      }
      window.location.reload();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "openclaw_org_switch" || !event.newValue) return;
      scheduleReload("storage");
    };

    window.addEventListener("storage", handleStorage);

    let channel: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel("org-switch");
      channel.onmessage = () => {
        scheduleReload("broadcast-channel");
      };
    }

    return () => {
      window.removeEventListener("storage", handleStorage);
      channel?.close();
    };
  }, []);

  return (
    <div className="min-h-screen bg-app text-strong">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[260px_1fr_auto] items-center gap-0 py-3">
          <div className="flex items-center px-6">
            <BrandMark />
          </div>
          <SignedIn>
            <div className="flex items-center">
              <div className="max-w-[220px]">
                <OrgSwitcher />
              </div>
            </div>
          </SignedIn>
          <SignedIn>
            <div className="flex items-center gap-3 px-6">
              <div className="hidden text-right lg:block">
                <p className="text-sm font-semibold text-slate-900">
                  {displayName}
                </p>
                <p className="text-xs text-slate-500">Operator</p>
              </div>
              <UserMenu displayName={displayName} displayEmail={displayEmail} />
            </div>
          </SignedIn>
        </div>
      </header>
      <div className="grid min-h-[calc(100vh-64px)] grid-cols-[260px_1fr] bg-slate-50">
        {children}
      </div>
    </div>
  );
}
