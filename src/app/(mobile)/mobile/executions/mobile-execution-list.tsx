"use client";

import { formatDistanceToNow } from "date-fns";
import { CheckCircle2Icon, ClockIcon, Loader2Icon, XCircleIcon } from "lucide-react";
import Link from "next/link";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { ExecutionStatus } from "@/generated/prisma";
import { cn } from "@/lib/utils";

const getStatusIcon = (status: ExecutionStatus) => {
  switch (status) {
    case ExecutionStatus.SUCCESS:
      return <CheckCircle2Icon className="size-5 text-green-500" />;
    case ExecutionStatus.FAILED:
      return <XCircleIcon className="size-5 text-red-500" />;
    case ExecutionStatus.RUNNING:
      return <Loader2Icon className="size-5 text-blue-500 animate-spin" />;
    default:
      return <ClockIcon className="size-5 text-muted-foreground" />;
  }
};

const getStatusColor = (status: ExecutionStatus) => {
  switch (status) {
    case ExecutionStatus.SUCCESS:
      return "text-green-600 bg-green-50 dark:bg-green-950/30";
    case ExecutionStatus.FAILED:
      return "text-red-600 bg-red-50 dark:bg-red-950/30";
    case ExecutionStatus.RUNNING:
      return "text-blue-600 bg-blue-50 dark:bg-blue-950/30";
    default:
      return "text-muted-foreground bg-muted";
  }
};

export const MobileExecutionList = () => {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(
    trpc.executions.getMany.queryOptions({ page: 1, pageSize: 20 }),
  );

  if (data.items.length === 0) {
    return (
      <div className="mt-12 flex flex-col items-center gap-2 text-center text-muted-foreground">
        <ClockIcon className="size-10 opacity-40" />
        <p className="text-sm">No executions yet.</p>
        <p className="text-xs">Run a workflow to see results here.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {data.items.map((execution) => {
        const duration =
          execution.completedAt
            ? Math.round(
                (new Date(execution.completedAt).getTime() -
                  new Date(execution.startedAt).getTime()) /
                  1000,
              )
            : null;

        return (
          <Link
            key={execution.id}
            href={`/mobile/executions/${execution.id}`}
            className="flex items-center gap-3 rounded-xl border bg-card p-4 active:opacity-80 transition-opacity"
          >
            <div className="flex-shrink-0">{getStatusIcon(execution.status)}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{execution.workflow.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(execution.startedAt, { addSuffix: true })}
                {duration !== null && ` · ${duration}s`}
              </p>
            </div>
            <span
              className={cn(
                "flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                getStatusColor(execution.status),
              )}
            >
              {execution.status.charAt(0) + execution.status.slice(1).toLowerCase()}
            </span>
          </Link>
        );
      })}
    </div>
  );
};

export const MobileExecutionListLoading = () => (
  <div className="flex flex-col gap-2">
    {Array.from({ length: 6 }).map((_, i) => (
      <div
        key={i}
        className="h-[68px] rounded-xl border bg-muted/40 animate-pulse"
      />
    ))}
  </div>
);

export const MobileExecutionListError = () => (
  <div className="mt-12 flex flex-col items-center gap-2 text-center text-muted-foreground">
    <XCircleIcon className="size-10 opacity-40" />
    <p className="text-sm">Failed to load executions.</p>
  </div>
);
