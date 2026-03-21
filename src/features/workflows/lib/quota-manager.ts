/**
 * Phase 38 — Rate Limiting & Quota Management
 * Advanced quota management for execution limits, API usage, and plan enforcement.
 * Pure utility functions — no database or HTTP calls.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PlanTier = "free" | "starter" | "pro" | "enterprise";

export type QuotaResource =
  | "workflow_executions"     // executions per billing period
  | "active_workflows"        // maximum active workflows
  | "workflow_count"          // total workflow limit
  | "api_requests"            // API requests per hour
  | "webhook_calls"           // webhook invocations per day
  | "ai_tokens"               // AI token usage per billing period
  | "storage_mb"              // storage in MB
  | "team_members"            // number of team members
  | "custom_nodes";           // number of custom node definitions

export interface QuotaLimit {
  resource: QuotaResource;
  limit: number;            // -1 means unlimited
  period?: "hour" | "day" | "month" | "billing_period";
  softLimit?: number;       // warning threshold (e.g., 80% of limit)
}

export interface PlanQuotas {
  plan: PlanTier;
  quotas: QuotaLimit[];
}

export interface QuotaUsage {
  resource: QuotaResource;
  used: number;
  resetAt?: Date;         // when the counter resets
}

export interface QuotaCheckResult {
  allowed: boolean;
  resource: QuotaResource;
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  isAtSoftLimit: boolean;
  isAtHardLimit: boolean;
  resetAt?: Date;
  message?: string;
}

export interface QuotaViolation {
  resource: QuotaResource;
  used: number;
  limit: number;
  overage: number;
}

export interface UsageSummary {
  plan: PlanTier;
  resources: QuotaCheckResult[];
  violations: QuotaViolation[];
  nearingLimits: QuotaCheckResult[];
  overallHealthScore: number; // 0-100, higher = more quota remaining
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan Definitions
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_QUOTAS: Record<PlanTier, PlanQuotas> = {
  free: {
    plan: "free",
    quotas: [
      { resource: "workflow_executions", limit: 100, period: "month" },
      { resource: "active_workflows", limit: 3 },
      { resource: "workflow_count", limit: 5 },
      { resource: "api_requests", limit: 60, period: "hour" },
      { resource: "webhook_calls", limit: 100, period: "day" },
      { resource: "ai_tokens", limit: 10_000, period: "month" },
      { resource: "storage_mb", limit: 100 },
      { resource: "team_members", limit: 1 },
      { resource: "custom_nodes", limit: 0 },
    ],
  },
  starter: {
    plan: "starter",
    quotas: [
      { resource: "workflow_executions", limit: 2_500, period: "month", softLimit: 2_000 },
      { resource: "active_workflows", limit: 20 },
      { resource: "workflow_count", limit: 50 },
      { resource: "api_requests", limit: 600, period: "hour" },
      { resource: "webhook_calls", limit: 1_000, period: "day" },
      { resource: "ai_tokens", limit: 100_000, period: "month" },
      { resource: "storage_mb", limit: 1_024 },
      { resource: "team_members", limit: 5 },
      { resource: "custom_nodes", limit: 5 },
    ],
  },
  pro: {
    plan: "pro",
    quotas: [
      { resource: "workflow_executions", limit: 25_000, period: "month", softLimit: 20_000 },
      { resource: "active_workflows", limit: 200 },
      { resource: "workflow_count", limit: -1 },
      { resource: "api_requests", limit: 6_000, period: "hour" },
      { resource: "webhook_calls", limit: 10_000, period: "day" },
      { resource: "ai_tokens", limit: 1_000_000, period: "month" },
      { resource: "storage_mb", limit: 10_240 },
      { resource: "team_members", limit: 25 },
      { resource: "custom_nodes", limit: 50 },
    ],
  },
  enterprise: {
    plan: "enterprise",
    quotas: [
      { resource: "workflow_executions", limit: -1 },
      { resource: "active_workflows", limit: -1 },
      { resource: "workflow_count", limit: -1 },
      { resource: "api_requests", limit: -1 },
      { resource: "webhook_calls", limit: -1 },
      { resource: "ai_tokens", limit: -1 },
      { resource: "storage_mb", limit: -1 },
      { resource: "team_members", limit: -1 },
      { resource: "custom_nodes", limit: -1 },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Quota Lookup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the quota limit for a specific resource on a given plan.
 */
export function getQuotaLimit(plan: PlanTier, resource: QuotaResource): QuotaLimit | null {
  const planQuotas = PLAN_QUOTAS[plan];
  return planQuotas?.quotas.find((q) => q.resource === resource) ?? null;
}

/**
 * Check whether a plan has unlimited quota for a resource.
 */
export function isUnlimited(plan: PlanTier, resource: QuotaResource): boolean {
  const limit = getQuotaLimit(plan, resource);
  return limit?.limit === -1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Quota Checking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a resource usage is within quota.
 */
export function checkQuota(
  plan: PlanTier,
  usage: QuotaUsage
): QuotaCheckResult {
  const quotaLimit = getQuotaLimit(plan, usage.resource);

  if (!quotaLimit) {
    return {
      allowed: true,
      resource: usage.resource,
      used: usage.used,
      limit: -1,
      remaining: -1,
      percentUsed: 0,
      isAtSoftLimit: false,
      isAtHardLimit: false,
      resetAt: usage.resetAt,
      message: `No quota configured for ${usage.resource} on plan ${plan}`,
    };
  }

  const { limit, softLimit } = quotaLimit;

  if (limit === -1) {
    return {
      allowed: true,
      resource: usage.resource,
      used: usage.used,
      limit: -1,
      remaining: -1,
      percentUsed: 0,
      isAtSoftLimit: false,
      isAtHardLimit: false,
      resetAt: usage.resetAt,
    };
  }

  const remaining = Math.max(0, limit - usage.used);
  const percentUsed = limit > 0 ? Math.round((usage.used / limit) * 100) : 100;
  const isAtHardLimit = limit === 0 ? usage.used > 0 : usage.used >= limit;
  const isAtSoftLimit = softLimit != null
    ? usage.used >= softLimit && !isAtHardLimit
    : percentUsed >= 80 && !isAtHardLimit;

  let message: string | undefined;
  if (isAtHardLimit) {
    message = `${usage.resource} quota exceeded (${usage.used}/${limit})`;
  } else if (isAtSoftLimit) {
    message = `${usage.resource} approaching limit (${usage.used}/${limit}, ${percentUsed}% used)`;
  }

  return {
    allowed: !isAtHardLimit,
    resource: usage.resource,
    used: usage.used,
    limit,
    remaining,
    percentUsed,
    isAtSoftLimit,
    isAtHardLimit,
    resetAt: usage.resetAt,
    message,
  };
}

/**
 * Check multiple resource usages at once.
 */
export function checkMultipleQuotas(
  plan: PlanTier,
  usages: QuotaUsage[]
): QuotaCheckResult[] {
  return usages.map((usage) => checkQuota(plan, usage));
}

/**
 * Check if an increment would push usage over the quota limit.
 * Returns true if the action is allowed (would not exceed limit).
 */
export function canConsume(
  plan: PlanTier,
  resource: QuotaResource,
  currentUsed: number,
  increment = 1
): boolean {
  const quotaLimit = getQuotaLimit(plan, resource);
  if (!quotaLimit || quotaLimit.limit === -1) return true;
  return currentUsed + increment <= quotaLimit.limit;
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage Summary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a complete usage summary for a plan with all resource usages.
 */
export function buildUsageSummary(plan: PlanTier, usages: QuotaUsage[]): UsageSummary {
  const usageMap = new Map(usages.map((u) => [u.resource, u]));
  const planQuotas = PLAN_QUOTAS[plan].quotas;

  const resources = planQuotas.map((quota) => {
    const usage = usageMap.get(quota.resource) ?? { resource: quota.resource, used: 0 };
    return checkQuota(plan, usage);
  });

  const violations: QuotaViolation[] = resources
    .filter((r) => r.isAtHardLimit && r.limit !== -1)
    .map((r) => ({
      resource: r.resource,
      used: r.used,
      limit: r.limit,
      overage: r.used - r.limit,
    }));

  const nearingLimits = resources.filter((r) => r.isAtSoftLimit && !r.isAtHardLimit);

  // Health score: average of (100 - percentUsed) for limited resources
  const limited = resources.filter((r) => r.limit !== -1);
  const overallHealthScore = limited.length > 0
    ? Math.round(limited.reduce((sum, r) => sum + (100 - Math.min(100, r.percentUsed)), 0) / limited.length)
    : 100;

  return { plan, resources, violations, nearingLimits, overallHealthScore };
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan Comparison
// ─────────────────────────────────────────────────────────────────────────────

const PLAN_ORDER: PlanTier[] = ["free", "starter", "pro", "enterprise"];

/**
 * Compare two plan tiers. Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function comparePlans(a: PlanTier, b: PlanTier): number {
  return PLAN_ORDER.indexOf(a) - PLAN_ORDER.indexOf(b);
}

/**
 * Check if a plan is at least as good as a minimum required plan.
 */
export function meetsMinimumPlan(current: PlanTier, minimum: PlanTier): boolean {
  return comparePlans(current, minimum) >= 0;
}

/**
 * Get the next upgrade plan tier.
 */
export function getNextPlan(current: PlanTier): PlanTier | null {
  const idx = PLAN_ORDER.indexOf(current);
  if (idx === -1 || idx === PLAN_ORDER.length - 1) return null;
  return PLAN_ORDER[idx + 1];
}

/**
 * Get a list of resources where upgrading the plan would increase limits.
 */
export function getUpgradeImpact(
  currentPlan: PlanTier,
  targetPlan: PlanTier
): Array<{ resource: QuotaResource; current: number; upgraded: number }> {
  if (comparePlans(currentPlan, targetPlan) >= 0) return [];

  const currentQuotas = PLAN_QUOTAS[currentPlan].quotas;
  const targetQuotas = PLAN_QUOTAS[targetPlan].quotas;

  return currentQuotas
    .map((q) => {
      const upgraded = targetQuotas.find((t) => t.resource === q.resource);
      if (!upgraded) return null;
      if (q.limit === upgraded.limit) return null;
      return { resource: q.resource, current: q.limit, upgraded: upgraded.limit };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset Scheduling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate when a quota period resets based on the current time.
 */
export function getResetTime(
  period: NonNullable<QuotaLimit["period"]>,
  from = new Date()
): Date {
  const d = new Date(from);
  switch (period) {
    case "hour":
      d.setMinutes(0, 0, 0);
      d.setHours(d.getHours() + 1);
      return d;
    case "day":
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + 1);
      return d;
    case "month":
    case "billing_period":
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      d.setMonth(d.getMonth() + 1);
      return d;
  }
}

/**
 * Check if a usage entry needs to be reset (period has expired).
 */
export function isResetDue(usage: QuotaUsage, now = new Date()): boolean {
  if (!usage.resetAt) return false;
  return now >= usage.resetAt;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a quota result as a human-readable string.
 */
export function formatQuotaResult(result: QuotaCheckResult): string {
  if (result.limit === -1) return `${result.resource}: unlimited`;
  const status = result.isAtHardLimit ? "❌" : result.isAtSoftLimit ? "⚠️" : "✅";
  return `${status} ${result.resource}: ${result.used}/${result.limit} (${result.percentUsed}%)`;
}

/**
 * Format usage summary as a multi-line string.
 */
export function formatUsageSummary(summary: UsageSummary): string {
  const lines = [
    `Plan: ${summary.plan} | Health: ${summary.overallHealthScore}/100`,
    "Resources:",
    ...summary.resources.map((r) => `  ${formatQuotaResult(r)}`),
  ];
  if (summary.violations.length > 0) {
    lines.push("Violations:");
    summary.violations.forEach((v) =>
      lines.push(`  ❌ ${v.resource}: over by ${v.overage}`)
    );
  }
  if (summary.nearingLimits.length > 0) {
    lines.push("Nearing Limits:");
    summary.nearingLimits.forEach((r) =>
      lines.push(`  ⚠️ ${r.resource}: ${r.percentUsed}% used`)
    );
  }
  return lines.join("\n");
}
