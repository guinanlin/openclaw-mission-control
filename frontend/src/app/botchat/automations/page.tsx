"use client";

export const dynamic = "force-dynamic";

import { Workflow } from "lucide-react";

import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Button } from "@/components/ui/button";

/**
 * BotChat Automations page — scheduled tasks and cron jobs (BotsChat Automations view).
 * Structure mirrors BotsChat: task list sidebar + job list / detail area.
 * Backend integration (cron list, job runs) can be wired later.
 */
export default function BotChatAutomationsPage() {
  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to view BotChat automations.",
        forceRedirectUrl: "/botchat/automations",
        signUpForceRedirectUrl: "/botchat/automations",
      }}
      title="Automations"
      description="Scheduled tasks and cron jobs. Create and manage recurring background jobs with OpenClaw agents."
    >
      <div className="grid min-h-[480px] grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          {/* Left: Automation tasks list (BotsChat CronSidebar equivalent) */}
          <aside className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Workflow className="h-4 w-4 text-slate-500" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                  Automations
                </h2>
              </div>
            </div>
            <p className="text-sm text-slate-500">
              Cron tasks from OpenClaw will appear here. Create an automation to
              run recurring jobs.
            </p>
            <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
              <Workflow
                className="h-10 w-10 text-slate-300"
                strokeWidth={1}
                aria-hidden
              />
              <p className="text-sm font-medium text-slate-500">
                No automations yet
              </p>
              <p className="text-xs text-slate-400">
                Cron jobs from OpenClaw will appear here automatically, or you
                can create new automations once the integration is connected.
              </p>
              <Button variant="outline" size="sm" disabled>
                New automation (coming soon)
              </Button>
            </div>
          </aside>

          {/* Right: Job list / detail (BotsChat JobList / CronDetail equivalent) */}
          <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="rounded-full bg-slate-100 p-4">
                <Workflow className="h-8 w-8 text-slate-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-700">
                  Select an automation
                </h3>
                <p className="mt-1 max-w-sm text-sm text-slate-500">
                  Choose an automation from the list to view its schedule, runs,
                  and logs.
                </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardPageLayout>
  );
}
