/**
 * Phase 48 — Rate Limiter Engine
 * Pure utility functions for rate limiting (no DB/HTTP calls)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type RateLimitAlgorithm =
  | "fixed-window"
  | "sliding-window"
  | "token-bucket"
  | "leaky-bucket";

export type RateLimitScope =
  | "global"
  | "per-user"
  | "per-ip"
  | "per-workflow"
  | "per-api-key";

export interface RateLimitRule {
  id: string;
  name: string;
  algorithm: RateLimitAlgorithm;
  scope: RateLimitScope;
  limit: number;
  windowSeconds: number;
  burstLimit?: number; // for token bucket
  costPerRequest?: number; // default 1
  skipConditions?: string[]; // e.g. ["admin", "internal"]
  enabled: boolean;
}

export interface RateLimitState {
  ruleId: string;
  key: string;
  count: number;
  windowStart: Date;
  tokens?: number; // for token bucket
  lastRefill?: Date; // for token bucket
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
  rule: RateLimitRule;
  cost: number;
}

export interface RateLimitContext {
  userId?: string;
  ip?: string;
  workflowId?: string;
  apiKey?: string;
  roles?: string[];
  tags?: string[];
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Create a rate limit rule with defaults
 */
export function createRule(
  params: Partial<RateLimitRule> & Pick<RateLimitRule, "id" | "name" | "limit" | "windowSeconds">
): RateLimitRule {
  return {
    algorithm: "fixed-window",
    scope: "global",
    costPerRequest: 1,
    skipConditions: [],
    enabled: true,
    burstLimit: undefined,
    ...params,
  };
}

/**
 * Build a unique rate limit key based on scope + context
 * e.g. rl:per-user:user123:rule-id
 */
export function buildRateLimitKey(rule: RateLimitRule, context: RateLimitContext): string {
  const parts = ["rl", rule.scope];

  switch (rule.scope) {
    case "global":
      parts.push("global");
      break;
    case "per-user":
      parts.push(context.userId ?? "anonymous");
      break;
    case "per-ip":
      parts.push(context.ip ?? "unknown");
      break;
    case "per-workflow":
      parts.push(context.workflowId ?? "unknown");
      break;
    case "per-api-key":
      parts.push(context.apiKey ?? "unknown");
      break;
  }

  parts.push(rule.id);
  return parts.join(":");
}

/**
 * Fixed window rate limit check
 */
export function checkFixedWindow(
  rule: RateLimitRule,
  state: RateLimitState,
  now: Date = new Date()
): RateLimitResult {
  const cost = rule.costPerRequest ?? 1;
  const windowMs = rule.windowSeconds * 1000;
  const windowEnd = new Date(state.windowStart.getTime() + windowMs);

  // If outside the current window, effectively reset (count = 0)
  const inWindow = now.getTime() < windowEnd.getTime();
  const currentCount = inWindow ? state.count : 0;
  const resetAt = inWindow ? windowEnd : new Date(now.getTime() + windowMs);

  const allowed = currentCount + cost <= rule.limit;
  const remaining = Math.max(0, rule.limit - currentCount - (allowed ? cost : 0));
  const retryAfterSeconds = allowed
    ? 0
    : Math.ceil((resetAt.getTime() - now.getTime()) / 1000);

  return {
    allowed,
    remaining,
    resetAt,
    retryAfterSeconds,
    rule,
    cost,
  };
}

/**
 * Sliding window rate limit check using an array of request timestamps
 */
export function checkSlidingWindow(
  rule: RateLimitRule,
  requests: Date[],
  now: Date = new Date()
): RateLimitResult {
  const cost = rule.costPerRequest ?? 1;
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = new Date(now.getTime() - windowMs);

  // Count requests within the sliding window
  const inWindow = requests.filter((r) => r.getTime() > windowStart.getTime());
  const currentCount = inWindow.length;

  const allowed = currentCount + cost <= rule.limit;
  const remaining = Math.max(0, rule.limit - currentCount - (allowed ? cost : 0));

  // Reset at = oldest request in window + window duration
  const oldestInWindow = inWindow.length > 0
    ? new Date(Math.min(...inWindow.map((r) => r.getTime())))
    : now;
  const resetAt = new Date(oldestInWindow.getTime() + windowMs);

  const retryAfterSeconds = allowed
    ? 0
    : Math.ceil((resetAt.getTime() - now.getTime()) / 1000);

  return {
    allowed,
    remaining,
    resetAt,
    retryAfterSeconds,
    rule,
    cost,
  };
}

/**
 * Token bucket rate limit check with refill
 */
export function checkTokenBucket(
  rule: RateLimitRule,
  state: RateLimitState,
  now: Date = new Date()
): { result: RateLimitResult; newState: RateLimitState } {
  const cost = rule.costPerRequest ?? 1;
  const capacity = rule.burstLimit ?? rule.limit;
  const refillRate = rule.limit / rule.windowSeconds; // tokens per second

  // Calculate tokens added since last refill
  const lastRefill = state.lastRefill ?? state.windowStart;
  const secondsElapsed = (now.getTime() - lastRefill.getTime()) / 1000;
  const tokensToAdd = secondsElapsed * refillRate;

  const currentTokens = Math.min(
    capacity,
    (state.tokens ?? capacity) + tokensToAdd
  );

  const allowed = currentTokens >= cost;
  const newTokens = allowed ? currentTokens - cost : currentTokens;
  const remaining = Math.max(0, Math.floor(newTokens));

  // Calculate when enough tokens will be available
  const tokensNeeded = allowed ? 0 : cost - currentTokens;
  const secondsUntilRefill = tokensNeeded > 0 ? tokensNeeded / refillRate : 0;
  const resetAt = new Date(now.getTime() + secondsUntilRefill * 1000);

  const newState: RateLimitState = {
    ...state,
    tokens: newTokens,
    lastRefill: now,
    count: state.count + (allowed ? cost : 0),
  };

  const result: RateLimitResult = {
    allowed,
    remaining,
    resetAt,
    retryAfterSeconds: allowed ? 0 : Math.ceil(secondsUntilRefill),
    rule,
    cost,
  };

  return { result, newState };
}

/**
 * Consume tokens from a token bucket state
 */
export function consumeTokens(
  state: RateLimitState,
  rule: RateLimitRule,
  cost: number,
  now: Date = new Date()
): { allowed: boolean; newState: RateLimitState } {
  const capacity = rule.burstLimit ?? rule.limit;
  const refillRate = rule.limit / rule.windowSeconds;

  const lastRefill = state.lastRefill ?? state.windowStart;
  const secondsElapsed = (now.getTime() - lastRefill.getTime()) / 1000;
  const tokensToAdd = secondsElapsed * refillRate;
  const currentTokens = Math.min(capacity, (state.tokens ?? capacity) + tokensToAdd);

  const allowed = currentTokens >= cost;
  const newTokens = allowed ? currentTokens - cost : currentTokens;

  return {
    allowed,
    newState: {
      ...state,
      tokens: newTokens,
      lastRefill: now,
      count: state.count + (allowed ? cost : 0),
    },
  };
}

/**
 * Check if a request should bypass rate limiting
 */
export function shouldSkip(rule: RateLimitRule, context: RateLimitContext): boolean {
  if (!rule.enabled) return true;
  if (!rule.skipConditions || rule.skipConditions.length === 0) return false;

  const roles = context.roles ?? [];
  const tags = context.tags ?? [];
  const allConditions = [...roles, ...tags];

  return rule.skipConditions.some((condition) => allConditions.includes(condition));
}

/**
 * Get seconds until retry from a rate limit result
 */
export function getRetryAfter(result: RateLimitResult): number {
  if (result.allowed) return 0;
  return result.retryAfterSeconds;
}

/**
 * Format rate limit headers (X-RateLimit-*)
 */
export function formatRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.rule.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt.getTime() / 1000)),
    "X-RateLimit-Algorithm": result.rule.algorithm,
  };

  if (!result.allowed) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
    headers["X-RateLimit-Blocked"] = "true";
  }

  return headers;
}

/**
 * Merge two rate limit rules (override takes precedence for non-undefined values)
 */
export function mergeRules(base: RateLimitRule, override: Partial<RateLimitRule>): RateLimitRule {
  const merged = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }

  // Merge arrays specially
  if (override.skipConditions !== undefined) {
    const baseConditions = base.skipConditions ?? [];
    const overrideConditions = override.skipConditions ?? [];
    merged.skipConditions = [...new Set([...baseConditions, ...overrideConditions])];
  }

  return merged;
}

/**
 * Validate a rate limit rule
 */
export function validateRule(rule: RateLimitRule): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!rule.id || rule.id.trim() === "") {
    errors.push("id is required");
  }

  if (!rule.name || rule.name.trim() === "") {
    errors.push("name is required");
  }

  const validAlgorithms: RateLimitAlgorithm[] = [
    "fixed-window",
    "sliding-window",
    "token-bucket",
    "leaky-bucket",
  ];
  if (!validAlgorithms.includes(rule.algorithm)) {
    errors.push(`algorithm must be one of: ${validAlgorithms.join(", ")}`);
  }

  const validScopes: RateLimitScope[] = [
    "global",
    "per-user",
    "per-ip",
    "per-workflow",
    "per-api-key",
  ];
  if (!validScopes.includes(rule.scope)) {
    errors.push(`scope must be one of: ${validScopes.join(", ")}`);
  }

  if (typeof rule.limit !== "number" || rule.limit <= 0) {
    errors.push("limit must be a positive number");
  }

  if (typeof rule.windowSeconds !== "number" || rule.windowSeconds <= 0) {
    errors.push("windowSeconds must be a positive number");
  }

  if (rule.burstLimit !== undefined && rule.burstLimit < rule.limit) {
    errors.push("burstLimit must be >= limit");
  }

  if (rule.costPerRequest !== undefined && rule.costPerRequest <= 0) {
    errors.push("costPerRequest must be a positive number");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Compute statistics from an array of rate limit results
 */
export function computeRateLimitStats(results: RateLimitResult[]): {
  totalAllowed: number;
  totalBlocked: number;
  blockRate: number;
  avgRemaining: number;
} {
  if (results.length === 0) {
    return { totalAllowed: 0, totalBlocked: 0, blockRate: 0, avgRemaining: 0 };
  }

  const totalAllowed = results.filter((r) => r.allowed).length;
  const totalBlocked = results.filter((r) => !r.allowed).length;
  const blockRate = totalBlocked / results.length;
  const avgRemaining =
    results.reduce((sum, r) => sum + r.remaining, 0) / results.length;

  return { totalAllowed, totalBlocked, blockRate, avgRemaining };
}

/**
 * Get a human-readable summary of rate limit rules
 */
export function getRateLimitSummary(
  rules: RateLimitRule[]
): Array<{ rule: RateLimitRule; description: string }> {
  return rules.map((rule) => {
    const status = rule.enabled ? "enabled" : "disabled";
    const cost = rule.costPerRequest !== undefined && rule.costPerRequest !== 1
      ? ` (cost: ${rule.costPerRequest})`
      : "";
    const burst = rule.burstLimit ? `, burst: ${rule.burstLimit}` : "";
    const skip =
      rule.skipConditions && rule.skipConditions.length > 0
        ? `, skip: [${rule.skipConditions.join(", ")}]`
        : "";

    const description = `[${status}] ${rule.name}: ${rule.algorithm}, ${rule.scope}, ${rule.limit} req/${rule.windowSeconds}s${cost}${burst}${skip}`;

    return { rule, description };
  });
}
