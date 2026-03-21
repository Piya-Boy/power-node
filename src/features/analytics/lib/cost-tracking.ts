/**
 * Phase 29 — Advanced UX: Cost Tracking per workflow
 * Token/credit usage estimation and reporting.
 */

export type AiModel =
  | "gpt-4o"
  | "gpt-4o-mini"
  | "claude-opus-4-6"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5"
  | "gemini-1.5-pro"
  | "gemini-1.5-flash"
  | "ollama"; // local, no cost

export interface ModelPricing {
  inputPer1kTokens: number;  // USD
  outputPer1kTokens: number; // USD
}

export const MODEL_PRICING: Record<AiModel, ModelPricing> = {
  "gpt-4o":            { inputPer1kTokens: 0.005,  outputPer1kTokens: 0.015 },
  "gpt-4o-mini":       { inputPer1kTokens: 0.00015, outputPer1kTokens: 0.0006 },
  "claude-opus-4-6":   { inputPer1kTokens: 0.015,  outputPer1kTokens: 0.075 },
  "claude-sonnet-4-6": { inputPer1kTokens: 0.003,  outputPer1kTokens: 0.015 },
  "claude-haiku-4-5":  { inputPer1kTokens: 0.0008, outputPer1kTokens: 0.004 },
  "gemini-1.5-pro":    { inputPer1kTokens: 0.00125, outputPer1kTokens: 0.005 },
  "gemini-1.5-flash":  { inputPer1kTokens: 0.000075, outputPer1kTokens: 0.0003 },
  "ollama":            { inputPer1kTokens: 0,       outputPer1kTokens: 0 },
};

export interface TokenUsage {
  model: AiModel;
  inputTokens: number;
  outputTokens: number;
}

export interface NodeCost {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  tokenUsage?: TokenUsage;
  costUsd: number;
  httpRequests?: number;
}

export interface ExecutionCost {
  executionId: string;
  workflowId: string;
  nodeCosts: NodeCost[];
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  httpRequests: number;
}

export interface WorkflowCostSummary {
  workflowId: string;
  workflowName: string;
  totalExecutions: number;
  totalCostUsd: number;
  avgCostPerExecution: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  costByModel: Record<string, number>;
}

/**
 * Calculate the cost of a single AI model usage in USD.
 */
export function calculateTokenCost(usage: TokenUsage): number {
  const pricing = MODEL_PRICING[usage.model];
  if (!pricing) return 0;
  const inputCost = (usage.inputTokens / 1000) * pricing.inputPer1kTokens;
  const outputCost = (usage.outputTokens / 1000) * pricing.outputPer1kTokens;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal places
}

/**
 * Compute the total cost for an execution from its node costs.
 */
export function computeExecutionCost(
  executionId: string,
  workflowId: string,
  nodeCosts: NodeCost[]
): ExecutionCost {
  const totalCostUsd = nodeCosts.reduce((sum, n) => sum + n.costUsd, 0);
  const totalInputTokens = nodeCosts.reduce(
    (sum, n) => sum + (n.tokenUsage?.inputTokens ?? 0),
    0
  );
  const totalOutputTokens = nodeCosts.reduce(
    (sum, n) => sum + (n.tokenUsage?.outputTokens ?? 0),
    0
  );
  const httpRequests = nodeCosts.reduce((sum, n) => sum + (n.httpRequests ?? 0), 0);

  return {
    executionId,
    workflowId,
    nodeCosts,
    totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
    totalInputTokens,
    totalOutputTokens,
    httpRequests,
  };
}

/**
 * Aggregate execution costs for a workflow.
 */
export function summarizeWorkflowCosts(
  workflowId: string,
  workflowName: string,
  executions: ExecutionCost[]
): WorkflowCostSummary {
  const totalCostUsd = executions.reduce((sum, e) => sum + e.totalCostUsd, 0);
  const totalInputTokens = executions.reduce((sum, e) => sum + e.totalInputTokens, 0);
  const totalOutputTokens = executions.reduce((sum, e) => sum + e.totalOutputTokens, 0);

  const costByModel: Record<string, number> = {};
  for (const exec of executions) {
    for (const node of exec.nodeCosts) {
      if (node.tokenUsage) {
        const model = node.tokenUsage.model;
        costByModel[model] = (costByModel[model] ?? 0) + node.costUsd;
      }
    }
  }

  return {
    workflowId,
    workflowName,
    totalExecutions: executions.length,
    totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
    avgCostPerExecution: executions.length > 0
      ? Math.round((totalCostUsd / executions.length) * 1_000_000) / 1_000_000
      : 0,
    totalInputTokens,
    totalOutputTokens,
    costByModel,
  };
}

/**
 * Format a cost in USD to a human-readable string.
 */
export function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.001) return `$${usd.toFixed(6)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

/**
 * Get the top N most expensive workflows.
 */
export function getTopExpensiveWorkflows(
  summaries: WorkflowCostSummary[],
  limit = 5
): WorkflowCostSummary[] {
  return [...summaries]
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd)
    .slice(0, limit);
}

/**
 * Estimate token count from a string (rough approximation: ~4 chars/token).
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
