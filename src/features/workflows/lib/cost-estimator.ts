/**
 * Phase 54 — Workflow Cost Estimator
 * Pure utility functions for estimating workflow execution costs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodeCostModel = "per-execution" | "per-second" | "per-item" | "free" | "custom";

export interface NodeCostConfig {
  nodeType: string;
  model: NodeCostModel;
  baseCostUsd: number; // cost per execution or per second
  freeTierLimit?: number; // free executions per month
  customFormula?: string; // description of custom cost model
  provider?: string; // e.g. "openai", "aws", "sendgrid"
}

export interface WorkflowCostEstimate {
  workflowId: string;
  estimatedMonthlyUsd: number;
  estimatedPerExecutionUsd: number;
  nodeBreakdown: Array<{
    nodeId: string;
    nodeType: string;
    costPerExecution: number;
    monthlyEstimateUsd: number;
    freeTierSavingsUsd: number;
  }>;
  assumptions: string[];
  confidence: "high" | "medium" | "low";
}

export interface CostBudget {
  id: string;
  workflowId?: string; // undefined = all workflows
  monthlyLimitUsd: number;
  alertAt: number; // percent (e.g. 80 = alert at 80%)
  currentSpendUsd: number;
  periodStart: Date;
  periodEnd: Date;
}

// ---------------------------------------------------------------------------
// NodeCostConfig helpers
// ---------------------------------------------------------------------------

export function createNodeCostConfig(
  params: Partial<NodeCostConfig> & { nodeType: string },
): NodeCostConfig {
  return {
    nodeType: params.nodeType,
    model: params.model ?? "per-execution",
    baseCostUsd: params.baseCostUsd ?? 0,
    freeTierLimit: params.freeTierLimit,
    customFormula: params.customFormula,
    provider: params.provider,
  };
}

// ---------------------------------------------------------------------------
// Cost calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the cost for a node given the number of executions and optional
 * average duration (for per-second models).
 */
export function calculateNodeCost(
  config: NodeCostConfig,
  executions: number,
  avgDurationSeconds = 1,
): number {
  if (executions <= 0) return 0;

  switch (config.model) {
    case "free":
      return 0;

    case "per-execution":
      return config.baseCostUsd * executions;

    case "per-second":
      return config.baseCostUsd * executions * avgDurationSeconds;

    case "per-item":
      // baseCostUsd = cost per item; executions treated as item count
      return config.baseCostUsd * executions;

    case "custom":
      // For custom models, fall back to per-execution calculation
      return config.baseCostUsd * executions;

    default:
      return 0;
  }
}

/**
 * Apply the free tier to executions, returning billable executions and savings.
 */
export function applyFreeTier(
  config: NodeCostConfig,
  executions: number,
  alreadyUsedFree = 0,
): { billableExecutions: number; freeTierSavings: number } {
  if (!config.freeTierLimit || config.freeTierLimit <= 0) {
    return { billableExecutions: executions, freeTierSavings: 0 };
  }

  const remainingFree = Math.max(0, config.freeTierLimit - alreadyUsedFree);
  const freeExecutions = Math.min(executions, remainingFree);
  const billableExecutions = Math.max(0, executions - freeExecutions);

  const freeTierSavings = calculateNodeCost(config, freeExecutions);

  return { billableExecutions, freeTierSavings };
}

// ---------------------------------------------------------------------------
// Workflow-level cost estimation
// ---------------------------------------------------------------------------

export interface WorkflowCostParams {
  workflowId: string;
  nodes: Array<{ id: string; type: string }>;
  nodeConfigs: Record<string, NodeCostConfig>; // keyed by nodeType
  executionsPerMonth: number;
  avgDurationSeconds?: number;
}

export function estimateWorkflowCost(params: WorkflowCostParams): WorkflowCostEstimate {
  const {
    workflowId,
    nodes,
    nodeConfigs,
    executionsPerMonth,
    avgDurationSeconds = 1,
  } = params;

  const assumptions: string[] = [];
  let totalPerExecution = 0;
  let totalMonthly = 0;
  let missingConfigs = 0;

  const nodeBreakdown = nodes.map((node) => {
    const config = nodeConfigs[node.type];

    if (!config) {
      missingConfigs++;
      return {
        nodeId: node.id,
        nodeType: node.type,
        costPerExecution: 0,
        monthlyEstimateUsd: 0,
        freeTierSavingsUsd: 0,
      };
    }

    const { billableExecutions, freeTierSavings } = applyFreeTier(
      config,
      executionsPerMonth,
    );

    const monthlyEstimateUsd = calculateNodeCost(
      config,
      billableExecutions,
      avgDurationSeconds,
    );
    const costPerExecution =
      billableExecutions > 0
        ? monthlyEstimateUsd / billableExecutions
        : config.model === "free"
          ? 0
          : config.baseCostUsd;

    totalPerExecution += costPerExecution;
    totalMonthly += monthlyEstimateUsd;

    return {
      nodeId: node.id,
      nodeType: node.type,
      costPerExecution,
      monthlyEstimateUsd,
      freeTierSavingsUsd: freeTierSavings,
    };
  });

  // Build assumptions
  if (avgDurationSeconds !== 1) {
    assumptions.push(`Average execution duration: ${avgDurationSeconds}s`);
  }
  if (missingConfigs > 0) {
    assumptions.push(`${missingConfigs} node type(s) have no cost config (treated as $0)`);
  }
  assumptions.push(`${executionsPerMonth} executions/month assumed`);

  // Confidence based on missing configs ratio
  const knownRatio = nodes.length > 0 ? (nodes.length - missingConfigs) / nodes.length : 1;
  let confidence: "high" | "medium" | "low";
  if (knownRatio >= 0.9) confidence = "high";
  else if (knownRatio >= 0.5) confidence = "medium";
  else confidence = "low";

  return {
    workflowId,
    estimatedMonthlyUsd: totalMonthly,
    estimatedPerExecutionUsd: totalPerExecution,
    nodeBreakdown,
    assumptions,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Node cost comparison
// ---------------------------------------------------------------------------

export function compareNodeCosts(
  configs: NodeCostConfig[],
  executions: number,
): Array<{ nodeType: string; totalCost: number; rank: number }> {
  const costs = configs.map((config) => ({
    nodeType: config.nodeType,
    totalCost: calculateNodeCost(config, executions),
  }));

  costs.sort((a, b) => b.totalCost - a.totalCost);

  return costs.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));
}

// ---------------------------------------------------------------------------
// Budget management
// ---------------------------------------------------------------------------

export function createBudget(
  params: Omit<CostBudget, "currentSpendUsd"> & { currentSpendUsd?: number },
): CostBudget {
  return {
    id: params.id,
    workflowId: params.workflowId,
    monthlyLimitUsd: params.monthlyLimitUsd,
    alertAt: params.alertAt,
    currentSpendUsd: params.currentSpendUsd ?? 0,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
  };
}

export function updateBudgetSpend(budget: CostBudget, additionalSpendUsd: number): CostBudget {
  return {
    ...budget,
    currentSpendUsd: budget.currentSpendUsd + additionalSpendUsd,
  };
}

export function getBudgetStatus(budget: CostBudget): {
  percent: number;
  remaining: number;
  status: "ok" | "warning" | "critical" | "exceeded";
} {
  const percent =
    budget.monthlyLimitUsd > 0
      ? (budget.currentSpendUsd / budget.monthlyLimitUsd) * 100
      : budget.currentSpendUsd > 0
        ? Infinity
        : 0;
  const remaining = Math.max(0, budget.monthlyLimitUsd - budget.currentSpendUsd);

  let status: "ok" | "warning" | "critical" | "exceeded";
  if (budget.currentSpendUsd >= budget.monthlyLimitUsd) {
    status = "exceeded";
  } else if (percent >= 90) {
    status = "critical";
  } else if (percent >= budget.alertAt) {
    status = "warning";
  } else {
    status = "ok";
  }

  return { percent, remaining, status };
}

export function isBudgetExceeded(budget: CostBudget): boolean {
  return budget.currentSpendUsd >= budget.monthlyLimitUsd;
}

export function shouldAlertBudget(budget: CostBudget): boolean {
  if (budget.monthlyLimitUsd <= 0) return false;
  const percent = (budget.currentSpendUsd / budget.monthlyLimitUsd) * 100;
  return percent >= budget.alertAt;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatCostUsd(amount: number): string {
  if (amount === 0) return "$0.00";

  // For very small amounts (less than $0.01), show more decimal places
  if (Math.abs(amount) < 0.01) {
    // Remove trailing zeros but keep at least 2 significant digits after $0.00
    const formatted = amount.toFixed(8).replace(/0+$/, "");
    return `$${formatted}`;
  }

  return `$${amount.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Trend analysis
// ---------------------------------------------------------------------------

export function computeCostTrend(dailyCosts: number[]): {
  trend: "up" | "down" | "stable";
  changePercent: number;
} {
  if (dailyCosts.length < 2) {
    return { trend: "stable", changePercent: 0 };
  }

  // Split into first half and second half
  const mid = Math.floor(dailyCosts.length / 2);
  const firstHalf = dailyCosts.slice(0, mid);
  const secondHalf = dailyCosts.slice(mid);

  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  if (avgFirst === 0) {
    if (avgSecond === 0) return { trend: "stable", changePercent: 0 };
    return { trend: "up", changePercent: 100 };
  }

  const changePercent = ((avgSecond - avgFirst) / avgFirst) * 100;

  let trend: "up" | "down" | "stable";
  if (Math.abs(changePercent) < 5) {
    trend = "stable";
  } else if (changePercent > 0) {
    trend = "up";
  } else {
    trend = "down";
  }

  return { trend, changePercent };
}

export function projectMonthlySpend(
  currentSpend: number,
  daysElapsed: number,
  totalDaysInMonth: number,
): number {
  if (daysElapsed <= 0) return 0;
  const dailyRate = currentSpend / daysElapsed;
  return dailyRate * totalDaysInMonth;
}
