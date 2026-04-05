import {
  aggregateSavings,
  buildExecutionTimeSeries,
  buildSuccessRateTimeSeries,
  comparePeriods,
  computeAllInsights,
  computeDashboardMetrics,
  detectBottlenecks,
  type ExecutionDataPoint,
  estimateSavings,
  type TimeGranularity,
} from "@/features/analytics/lib/insights-dashboard";
import { ExecutionStatus, NodeType } from "@/generated/prisma";

type ExecutionInsightRecord = {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  startedAt: Date;
  completedAt: Date | null;
  output: unknown;
  workflow: {
    id: string;
    name: string;
    nodes: Array<{
      type: NodeType;
    }>;
  };
};

export interface WorkflowInsightsSnapshot {
  period: {
    start: Date;
    end: Date;
  };
  previousPeriod: {
    start: Date;
    end: Date;
  };
  metrics: ReturnType<typeof computeDashboardMetrics>;
  trends: ReturnType<typeof comparePeriods>;
  workflows: ReturnType<typeof computeAllInsights>;
  executionSeries: ReturnType<typeof buildExecutionTimeSeries>;
  successRateSeries: ReturnType<typeof buildSuccessRateTimeSeries>;
  bottlenecks: ReturnType<typeof detectBottlenecks>;
  savings: {
    totalTimeSavedPerMonth: number;
    totalMonthlySavingsUsd: number;
    totalAnnualSavingsUsd: number;
  };
}

function hasNodeType(nodeTypes: NodeType[], ...types: NodeType[]) {
  return types.some((type) => nodeTypes.includes(type));
}

export function inferExecutionTrigger(
  nodeTypes: NodeType[],
): ExecutionDataPoint["triggeredBy"] {
  if (hasNodeType(nodeTypes, NodeType.SCHEDULE_TRIGGER)) {
    return "schedule";
  }

  if (
    hasNodeType(
      nodeTypes,
      NodeType.WEBHOOK_TRIGGER,
      NodeType.GOOGLE_FORM_TRIGGER,
      NodeType.STRIPE_TRIGGER,
      NodeType.EMAIL_TRIGGER,
    )
  ) {
    return "webhook";
  }

  if (hasNodeType(nodeTypes, NodeType.MANUAL_TRIGGER, NodeType.CHAT_TRIGGER)) {
    return "manual";
  }

  return "api";
}

export function inferExecutionCost(output: unknown): number {
  if (typeof output !== "object" || output === null || Array.isArray(output)) {
    return 0;
  }

  const outputRecord = output as Record<string, unknown>;
  const directCost = outputRecord.cost;
  if (typeof directCost === "number" && Number.isFinite(directCost)) {
    return directCost;
  }

  const totalCost = outputRecord.totalCost;
  if (typeof totalCost === "number" && Number.isFinite(totalCost)) {
    return totalCost;
  }

  return 0;
}

export function estimateManualTimeMinutes(nodeCount: number): number {
  return Math.max(5, Math.round(nodeCount * 1.5));
}

export function pickInsightsGranularity(windowDays: number): TimeGranularity {
  if (windowDays <= 14) {
    return "day";
  }

  if (windowDays <= 60) {
    return "week";
  }

  return "month";
}

export function mapExecutionRecordToDataPoint(
  record: ExecutionInsightRecord,
): ExecutionDataPoint {
  const nodeTypes = record.workflow.nodes.map((node) => node.type);

  return {
    workflowId: record.workflowId,
    workflowName: record.workflow.name,
    executedAt: record.startedAt,
    durationMs: record.completedAt
      ? Math.max(0, record.completedAt.getTime() - record.startedAt.getTime())
      : 0,
    status:
      record.status === ExecutionStatus.SUCCESS
        ? "success"
        : record.status === ExecutionStatus.FAILED
          ? "failed"
          : "cancelled",
    triggeredBy: inferExecutionTrigger(nodeTypes),
    nodeCount: record.workflow.nodes.length,
    cost: inferExecutionCost(record.output),
  };
}

export function buildWorkflowInsightsSnapshot(
  records: ExecutionInsightRecord[],
  options: {
    now?: Date;
    windowDays?: number;
  } = {},
): WorkflowInsightsSnapshot {
  const now = options.now ?? new Date();
  const windowDays = options.windowDays ?? 30;
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const period = {
    start: new Date(now.getTime() - windowMs),
    end: now,
  };
  const previousPeriod = {
    start: new Date(period.start.getTime() - windowMs),
    end: period.start,
  };

  const currentData = records
    .filter(
      (record) =>
        record.startedAt >= period.start && record.startedAt <= period.end,
    )
    .map(mapExecutionRecordToDataPoint);
  const previousData = records
    .filter(
      (record) =>
        record.startedAt >= previousPeriod.start &&
        record.startedAt < previousPeriod.end,
    )
    .map(mapExecutionRecordToDataPoint);

  const metrics = computeDashboardMetrics(currentData, period);
  const previousMetrics = computeDashboardMetrics(previousData, previousPeriod);
  const workflows = computeAllInsights(currentData).sort(
    (left, right) => right.totalExecutions - left.totalExecutions,
  );
  const granularity = pickInsightsGranularity(windowDays);
  const executionSeries = buildExecutionTimeSeries(
    currentData,
    granularity,
    period.start,
    period.end,
  );
  const successRateSeries = buildSuccessRateTimeSeries(
    currentData,
    granularity,
    period.start,
    period.end,
  );
  const bottlenecks = detectBottlenecks(workflows).slice(0, 5);
  const savings = aggregateSavings(
    workflows.map((workflow) => {
      const source = currentData.find(
        (entry) => entry.workflowId === workflow.workflowId,
      );
      return estimateSavings({
        workflowId: workflow.workflowId,
        workflowName: workflow.workflowName,
        executionsPerMonth: workflow.totalExecutions,
        avgManualTimeMinutes: estimateManualTimeMinutes(source?.nodeCount ?? 1),
        avgExecutionMs: workflow.avgDurationMs,
      });
    }),
  );

  return {
    period,
    previousPeriod,
    metrics,
    trends: comparePeriods(metrics, previousMetrics),
    workflows,
    executionSeries,
    successRateSeries,
    bottlenecks,
    savings,
  };
}
