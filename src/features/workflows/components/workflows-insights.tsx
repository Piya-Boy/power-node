"use client";

import { format } from "date-fns";
import {
  ActivityIcon,
  AlertTriangleIcon,
  Clock3Icon,
  DollarSignIcon,
  TrendingUpIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useSuspenseWorkflowInsights } from "@/features/workflows/hooks/use-workflows";

const chartConfig = {
  executions: {
    label: "Executions",
    color: "#0f766e",
  },
  successRate: {
    label: "Success rate",
    color: "#f97316",
  },
};

const formatDuration = (durationMs: number) => {
  if (durationMs >= 60_000) {
    return `${Math.round((durationMs / 60_000) * 10) / 10}m`;
  }

  return `${Math.round(durationMs / 1000)}s`;
};

const formatTrend = (value: number) => {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value}%`;
};

export const WorkflowsInsights = ({
  windowDays = 30,
}: {
  windowDays?: number;
}) => {
  const { data } = useSuspenseWorkflowInsights(windowDays);

  if (data.metrics.totalExecutions === 0) {
    return (
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Insights dashboard</CardTitle>
          <CardDescription>
            Run a workflow to unlock success-rate trends, bottleneck detection,
            and estimated time savings.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const executionSeries = data.executionSeries.points.map((point) => ({
    label: format(point.timestamp, windowDays <= 14 ? "MMM d" : "MMM d"),
    executions: point.value,
  }));

  const successRateSeries = data.successRateSeries.points.map((point) => ({
    label: format(point.timestamp, windowDays <= 14 ? "MMM d" : "MMM d"),
    successRate: point.value,
  }));

  const executionTrend = data.trends.find(
    (trend) => trend.metric === "total_executions",
  );
  const successTrend = data.trends.find(
    (trend) => trend.metric === "success_rate",
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Executions"
          value={data.metrics.totalExecutions.toLocaleString()}
          description={`${formatTrend(executionTrend?.changePercent ?? 0)} vs previous ${windowDays} days`}
          icon={<ActivityIcon className="size-4" />}
        />
        <MetricCard
          title="Success rate"
          value={`${data.metrics.overallSuccessRate}%`}
          description={`${formatTrend(successTrend?.changePercent ?? 0)} compared with previous window`}
          icon={<TrendingUpIcon className="size-4" />}
        />
        <MetricCard
          title="Time saved"
          value={`${Math.round(data.savings.totalTimeSavedPerMonth / 60)}h`}
          description="Estimated monthly hours reclaimed by automation"
          icon={<Clock3Icon className="size-4" />}
        />
        <MetricCard
          title="Savings"
          value={`$${Math.round(data.savings.totalMonthlySavingsUsd).toLocaleString()}`}
          description={`Estimated ${data.metrics.activeWorkflows} active workflows in the last ${windowDays} days`}
          icon={<DollarSignIcon className="size-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Execution trend</CardTitle>
            <CardDescription>
              Executions per time bucket from{" "}
              {format(data.period.start, "MMM d")} to{" "}
              {format(data.period.end, "MMM d")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer className="h-[260px] w-full" config={chartConfig}>
              <BarChart data={executionSeries}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} width={30} />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent />}
                />
                <Bar
                  dataKey="executions"
                  fill="var(--color-executions)"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Success trend</CardTitle>
            <CardDescription>
              Success rate over the same window with top bottlenecks called out
              below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ChartContainer className="h-[180px] w-full" config={chartConfig}>
              <LineChart data={successRateSeries}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} width={30} />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent />}
                />
                <Line
                  dataKey="successRate"
                  type="monotone"
                  stroke="var(--color-successRate)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>

            <div className="space-y-3">
              {data.bottlenecks.length === 0 ? (
                <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  No critical bottlenecks detected in this window.
                </div>
              ) : (
                data.bottlenecks.map((bottleneck) => (
                  <div
                    key={`${bottleneck.workflowId}-${bottleneck.type}`}
                    className="rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <AlertTriangleIcon className="size-4 text-amber-600" />
                      {bottleneck.workflowName}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {bottleneck.recommendation}
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Workflow breakdown</CardTitle>
          <CardDescription>
            Top workflows by execution volume, duration, and failure risk.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.workflows.slice(0, 5).map((workflow) => (
              <div
                key={workflow.workflowId}
                className="grid gap-2 rounded-lg border p-4 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {workflow.workflowName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Last run{" "}
                    {workflow.lastExecutedAt
                      ? format(workflow.lastExecutedAt, "MMM d, HH:mm")
                      : "never"}
                  </p>
                </div>
                <StatCell
                  label="Executions"
                  value={workflow.totalExecutions.toLocaleString()}
                />
                <StatCell label="Success" value={`${workflow.successRate}%`} />
                <StatCell
                  label="Avg duration"
                  value={formatDuration(workflow.avgDurationMs)}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const MetricCard = ({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
}) => {
  return (
    <Card className="shadow-none">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
};

const StatCell = ({ label, value }: { label: string; value: string }) => {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
};
