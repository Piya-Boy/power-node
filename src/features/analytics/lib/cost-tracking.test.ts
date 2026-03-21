import { describe, it, expect } from "vitest";
import {
  calculateTokenCost,
  computeExecutionCost,
  summarizeWorkflowCosts,
  formatCost,
  getTopExpensiveWorkflows,
  estimateTokenCount,
  MODEL_PRICING,
  type TokenUsage,
  type NodeCost,
  type ExecutionCost,
} from "./cost-tracking";

describe("calculateTokenCost", () => {
  it("calculates cost for gpt-4o", () => {
    const usage: TokenUsage = { model: "gpt-4o", inputTokens: 1000, outputTokens: 500 };
    const cost = calculateTokenCost(usage);
    // 1000/1000 * 0.005 + 500/1000 * 0.015 = 0.005 + 0.0075 = 0.0125
    expect(cost).toBeCloseTo(0.0125, 5);
  });

  it("returns 0 for ollama (local model)", () => {
    const usage: TokenUsage = { model: "ollama", inputTokens: 10000, outputTokens: 5000 };
    expect(calculateTokenCost(usage)).toBe(0);
  });

  it("calculates cost for claude-haiku (cheapest)", () => {
    const usage: TokenUsage = { model: "claude-haiku-4-5", inputTokens: 1000, outputTokens: 1000 };
    const cost = calculateTokenCost(usage);
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.01);
  });

  it("calculates cost for claude-opus (expensive)", () => {
    const usage: TokenUsage = { model: "claude-opus-4-6", inputTokens: 1000, outputTokens: 1000 };
    const cost = calculateTokenCost(usage);
    // 1 * 0.015 + 1 * 0.075 = 0.09
    expect(cost).toBeCloseTo(0.09, 4);
  });

  it("opus costs more than haiku for same tokens", () => {
    const haiku = calculateTokenCost({ model: "claude-haiku-4-5", inputTokens: 1000, outputTokens: 1000 });
    const opus = calculateTokenCost({ model: "claude-opus-4-6", inputTokens: 1000, outputTokens: 1000 });
    expect(opus).toBeGreaterThan(haiku);
  });
});

describe("computeExecutionCost", () => {
  const nodeCosts: NodeCost[] = [
    {
      nodeId: "n1",
      nodeName: "OpenAI Node",
      nodeType: "OPENAI",
      tokenUsage: { model: "gpt-4o-mini", inputTokens: 500, outputTokens: 200 },
      costUsd: calculateTokenCost({ model: "gpt-4o-mini", inputTokens: 500, outputTokens: 200 }),
      httpRequests: 1,
    },
    {
      nodeId: "n2",
      nodeName: "HTTP Node",
      nodeType: "HTTP_REQUEST",
      costUsd: 0,
      httpRequests: 2,
    },
  ];

  it("sums up total cost", () => {
    const exec = computeExecutionCost("exec-1", "wf-1", nodeCosts);
    expect(exec.totalCostUsd).toBeGreaterThanOrEqual(0);
  });

  it("sums up http requests", () => {
    const exec = computeExecutionCost("exec-1", "wf-1", nodeCosts);
    expect(exec.httpRequests).toBe(3);
  });

  it("sums token counts", () => {
    const exec = computeExecutionCost("exec-1", "wf-1", nodeCosts);
    expect(exec.totalInputTokens).toBe(500);
    expect(exec.totalOutputTokens).toBe(200);
  });
});

describe("summarizeWorkflowCosts", () => {
  const makeExec = (id: string, costUsd: number, model: "gpt-4o" | "gpt-4o-mini" = "gpt-4o"): ExecutionCost => ({
    executionId: id,
    workflowId: "wf-1",
    nodeCosts: [{
      nodeId: "n1",
      nodeName: "AI",
      nodeType: "OPENAI",
      tokenUsage: { model, inputTokens: 100, outputTokens: 50 },
      costUsd,
    }],
    totalCostUsd: costUsd,
    totalInputTokens: 100,
    totalOutputTokens: 50,
    httpRequests: 0,
  });

  it("aggregates executions correctly", () => {
    const execs = [makeExec("e1", 0.01), makeExec("e2", 0.02)];
    const summary = summarizeWorkflowCosts("wf-1", "My WF", execs);
    expect(summary.totalExecutions).toBe(2);
    expect(summary.totalCostUsd).toBeCloseTo(0.03, 5);
    expect(summary.avgCostPerExecution).toBeCloseTo(0.015, 5);
  });

  it("tracks cost by model", () => {
    const execs = [makeExec("e1", 0.01, "gpt-4o"), makeExec("e2", 0.005, "gpt-4o-mini")];
    const summary = summarizeWorkflowCosts("wf-1", "My WF", execs);
    expect(summary.costByModel["gpt-4o"]).toBeCloseTo(0.01, 5);
    expect(summary.costByModel["gpt-4o-mini"]).toBeCloseTo(0.005, 5);
  });

  it("handles empty executions", () => {
    const summary = summarizeWorkflowCosts("wf-1", "My WF", []);
    expect(summary.totalCostUsd).toBe(0);
    expect(summary.avgCostPerExecution).toBe(0);
  });
});

describe("formatCost", () => {
  it("formats zero", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("formats small amounts with more decimals", () => {
    expect(formatCost(0.0001)).toContain("$0.000");
  });

  it("formats normal amounts with 2 decimals", () => {
    expect(formatCost(1.5)).toBe("$1.50");
    expect(formatCost(100)).toBe("$100.00");
  });
});

describe("getTopExpensiveWorkflows", () => {
  const makeWfSummary = (id: string, cost: number) => ({
    workflowId: id,
    workflowName: `WF ${id}`,
    totalExecutions: 10,
    totalCostUsd: cost,
    avgCostPerExecution: cost / 10,
    totalInputTokens: 1000,
    totalOutputTokens: 500,
    costByModel: {},
  });

  it("returns top N by cost", () => {
    const summaries = [
      makeWfSummary("1", 5.0),
      makeWfSummary("2", 1.0),
      makeWfSummary("3", 10.0),
      makeWfSummary("4", 2.0),
    ];
    const top = getTopExpensiveWorkflows(summaries, 2);
    expect(top).toHaveLength(2);
    expect(top[0].workflowId).toBe("3"); // highest cost
    expect(top[1].workflowId).toBe("1");
  });

  it("returns all if fewer than limit", () => {
    const summaries = [makeWfSummary("1", 1.0)];
    expect(getTopExpensiveWorkflows(summaries, 5)).toHaveLength(1);
  });
});

describe("estimateTokenCount", () => {
  it("estimates tokens from text length", () => {
    const text = "a".repeat(400); // 400 chars / 4 = 100 tokens
    expect(estimateTokenCount(text)).toBe(100);
  });

  it("returns at least 1 for non-empty strings", () => {
    expect(estimateTokenCount("hi")).toBeGreaterThan(0);
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokenCount("")).toBe(0);
  });
});

describe("MODEL_PRICING", () => {
  it("has pricing for all major models", () => {
    const models = ["gpt-4o", "gpt-4o-mini", "claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"];
    for (const model of models) {
      expect(MODEL_PRICING[model as keyof typeof MODEL_PRICING]).toBeDefined();
    }
  });

  it("ollama has zero cost", () => {
    expect(MODEL_PRICING.ollama.inputPer1kTokens).toBe(0);
    expect(MODEL_PRICING.ollama.outputPer1kTokens).toBe(0);
  });
});
