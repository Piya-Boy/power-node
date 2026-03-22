/**
 * Phase 74 — Workflow Feature Flags
 * Pure utilities for defining, evaluating, and managing feature flags
 * with targeting rules, gradual rollouts, and override support.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type FlagType = "boolean" | "string" | "number" | "json";

export type RuleOperator =
  | "equals" | "not_equals"
  | "contains" | "not_contains"
  | "starts_with" | "ends_with"
  | "in" | "not_in"
  | "gt" | "gte" | "lt" | "lte"
  | "matches";       // regex

export interface TargetingRule {
  id: string;
  attribute: string;      // attribute path on EvaluationContext (e.g. "userId", "plan")
  operator: RuleOperator;
  value: unknown;         // comparison value
}

export interface FlagVariation<T = unknown> {
  id: string;
  value: T;
  weight?: number;        // 0–100 for percentage rollout
}

export interface FeatureFlag<T = unknown> {
  id: string;
  name: string;
  type: FlagType;
  enabled: boolean;
  defaultVariationId: string;
  variations: FlagVariation<T>[];
  rules: FlagRule[];
  rolloutPercent?: number;  // 0–100 global rollout (applied before rules)
  tags: string[];
  description?: string;
  archivedAt?: Date;
}

export interface FlagRule {
  id: string;
  variationId: string;    // which variation to serve if rule matches
  conditions: TargetingRule[];  // all conditions must match (AND)
  priority: number;       // lower = evaluated first
}

export interface EvaluationContext {
  userId?: string;
  anonymousId?: string;
  [key: string]: unknown;
}

export interface FlagEvaluation<T = unknown> {
  flagId: string;
  variationId: string;
  value: T;
  reason: "disabled" | "override" | "rule" | "rollout" | "default";
  ruleId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic Bucketing (stable hash → percent)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FNV-1a 32-bit hash of a string → returns 0–99 integer bucket.
 */
export function getBucket(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash % 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule Evaluation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a nested attribute value from an evaluation context using dot notation.
 */
export function getAttribute(ctx: EvaluationContext, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = ctx;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Evaluate a single targeting rule condition against a context.
 */
export function evaluateCondition(condition: TargetingRule, ctx: EvaluationContext): boolean {
  const actual = getAttribute(ctx, condition.attribute);
  const expected = condition.value;

  switch (condition.operator) {
    case "equals": return actual === expected;
    case "not_equals": return actual !== expected;
    case "contains":
      if (typeof actual === "string" && typeof expected === "string") {
        return actual.includes(expected);
      }
      return false;
    case "not_contains":
      if (typeof actual === "string" && typeof expected === "string") {
        return !actual.includes(expected);
      }
      return true;
    case "starts_with":
      return typeof actual === "string" && typeof expected === "string" && actual.startsWith(expected);
    case "ends_with":
      return typeof actual === "string" && typeof expected === "string" && actual.endsWith(expected);
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "not_in":
      return Array.isArray(expected) && !expected.includes(actual);
    case "gt":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "gte":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "lt":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "lte":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "matches":
      if (typeof actual === "string" && typeof expected === "string") {
        try { return new RegExp(expected).test(actual); } catch { return false; }
      }
      return false;
    default:
      return false;
  }
}

/**
 * Evaluate all conditions in a rule (AND logic).
 */
export function evaluateRule(rule: FlagRule, ctx: EvaluationContext): boolean {
  return rule.conditions.every((c) => evaluateCondition(c, ctx));
}

// ─────────────────────────────────────────────────────────────────────────────
// Flag Evaluation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a variation by ID from a flag.
 */
export function getVariation<T>(flag: FeatureFlag<T>, variationId: string): FlagVariation<T> | undefined {
  return flag.variations.find((v) => v.id === variationId);
}

/**
 * Get the default variation.
 */
export function getDefaultVariation<T>(flag: FeatureFlag<T>): FlagVariation<T> | undefined {
  return getVariation(flag, flag.defaultVariationId);
}

/**
 * Evaluate a feature flag for a given context and optional overrides.
 */
export function evaluateFlag<T>(
  flag: FeatureFlag<T>,
  ctx: EvaluationContext,
  overrides: Record<string, string> = {}   // flagId → variationId
): FlagEvaluation<T> {
  const defaultVariation = getDefaultVariation(flag)!;

  // Override
  if (overrides[flag.id]) {
    const overrideVariation = getVariation(flag, overrides[flag.id]);
    if (overrideVariation) {
      return { flagId: flag.id, variationId: overrideVariation.id, value: overrideVariation.value, reason: "override" };
    }
  }

  // Disabled flag
  if (!flag.enabled) {
    return { flagId: flag.id, variationId: defaultVariation.id, value: defaultVariation.value, reason: "disabled" };
  }

  // Global rollout check
  if (flag.rolloutPercent !== undefined && flag.rolloutPercent < 100) {
    const bucketKey = `${flag.id}:${ctx.userId ?? ctx.anonymousId ?? "anon"}`;
    const bucket = getBucket(bucketKey);
    if (bucket >= flag.rolloutPercent) {
      return { flagId: flag.id, variationId: defaultVariation.id, value: defaultVariation.value, reason: "default" };
    }
  }

  // Rules (sorted by priority)
  const sortedRules = [...flag.rules].sort((a, b) => a.priority - b.priority);
  for (const rule of sortedRules) {
    if (evaluateRule(rule, ctx)) {
      const variation = getVariation(flag, rule.variationId) ?? defaultVariation;
      return { flagId: flag.id, variationId: variation.id, value: variation.value, reason: "rule", ruleId: rule.id };
    }
  }

  // Rollout bucket → served (percent rollout within range)
  if (flag.rolloutPercent !== undefined) {
    return { flagId: flag.id, variationId: defaultVariation.id, value: defaultVariation.value, reason: "rollout" };
  }

  return { flagId: flag.id, variationId: defaultVariation.id, value: defaultVariation.value, reason: "default" };
}

/**
 * Evaluate multiple flags at once.
 */
export function evaluateAllFlags<T>(
  flags: FeatureFlag<T>[],
  ctx: EvaluationContext,
  overrides: Record<string, string> = {}
): Map<string, FlagEvaluation<T>> {
  const results = new Map<string, FlagEvaluation<T>>();
  for (const flag of flags) {
    results.set(flag.id, evaluateFlag(flag, ctx, overrides));
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Flag Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a simple boolean feature flag.
 */
export function createBooleanFlag(
  id: string,
  name: string,
  defaultEnabled: boolean,
  options: Partial<Pick<FeatureFlag<boolean>, "tags" | "description" | "rolloutPercent">> = {}
): FeatureFlag<boolean> {
  return {
    id,
    name,
    type: "boolean",
    enabled: true,
    defaultVariationId: defaultEnabled ? "on" : "off",
    variations: [
      { id: "on", value: true },
      { id: "off", value: false },
    ],
    rules: [],
    tags: options.tags ?? [],
    description: options.description,
    rolloutPercent: options.rolloutPercent,
  };
}

/**
 * Enable or disable a flag.
 */
export function toggleFlag<T>(flag: FeatureFlag<T>, enabled: boolean): FeatureFlag<T> {
  return { ...flag, enabled };
}

/**
 * Add a rule to a flag.
 */
export function addRule<T>(flag: FeatureFlag<T>, rule: FlagRule): FeatureFlag<T> {
  return { ...flag, rules: [...flag.rules, rule] };
}

/**
 * Remove a rule from a flag.
 */
export function removeRule<T>(flag: FeatureFlag<T>, ruleId: string): FeatureFlag<T> {
  return { ...flag, rules: flag.rules.filter((r) => r.id !== ruleId) };
}

/**
 * Set rollout percentage.
 */
export function setRollout<T>(flag: FeatureFlag<T>, percent: number): FeatureFlag<T> {
  return { ...flag, rolloutPercent: Math.max(0, Math.min(100, percent)) };
}

/**
 * Archive a flag (soft-disable with timestamp).
 */
export function archiveFlag<T>(flag: FeatureFlag<T>, at: Date = new Date()): FeatureFlag<T> {
  return { ...flag, enabled: false, archivedAt: at };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export interface FlagValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a feature flag configuration.
 */
export function validateFlag<T>(flag: FeatureFlag<T>): FlagValidationResult {
  const errors: string[] = [];

  if (!flag.id.trim()) errors.push("id is required");
  if (!flag.name.trim()) errors.push("name is required");
  if (flag.variations.length === 0) errors.push("flag must have at least one variation");

  const variationIds = new Set(flag.variations.map((v) => v.id));
  if (!variationIds.has(flag.defaultVariationId)) {
    errors.push(`defaultVariationId '${flag.defaultVariationId}' not found in variations`);
  }

  for (const rule of flag.rules) {
    if (!variationIds.has(rule.variationId)) {
      errors.push(`Rule '${rule.id}' references unknown variation '${rule.variationId}'`);
    }
    if (rule.conditions.length === 0) {
      errors.push(`Rule '${rule.id}' has no conditions`);
    }
  }

  if (flag.rolloutPercent !== undefined && (flag.rolloutPercent < 0 || flag.rolloutPercent > 100)) {
    errors.push("rolloutPercent must be 0–100");
  }

  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Statistics
// ─────────────────────────────────────────────────────────────────────────────

export interface FlagStats {
  totalFlags: number;
  enabledFlags: number;
  disabledFlags: number;
  archivedFlags: number;
  flagsWithRules: number;
  flagsWithRollout: number;
  byType: Record<FlagType, number>;
}

/**
 * Compute statistics across a set of feature flags.
 */
export function computeFlagStats<T>(flags: FeatureFlag<T>[]): FlagStats {
  const byType: Record<FlagType, number> = { boolean: 0, string: 0, number: 0, json: 0 };
  let enabledFlags = 0, disabledFlags = 0, archivedFlags = 0, flagsWithRules = 0, flagsWithRollout = 0;

  for (const flag of flags) {
    byType[flag.type]++;
    if (flag.archivedAt) archivedFlags++;
    if (flag.enabled) enabledFlags++;
    else disabledFlags++;
    if (flag.rules.length > 0) flagsWithRules++;
    if (flag.rolloutPercent !== undefined) flagsWithRollout++;
  }

  return {
    totalFlags: flags.length,
    enabledFlags,
    disabledFlags,
    archivedFlags,
    flagsWithRules,
    flagsWithRollout,
    byType,
  };
}
