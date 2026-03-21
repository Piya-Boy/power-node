import { describe, it, expect } from "vitest";
import {
  createNodeCostConfig,
  calculateNodeCost,
  applyFreeTier,
  estimateWorkflowCost,
  compareNodeCosts,
  createBudget,
  updateBudgetSpend,
  getBudgetStatus,
  isBudgetExceeded,
  shouldAlertBudget,
  formatCostUsd,
  computeCostTrend,
  projectMonthlySpend,
  type NodeCostConfig,
  type CostBudget,
} from "./cost-estimator";

// ---------------------------------------------------------------------------
// createNodeCostConfig
// ---------------------------------------------------------------------------
describe("createNodeCostConfig", () => {
  it("creates config with required fields", () => {
    const cfg = createNodeCostConfig({ nodeType: "http-request" });
    expect(cfg.nodeType).toBe("http-request");
    expect(cfg.model).toBe("per-execution");
    expect(cfg.baseCostUsd).toBe(0);
  });

  it("accepts overrides", () => {
    const cfg = createNodeCostConfig({
      nodeType: "openai",
      model: "per-second",
      baseCostUsd: 0.002,
      provider: "openai",
      freeTierLimit: 1000,
    });
    expect(cfg.model).toBe("per-second");
    expect(cfg.baseCostUsd).toBe(0.002);
    expect(cfg.provider).toBe("openai");
    expect(cfg.freeTierLimit).toBe(1000);
  });

  it("sets custom formula", () => {
    const cfg = createNodeCostConfig({
      nodeType: "custom-node",
      model: "custom",
      baseCostUsd: 0.005,
      customFormula: "complex pricing",
    });
    expect(cfg.customFormula).toBe("complex pricing");
  });

  it("defaults optional fields to undefined", () => {
    const cfg = createNodeCostConfig({ nodeType: "email-send" });
    expect(cfg.freeTierLimit).toBeUndefined();
    expect(cfg.customFormula).toBeUndefined();
    expect(cfg.provider).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// calculateNodeCost
// ---------------------------------------------------------------------------
describe("calculateNodeCost", () => {
  it("returns 0 for free model", () => {
    const cfg = createNodeCostConfig({ nodeType: "webhook", model: "free", baseCostUsd: 0 });
    expect(calculateNodeCost(cfg, 1000)).toBe(0);
  });

  it("calculates per-execution cost", () => {
    const cfg = createNodeCostConfig({ nodeType: "http", model: "per-execution", baseCostUsd: 0.01 });
    expect(calculateNodeCost(cfg, 100)).toBe(1);
  });

  it("calculates per-second cost with duration", () => {
    const cfg = createNodeCostConfig({ nodeType: "ai", model: "per-second", baseCostUsd: 0.001 });
    expect(calculateNodeCost(cfg, 100, 5)).toBeCloseTo(0.5);
  });

  it("uses default duration of 1 for per-second", () => {
    const cfg = createNodeCostConfig({ nodeType: "ai", model: "per-second", baseCostUsd: 0.001 });
    expect(calculateNodeCost(cfg, 10)).toBeCloseTo(0.01);
  });

  it("calculates per-item cost", () => {
    const cfg = createNodeCostConfig({ nodeType: "email", model: "per-item", baseCostUsd: 0.0001 });
    expect(calculateNodeCost(cfg, 500)).toBeCloseTo(0.05);
  });

  it("calculates custom model as per-execution", () => {
    const cfg = createNodeCostConfig({ nodeType: "custom", model: "custom", baseCostUsd: 0.05 });
    expect(calculateNodeCost(cfg, 10)).toBeCloseTo(0.5);
  });

  it("returns 0 when executions <= 0", () => {
    const cfg = createNodeCostConfig({ nodeType: "http", model: "per-execution", baseCostUsd: 0.01 });
    expect(calculateNodeCost(cfg, 0)).toBe(0);
    expect(calculateNodeCost(cfg, -5)).toBe(0);
  });

  it("handles zero base cost", () => {
    const cfg = createNodeCostConfig({ nodeType: "noop", model: "per-execution", baseCostUsd: 0 });
    expect(calculateNodeCost(cfg, 1000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// applyFreeTier
// ---------------------------------------------------------------------------
describe("applyFreeTier", () => {
  it("returns all executions as billable when no free tier", () => {
    const cfg = createNodeCostConfig({ nodeType: "http", model: "per-execution", baseCostUsd: 0.01 });
    const result = applyFreeTier(cfg, 100);
    expect(result.billableExecutions).toBe(100);
    expect(result.freeTierSavings).toBe(0);
  });

  it("applies free tier fully when within limit", () => {
    const cfg = createNodeCostConfig({
      nodeType: "openai",
      model: "per-execution",
      baseCostUsd: 0.01,
      freeTierLimit: 500,
    });
    const result = applyFreeTier(cfg, 200);
    expect(result.billableExecutions).toBe(0);
    expect(result.freeTierSavings).toBeCloseTo(2.0);
  });

  it("applies partial free tier when executions exceed limit", () => {
    const cfg = createNodeCostConfig({
      nodeType: "openai",
      model: "per-execution",
      baseCostUsd: 0.01,
      freeTierLimit: 100,
    });
    const result = applyFreeTier(cfg, 300);
    expect(result.billableExecutions).toBe(200);
    expect(result.freeTierSavings).toBeCloseTo(1.0);
  });

  it("accounts for already used free executions", () => {
    const cfg = createNodeCostConfig({
      nodeType: "openai",
      model: "per-execution",
      baseCostUsd: 0.01,
      freeTierLimit: 100,
    });
    const result = applyFreeTier(cfg, 100, 80); // 20 remaining free
    expect(result.billableExecutions).toBe(80);
    expect(result.freeTierSavings).toBeCloseTo(0.2);
  });

  it("all executions billable when free tier fully consumed", () => {
    const cfg = createNodeCostConfig({
      nodeType: "openai",
      model: "per-execution",
      baseCostUsd: 0.01,
      freeTierLimit: 100,
    });
    const result = applyFreeTier(cfg, 50, 100);
    expect(result.billableExecutions).toBe(50);
    expect(result.freeTierSavings).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// estimateWorkflowCost
// ---------------------------------------------------------------------------
describe("estimateWorkflowCost", () => {
  const nodeConfigs: Record<string, NodeCostConfig> = {
    webhook: createNodeCostConfig({ nodeType: "webhook", model: "free", baseCostUsd: 0 }),
    "http-request": createNodeCostConfig({
      nodeType: "http-request",
      model: "per-execution",
      baseCostUsd: 0.001,
    }),
    openai: createNodeCostConfig({
      nodeType: "openai",
      model: "per-execution",
      baseCostUsd: 0.01,
      freeTierLimit: 100,
    }),
  };

  it("estimates cost for simple workflow", () => {
    const estimate = estimateWorkflowCost({
      workflowId: "wf-1",
      nodes: [
        { id: "n1", type: "webhook" },
        { id: "n2", type: "http-request" },
      ],
      nodeConfigs,
      executionsPerMonth: 1000,
    });
    expect(estimate.workflowId).toBe("wf-1");
    expect(estimate.estimatedMonthlyUsd).toBeCloseTo(1.0); // 1000 * 0.001
    expect(estimate.nodeBreakdown).toHaveLength(2);
  });

  it("applies free tier in estimate", () => {
    const estimate = estimateWorkflowCost({
      workflowId: "wf-2",
      nodes: [{ id: "n1", type: "openai" }],
      nodeConfigs,
      executionsPerMonth: 200,
    });
    // 200 executions, 100 free => 100 billable * $0.01 = $1.00
    expect(estimate.estimatedMonthlyUsd).toBeCloseTo(1.0);
    expect(estimate.nodeBreakdown[0].freeTierSavingsUsd).toBeCloseTo(1.0);
  });

  it("has high confidence when all nodes have configs", () => {
    const estimate = estimateWorkflowCost({
      workflowId: "wf-3",
      nodes: [{ id: "n1", type: "webhook" }],
      nodeConfigs,
      executionsPerMonth: 100,
    });
    expect(estimate.confidence).toBe("high");
  });

  it("has low confidence when few nodes have configs", () => {
    const estimate = estimateWorkflowCost({
      workflowId: "wf-4",
      nodes: [
        { id: "n1", type: "webhook" },
        { id: "n2", type: "unknown-a" },
        { id: "n3", type: "unknown-b" },
        { id: "n4", type: "unknown-c" },
        { id: "n5", type: "unknown-d" },
      ],
      nodeConfigs,
      executionsPerMonth: 100,
    });
    expect(estimate.confidence).toBe("low");
  });

  it("includes assumptions in the estimate", () => {
    const estimate = estimateWorkflowCost({
      workflowId: "wf-5",
      nodes: [{ id: "n1", type: "http-request" }],
      nodeConfigs,
      executionsPerMonth: 500,
      avgDurationSeconds: 3,
    });
    expect(estimate.assumptions.some((a) => a.includes("duration"))).toBe(true);
    expect(estimate.assumptions.some((a) => a.includes("500"))).toBe(true);
  });

  it("handles empty node list", () => {
    const estimate = estimateWorkflowCost({
      workflowId: "wf-6",
      nodes: [],
      nodeConfigs,
      executionsPerMonth: 100,
    });
    expect(estimate.estimatedMonthlyUsd).toBe(0);
    expect(estimate.nodeBreakdown).toHaveLength(0);
  });

  it("mentions unknown node types in assumptions", () => {
    const estimate = estimateWorkflowCost({
      workflowId: "wf-7",
      nodes: [{ id: "n1", type: "mystery-node" }],
      nodeConfigs,
      executionsPerMonth: 100,
    });
    expect(estimate.assumptions.some((a) => a.includes("no cost config"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// compareNodeCosts
// ---------------------------------------------------------------------------
describe("compareNodeCosts", () => {
  it("ranks configs by total cost descending", () => {
    const configs: NodeCostConfig[] = [
      createNodeCostConfig({ nodeType: "cheap", model: "per-execution", baseCostUsd: 0.001 }),
      createNodeCostConfig({ nodeType: "expensive", model: "per-execution", baseCostUsd: 0.1 }),
      createNodeCostConfig({ nodeType: "medium", model: "per-execution", baseCostUsd: 0.01 }),
    ];
    const result = compareNodeCosts(configs, 100);
    expect(result[0].nodeType).toBe("expensive");
    expect(result[0].rank).toBe(1);
    expect(result[1].nodeType).toBe("medium");
    expect(result[2].nodeType).toBe("cheap");
  });

  it("handles free nodes (rank last)", () => {
    const configs: NodeCostConfig[] = [
      createNodeCostConfig({ nodeType: "paid", model: "per-execution", baseCostUsd: 0.01 }),
      createNodeCostConfig({ nodeType: "free", model: "free", baseCostUsd: 0 }),
    ];
    const result = compareNodeCosts(configs, 100);
    expect(result[0].nodeType).toBe("paid");
    expect(result[1].totalCost).toBe(0);
  });

  it("returns correct total costs", () => {
    const configs: NodeCostConfig[] = [
      createNodeCostConfig({ nodeType: "node", model: "per-execution", baseCostUsd: 0.005 }),
    ];
    const result = compareNodeCosts(configs, 200);
    expect(result[0].totalCost).toBeCloseTo(1.0);
  });
});

// ---------------------------------------------------------------------------
// createBudget / updateBudgetSpend
// ---------------------------------------------------------------------------
describe("createBudget", () => {
  it("creates budget with defaults", () => {
    const budget = createBudget({
      id: "budget-1",
      monthlyLimitUsd: 100,
      alertAt: 80,
      periodStart: new Date("2026-03-01"),
      periodEnd: new Date("2026-03-31"),
    });
    expect(budget.currentSpendUsd).toBe(0);
    expect(budget.monthlyLimitUsd).toBe(100);
    expect(budget.alertAt).toBe(80);
  });

  it("creates workflow-scoped budget", () => {
    const budget = createBudget({
      id: "budget-2",
      workflowId: "wf-abc",
      monthlyLimitUsd: 50,
      alertAt: 70,
      periodStart: new Date("2026-03-01"),
      periodEnd: new Date("2026-03-31"),
    });
    expect(budget.workflowId).toBe("wf-abc");
  });
});

describe("updateBudgetSpend", () => {
  it("increments spend correctly", () => {
    const budget = createBudget({
      id: "b1",
      monthlyLimitUsd: 100,
      alertAt: 80,
      currentSpendUsd: 20,
      periodStart: new Date("2026-03-01"),
      periodEnd: new Date("2026-03-31"),
    });
    const updated = updateBudgetSpend(budget, 15);
    expect(updated.currentSpendUsd).toBe(35);
  });

  it("does not mutate original budget", () => {
    const budget = createBudget({
      id: "b1",
      monthlyLimitUsd: 100,
      alertAt: 80,
      currentSpendUsd: 10,
      periodStart: new Date(),
      periodEnd: new Date(),
    });
    updateBudgetSpend(budget, 5);
    expect(budget.currentSpendUsd).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// getBudgetStatus
// ---------------------------------------------------------------------------
describe("getBudgetStatus", () => {
  it("returns ok status under alert threshold", () => {
    const budget = createBudget({
      id: "b1",
      monthlyLimitUsd: 100,
      alertAt: 80,
      currentSpendUsd: 50,
      periodStart: new Date(),
      periodEnd: new Date(),
    });
    const status = getBudgetStatus(budget);
    expect(status.status).toBe("ok");
    expect(status.percent).toBeCloseTo(50);
    expect(status.remaining).toBeCloseTo(50);
  });

  it("returns warning when at alert threshold", () => {
    const budget = createBudget({
      id: "b1",
      monthlyLimitUsd: 100,
      alertAt: 80,
      currentSpendUsd: 85,
      periodStart: new Date(),
      periodEnd: new Date(),
    });
    expect(getBudgetStatus(budget).status).toBe("warning");
  });

  it("returns critical when >= 90%", () => {
    const budget = createBudget({
      id: "b1",
      monthlyLimitUsd: 100,
      alertAt: 80,
      currentSpendUsd: 92,
      periodStart: new Date(),
      periodEnd: new Date(),
    });
    expect(getBudgetStatus(budget).status).toBe("critical");
  });

  it("returns exceeded when at or over limit", () => {
    const budget = createBudget({
      id: "b1",
      monthlyLimitUsd: 100,
      alertAt: 80,
      currentSpendUsd: 100,
      periodStart: new Date(),
      periodEnd: new Date(),
    });
    expect(getBudgetStatus(budget).status).toBe("exceeded");
  });

  it("returns 0 remaining when exceeded", () => {
    const budget = createBudget({
      id: "b1",
      monthlyLimitUsd: 100,
      alertAt: 80,
      currentSpendUsd: 150,
      periodStart: new Date(),
      periodEnd: new Date(),
    });
    const { remaining } = getBudgetStatus(budget);
    expect(remaining).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isBudgetExceeded / shouldAlertBudget
// ---------------------------------------------------------------------------
describe("isBudgetExceeded", () => {
  it("returns false when under limit", () => {
    const budget = createBudget({
      id: "b",
      monthlyLimitUsd: 100,
      alertAt: 80,
      currentSpendUsd: 99,
      periodStart: new Date(),
      periodEnd: new Date(),
    });
    expect(isBudgetExceeded(budget)).toBe(false);
  });

  it("returns true when exactly at limit", () => {
    const budget = createBudget({
      id: "b",
      monthlyLimitUsd: 100,
      alertAt: 80,
      currentSpendUsd: 100,
      periodStart: new Date(),
      periodEnd: new Date(),
    });
    expect(isBudgetExceeded(budget)).toBe(true);
  });

  it("returns true when over limit", () => {
    const budget = createBudget({
      id: "b",
      monthlyLimitUsd: 100,
      alertAt: 80,
      currentSpendUsd: 120,
      periodStart: new Date(),
      periodEnd: new Date(),
    });
    expect(isBudgetExceeded(budget)).toBe(true);
  });
});

describe("shouldAlertBudget", () => {
  it("returns false when below alertAt threshold", () => {
    const budget = createBudget({
      id: "b",
      monthlyLimitUsd: 100,
      alertAt: 80,
      currentSpendUsd: 70,
      periodStart: new Date(),
      periodEnd: new Date(),
    });
    expect(shouldAlertBudget(budget)).toBe(false);
  });

  it("returns true when at alertAt threshold", () => {
    const budget = createBudget({
      id: "b",
      monthlyLimitUsd: 100,
      alertAt: 80,
      currentSpendUsd: 80,
      periodStart: new Date(),
      periodEnd: new Date(),
    });
    expect(shouldAlertBudget(budget)).toBe(true);
  });

  it("returns true when exceeding alertAt threshold", () => {
    const budget = createBudget({
      id: "b",
      monthlyLimitUsd: 100,
      alertAt: 80,
      currentSpendUsd: 95,
      periodStart: new Date(),
      periodEnd: new Date(),
    });
    expect(shouldAlertBudget(budget)).toBe(true);
  });

  it("returns false when monthlyLimitUsd is 0", () => {
    const budget = createBudget({
      id: "b",
      monthlyLimitUsd: 0,
      alertAt: 80,
      currentSpendUsd: 10,
      periodStart: new Date(),
      periodEnd: new Date(),
    });
    expect(shouldAlertBudget(budget)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatCostUsd
// ---------------------------------------------------------------------------
describe("formatCostUsd", () => {
  it("formats zero", () => {
    expect(formatCostUsd(0)).toBe("$0.00");
  });

  it("formats whole dollars", () => {
    expect(formatCostUsd(12.34)).toBe("$12.34");
  });

  it("formats small amounts with more decimal places", () => {
    const result = formatCostUsd(0.00123);
    expect(result).toMatch(/^\$/);
    expect(result).toContain("0.00123");
  });

  it("formats sub-cent amounts", () => {
    const result = formatCostUsd(0.0000001);
    expect(result).toMatch(/^\$0\.000000/);
  });

  it("formats large amounts", () => {
    expect(formatCostUsd(1234.56)).toBe("$1234.56");
  });
});

// ---------------------------------------------------------------------------
// computeCostTrend
// ---------------------------------------------------------------------------
describe("computeCostTrend", () => {
  it("returns stable for empty array", () => {
    const result = computeCostTrend([]);
    expect(result.trend).toBe("stable");
    expect(result.changePercent).toBe(0);
  });

  it("returns stable for single element", () => {
    const result = computeCostTrend([10]);
    expect(result.trend).toBe("stable");
  });

  it("detects upward trend", () => {
    const result = computeCostTrend([10, 10, 10, 20, 20, 20]);
    expect(result.trend).toBe("up");
    expect(result.changePercent).toBeGreaterThan(0);
  });

  it("detects downward trend", () => {
    const result = computeCostTrend([20, 20, 20, 10, 10, 10]);
    expect(result.trend).toBe("down");
    expect(result.changePercent).toBeLessThan(0);
  });

  it("returns stable when change < 5%", () => {
    const result = computeCostTrend([100, 100, 100, 103, 103, 103]);
    expect(result.trend).toBe("stable");
  });

  it("handles all zero costs", () => {
    const result = computeCostTrend([0, 0, 0, 0]);
    expect(result.trend).toBe("stable");
    expect(result.changePercent).toBe(0);
  });

  it("handles growth from zero", () => {
    const result = computeCostTrend([0, 0, 5, 5]);
    expect(result.trend).toBe("up");
  });
});

// ---------------------------------------------------------------------------
// projectMonthlySpend
// ---------------------------------------------------------------------------
describe("projectMonthlySpend", () => {
  it("projects spend for rest of month", () => {
    // 10 days elapsed, $50 spent => $5/day => $155 for 31-day month
    const projection = projectMonthlySpend(50, 10, 31);
    expect(projection).toBeCloseTo(155);
  });

  it("returns 0 when daysElapsed is 0", () => {
    expect(projectMonthlySpend(100, 0, 30)).toBe(0);
  });

  it("extrapolates for standard month", () => {
    // 15 days, $30 => $2/day => $60 for 30-day month
    const projection = projectMonthlySpend(30, 15, 30);
    expect(projection).toBeCloseTo(60);
  });

  it("handles negative spend (returns negative projection)", () => {
    // Defensive: math still works with negative input, just returns a negative projection
    const result = projectMonthlySpend(-10, 10, 30);
    expect(result).toBeLessThan(0);
  });

  it("projects accurately at month end", () => {
    const projection = projectMonthlySpend(90, 30, 30);
    expect(projection).toBeCloseTo(90);
  });
});
