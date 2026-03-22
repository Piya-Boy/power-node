/**
 * Phase 68 — Node Execution Context
 * Pure utilities for building, validating, merging, and querying
 * the execution context passed to each workflow node at runtime.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ContextScope = "global" | "workflow" | "node" | "trigger";

export type SecretResolutionStatus = "resolved" | "missing" | "redacted";

export interface NodeInput {
  nodeId: string;
  portId: string;
  data: unknown;
}

export interface SecretRef {
  key: string;
  value: string;
  status: SecretResolutionStatus;
}

export interface ExecutionMeta {
  executionId: string;
  workflowId: string;
  runNumber: number;
  triggeredBy: "manual" | "schedule" | "webhook" | "api" | "sub-workflow";
  startedAt: Date;
  timeoutAt?: Date;
  retryAttempt: number;       // 0 = first attempt
  isDryRun: boolean;
  tags: string[];
}

export interface NodeExecutionContext {
  meta: ExecutionMeta;
  nodeId: string;
  nodeType: string;
  inputs: NodeInput[];
  variables: Record<string, unknown>;   // scoped variable store
  secrets: SecretRef[];
  previousOutputs: Record<string, unknown>; // nodeId → output data
  scope: ContextScope;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create execution metadata with defaults.
 */
export function createMeta(
  overrides: Partial<ExecutionMeta> & Pick<ExecutionMeta, "executionId" | "workflowId">
): ExecutionMeta {
  return {
    runNumber: 1,
    triggeredBy: "manual",
    startedAt: new Date(),
    retryAttempt: 0,
    isDryRun: false,
    tags: [],
    ...overrides,
  };
}

/**
 * Build a node execution context.
 */
export function buildContext(
  meta: ExecutionMeta,
  nodeId: string,
  nodeType: string,
  overrides: Partial<Omit<NodeExecutionContext, "meta" | "nodeId" | "nodeType">> = {}
): NodeExecutionContext {
  return {
    meta,
    nodeId,
    nodeType,
    inputs: [],
    variables: {},
    secrets: [],
    previousOutputs: {},
    scope: "node",
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Input Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the data for a named input port. Returns undefined if not found.
 */
export function getInput(ctx: NodeExecutionContext, portId: string): unknown {
  return ctx.inputs.find((i) => i.portId === portId)?.data;
}

/**
 * Get all inputs from a specific upstream node.
 */
export function getInputsFromNode(ctx: NodeExecutionContext, nodeId: string): NodeInput[] {
  return ctx.inputs.filter((i) => i.nodeId === nodeId);
}

/**
 * Check if a required input port has data.
 */
export function hasInput(ctx: NodeExecutionContext, portId: string): boolean {
  return ctx.inputs.some((i) => i.portId === portId && i.data !== undefined && i.data !== null);
}

/**
 * Add an input to a context (returns new context, does not mutate).
 */
export function addInput(ctx: NodeExecutionContext, input: NodeInput): NodeExecutionContext {
  return { ...ctx, inputs: [...ctx.inputs, input] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Variable Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a variable value by key. Supports dot-notation path (e.g. "user.name").
 */
export function getVariable(ctx: NodeExecutionContext, key: string): unknown {
  const parts = key.split(".");
  let cur: unknown = ctx.variables;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Set a variable (shallow key only, returns new context).
 */
export function setVariable(
  ctx: NodeExecutionContext,
  key: string,
  value: unknown
): NodeExecutionContext {
  return { ...ctx, variables: { ...ctx.variables, [key]: value } };
}

/**
 * Merge multiple variable maps into a context (later maps win).
 */
export function mergeVariables(
  ctx: NodeExecutionContext,
  ...maps: Record<string, unknown>[]
): NodeExecutionContext {
  return { ...ctx, variables: Object.assign({}, ctx.variables, ...maps) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Secret Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a secret by key.
 */
export function getSecret(ctx: NodeExecutionContext, key: string): SecretRef | undefined {
  return ctx.secrets.find((s) => s.key === key);
}

/**
 * Get resolved secret value (or undefined if missing/redacted).
 */
export function getSecretValue(ctx: NodeExecutionContext, key: string): string | undefined {
  const ref = getSecret(ctx, key);
  if (!ref || ref.status !== "resolved") return undefined;
  return ref.value;
}

/**
 * Check if all required secrets are resolved.
 */
export function hasAllSecrets(ctx: NodeExecutionContext, keys: string[]): boolean {
  return keys.every((k) => {
    const ref = getSecret(ctx, k);
    return ref?.status === "resolved";
  });
}

/**
 * Add a secret ref to context.
 */
export function addSecret(ctx: NodeExecutionContext, secret: SecretRef): NodeExecutionContext {
  const secrets = ctx.secrets.filter((s) => s.key !== secret.key);
  return { ...ctx, secrets: [...secrets, secret] };
}

/**
 * Redact all secrets (for logging/serialization).
 */
export function redactSecrets(ctx: NodeExecutionContext): NodeExecutionContext {
  return {
    ...ctx,
    secrets: ctx.secrets.map((s) => ({ ...s, value: "***", status: "redacted" as const })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Previous Output Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get output from a previous node by its ID.
 */
export function getPreviousOutput(ctx: NodeExecutionContext, nodeId: string): unknown {
  return ctx.previousOutputs[nodeId];
}

/**
 * Set a previous node output.
 */
export function setPreviousOutput(
  ctx: NodeExecutionContext,
  nodeId: string,
  output: unknown
): NodeExecutionContext {
  return { ...ctx, previousOutputs: { ...ctx.previousOutputs, [nodeId]: output } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeout Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if the execution has timed out.
 */
export function isTimedOut(ctx: NodeExecutionContext, now: Date = new Date()): boolean {
  if (!ctx.meta.timeoutAt) return false;
  return now >= ctx.meta.timeoutAt;
}

/**
 * Get remaining time in ms before timeout. Returns Infinity if no timeout set.
 */
export function getRemainingTimeMs(ctx: NodeExecutionContext, now: Date = new Date()): number {
  if (!ctx.meta.timeoutAt) return Infinity;
  return Math.max(0, ctx.meta.timeoutAt.getTime() - now.getTime());
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export interface ContextValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a node execution context.
 */
export function validateContext(ctx: NodeExecutionContext): ContextValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!ctx.meta.executionId.trim()) errors.push("meta.executionId is required");
  if (!ctx.meta.workflowId.trim()) errors.push("meta.workflowId is required");
  if (!ctx.nodeId.trim()) errors.push("nodeId is required");
  if (!ctx.nodeType.trim()) errors.push("nodeType is required");
  if (ctx.meta.runNumber < 1) errors.push("meta.runNumber must be >= 1");
  if (ctx.meta.retryAttempt < 0) errors.push("meta.retryAttempt must be >= 0");

  const missingSecrets = ctx.secrets.filter((s) => s.status === "missing");
  if (missingSecrets.length > 0) {
    warnings.push(`${missingSecrets.length} secret(s) could not be resolved: ${missingSecrets.map((s) => s.key).join(", ")}`);
  }

  if (ctx.meta.timeoutAt && ctx.meta.timeoutAt <= ctx.meta.startedAt) {
    warnings.push("timeoutAt is not after startedAt");
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialization Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Produce a safe, loggable summary of the context (no secret values).
 */
export function summarizeContext(ctx: NodeExecutionContext): {
  executionId: string;
  workflowId: string;
  nodeId: string;
  nodeType: string;
  inputCount: number;
  variableCount: number;
  secretCount: number;
  missingSecrets: string[];
  retryAttempt: number;
  isDryRun: boolean;
  timedOut: boolean;
} {
  const missingSecrets = ctx.secrets
    .filter((s) => s.status === "missing")
    .map((s) => s.key);

  return {
    executionId: ctx.meta.executionId,
    workflowId: ctx.meta.workflowId,
    nodeId: ctx.nodeId,
    nodeType: ctx.nodeType,
    inputCount: ctx.inputs.length,
    variableCount: Object.keys(ctx.variables).length,
    secretCount: ctx.secrets.length,
    missingSecrets,
    retryAttempt: ctx.meta.retryAttempt,
    isDryRun: ctx.meta.isDryRun,
    timedOut: isTimedOut(ctx),
  };
}

/**
 * Clone a context with an updated node target (for passing to a sub-node).
 */
export function forkContext(
  ctx: NodeExecutionContext,
  nodeId: string,
  nodeType: string
): NodeExecutionContext {
  return {
    ...ctx,
    nodeId,
    nodeType,
    inputs: [],
    previousOutputs: {
      ...ctx.previousOutputs,
      [ctx.nodeId]: undefined, // do not forward current node's unfinalised output
    },
  };
}

/**
 * Merge two contexts — second context's variables, secrets, and previousOutputs win.
 */
export function mergeContexts(
  base: NodeExecutionContext,
  overlay: Partial<NodeExecutionContext>
): NodeExecutionContext {
  return {
    ...base,
    ...overlay,
    variables: { ...base.variables, ...overlay.variables },
    secrets: [
      ...base.secrets.filter((s) => !overlay.secrets?.some((o) => o.key === s.key)),
      ...(overlay.secrets ?? []),
    ],
    previousOutputs: { ...base.previousOutputs, ...overlay.previousOutputs },
    inputs: overlay.inputs ?? base.inputs,
  };
}
