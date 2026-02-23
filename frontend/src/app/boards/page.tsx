"use client";

export const dynamic = "force-dynamic";

import { useMemo, useEffect } from "react";
import Link from "next/link";

import { useAuth } from "@/auth/clerk";
import { useRouter } from "next/navigation";

import { ApiError } from "@/api/mutator";
import {
  type listBoardsApiV1BoardsGetResponse,
  useListBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { buttonVariants } from "@/components/ui/button";

export default function BoardsPage() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const boardsQuery = useListBoardsApiV1BoardsGet<
    listBoardsApiV1BoardsGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn),
      refetchOnMount: "always",
    },
  });

  const boards = useMemo(
    () =>
      boardsQuery.data?.status === 200
        ? (boardsQuery.data.data.items ?? [])
        : [],
    [boardsQuery.data],
  );

  // 有看板时直接进入第一个看板详情页
  useEffect(() => {
    if (!isSignedIn || boardsQuery.isLoading || boards.length === 0) return;
    const first = boards[0];
    if (first?.id) {
      router.replace(`/boards/${first.id}`);
    }
  }, [isSignedIn, boardsQuery.isLoading, boards, router]);

  if (!isSignedIn) {
    return (
      <DashboardPageLayout
        signedOut={{
          message: "Sign in to view boards.",
          forceRedirectUrl: "/boards",
          signUpForceRedirectUrl: "/boards",
        }}
        title="Boards"
        description="Manage boards and task workflows."
      >
        <div />
      </DashboardPageLayout>
    );
  }

  if (boardsQuery.isLoading) {
    return (
      <DashboardPageLayout
        title="Boards"
        description="Loading…"
      >
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
          Loading…
        </div>
      </DashboardPageLayout>
    );
  }

  // 无看板时仅展示空状态（重定向由 useEffect 处理，有看板时不会走到这里）
  if (boards.length > 0) {
    return (
      <DashboardPageLayout title="Boards" description="Redirecting…">
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
          Redirecting to board…
        </div>
      </DashboardPageLayout>
    );
  }

  return (
    <DashboardPageLayout
      title="Boards"
      description="No boards yet. Create your first board to start."
      headerActions={
        isAdmin ? (
          <Link
            href="/boards/new"
            className={buttonVariants({
              size: "md",
              variant: "primary",
            })}
          >
            Create board
          </Link>
        ) : null
      }
    >
      <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-700">No boards yet</p>
        <p className="mt-1 text-sm text-slate-500">
          Create your first board to start routing tasks and monitoring work
          across agents.
        </p>
        {isAdmin ? (
          <Link
            href="/boards/new"
            className={buttonVariants({
              size: "md",
              variant: "primary",
              className: "mt-4",
            })}
          >
            Create your first board
          </Link>
        ) : null}
      </div>
      {boardsQuery.error ? (
        <p className="mt-4 text-sm text-red-500">
          {boardsQuery.error.message}
        </p>
      ) : null}
    </DashboardPageLayout>
  );
}
