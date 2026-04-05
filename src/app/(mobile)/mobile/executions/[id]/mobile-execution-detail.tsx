"use client";

import { format } from "date-fns";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  ClockIcon,
  Loader2Icon,
  RotateCcwIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useSuspenseExecution, useRetryExecution } from "@/features/executions/hooks/use-executions";
import { ExecutionStatus } from "@/generated/prisma";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const getStatusIcon = (status: ExecutionStatus, className?: string) => {
  const cls = cn("size-6", className);
  switch (status) {
    case ExecutionStatus.SUCCESS:
      return <CheckCircle2Icon className={cn(cls, "text-green-500")} />;
    case ExecutionStatus.FAILED:
      return <XCircleIcon className={cn(cls, "text-red-500")} />;
    case ExecutionStatus.RUNNING:
      return <Loader2Icon className={cn(cls, "text-blue-500 animate-spin")} />;
    default:
      return <ClockIcon className={cn(cls, "text-muted-foreground")} />;
  }
};

const statusLabel: Record<ExecutionStatus, string> = {
  [ExecutionStatus.SUCCESS]: "Success",
  [ExecutionStatus.FAILED]: "Failed",
  [ExecutionStatus.RUNNING]: "Running",
};

const statusBg: Record<ExecutionStatus, string> = {
  [ExecutionStatus.SUCCESS]: "bg-green-50 dark:bg-green-950/30",
  [ExecutionStatus.FAILED]: "bg-red-50 dark:bg-red-950/30",
  [ExecutionStatus.RUNNING]: "bg-blue-50 dark:bg-blue-950/30",
};

export const MobileExecutionDetail = ({ id }: { id: string }) => {
  const { data: execution } = useSuspenseExecution(id);
  const retry = useRetryExecution();

  const duration =
    execution.completedAt
      ? Math.round(
          (new Date(execution.completedAt).getTime() -
            new Date(execution.startedAt).getTime()) /
            1000,
        )
      : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Back */}
      <Link
        href="/mobile/executions"
        className="flex items-center gap-1.5 text-sm text-muted-foreground -ml-1"
      >
        <ArrowLeftIcon className="size-4" />
        Executions
      </Link>

      {/* Status card */}
      <div
        className={cn(
          "flex flex-col items-center gap-2 rounded-2xl p-6 text-center",
          statusBg[execution.status],
        )}
      >
        {getStatusIcon(execution.status, "size-10")}
        <p className="text-xl font-semibold">{statusLabel[execution.status]}</p>
        <p className="text-sm text-muted-foreground">{execution.workflow.name}</p>
      </div>

      {/* Details */}
      <div className="rounded-xl border bg-card divide-y">
        <DetailRow label="Execution ID" value={execution.id} mono />
        <DetailRow
          label="Started"
          value={format(execution.startedAt, "MMM d, yyyy HH:mm:ss")}
        />
        {execution.completedAt && (
          <DetailRow
            label="Completed"
            value={format(execution.completedAt, "MMM d, yyyy HH:mm:ss")}
          />
        )}
        {duration !== null && (
          <DetailRow label="Duration" value={`${duration}s`} />
        )}
        {execution.output && (
          <DetailRow label="Output" value="Available" />
        )}
      </div>

      {/* Error */}
      {execution.status === ExecutionStatus.FAILED && execution.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-600 mb-1">
            Error
          </p>
          <p className="text-sm text-red-700 dark:text-red-400 font-mono break-all">
            {String(execution.error)}
          </p>
        </div>
      )}

      {/* Retry */}
      {execution.status === ExecutionStatus.FAILED && (
        <Button
          onClick={() => retry.mutate({ id: execution.id })}
          disabled={retry.isPending}
          className="w-full rounded-xl h-12"
        >
          {retry.isPending ? (
            <Loader2Icon className="size-4 animate-spin mr-2" />
          ) : (
            <RotateCcwIcon className="size-4 mr-2" />
          )}
          Retry Execution
        </Button>
      )}
    </div>
  );
};

const DetailRow = ({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) => (
  <div className="flex items-start justify-between gap-4 px-4 py-3">
    <span className="text-sm text-muted-foreground flex-shrink-0">{label}</span>
    <span className={cn("text-sm text-right break-all", mono && "font-mono text-xs")}>
      {value}
    </span>
  </div>
);

export const MobileExecutionDetailLoading = () => (
  <div className="flex flex-col gap-4">
    <div className="h-4 w-24 rounded bg-muted animate-pulse" />
    <div className="h-40 rounded-2xl bg-muted animate-pulse" />
    <div className="h-32 rounded-xl bg-muted animate-pulse" />
  </div>
);

export const MobileExecutionDetailError = () => (
  <div className="mt-12 flex flex-col items-center gap-2 text-center text-muted-foreground">
    <XCircleIcon className="size-10 opacity-40" />
    <p className="text-sm">Failed to load execution.</p>
  </div>
);
