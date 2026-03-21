import { describe, it, expect } from "vitest";
import {
  createRule,
  buildRateLimitKey,
  checkFixedWindow,
  checkSlidingWindow,
  checkTokenBucket,
  consumeTokens,
  shouldSkip,
  getRetryAfter,
  formatRateLimitHeaders,
  mergeRules,
  validateRule,
  computeRateLimitStats,
  getRateLimitSummary,
  type RateLimitRule,
  type RateLimitState,
  type RateLimitContext,
} from "./rate-limiter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRule(overrides: Partial<RateLimitRule> = {}): RateLimitRule {
  return createRule({
    id: "rule-1",
    name: "Test Rule",
    limit: 10,
    windowSeconds: 60,
    ...overrides,
  });
}

function makeState(overrides: Partial<RateLimitState> = {}): RateLimitState {
  return {
    ruleId: "rule-1",
    key: "rl:global:global:rule-1",
    count: 0,
    windowStart: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

const baseTime = new Date("2024-01-01T00:00:30Z"); // 30s into window

// ─── createRule ───────────────────────────────────────────────────────────────

describe("createRule", () => {
  it("creates a rule with required fields", () => {
    const rule = createRule({ id: "r1", name: "R1", limit: 100, windowSeconds: 60 });
    expect(rule.id).toBe("r1");
    expect(rule.name).toBe("R1");
    expect(rule.limit).toBe(100);
    expect(rule.windowSeconds).toBe(60);
  });

  it("sets default algorithm to fixed-window", () => {
    const rule = makeRule();
    expect(rule.algorithm).toBe("fixed-window");
  });

  it("sets default scope to global", () => {
    const rule = makeRule();
    expect(rule.scope).toBe("global");
  });

  it("sets default costPerRequest to 1", () => {
    const rule = makeRule();
    expect(rule.costPerRequest).toBe(1);
  });

  it("sets default skipConditions to empty array", () => {
    const rule = makeRule();
    expect(rule.skipConditions).toEqual([]);
  });

  it("sets enabled to true by default", () => {
    const rule = makeRule();
    expect(rule.enabled).toBe(true);
  });

  it("respects overrides", () => {
    const rule = makeRule({
      algorithm: "token-bucket",
      scope: "per-user",
      costPerRequest: 5,
      burstLimit: 20,
    });
    expect(rule.algorithm).toBe("token-bucket");
    expect(rule.scope).toBe("per-user");
    expect(rule.costPerRequest).toBe(5);
    expect(rule.burstLimit).toBe(20);
  });
});

// ─── buildRateLimitKey ────────────────────────────────────────────────────────

describe("buildRateLimitKey", () => {
  it("builds a global key", () => {
    const rule = makeRule({ scope: "global" });
    const key = buildRateLimitKey(rule, {});
    expect(key).toBe("rl:global:global:rule-1");
  });

  it("builds a per-user key", () => {
    const rule = makeRule({ scope: "per-user" });
    const key = buildRateLimitKey(rule, { userId: "user123" });
    expect(key).toBe("rl:per-user:user123:rule-1");
  });

  it("builds a per-ip key", () => {
    const rule = makeRule({ scope: "per-ip" });
    const key = buildRateLimitKey(rule, { ip: "192.168.1.1" });
    expect(key).toBe("rl:per-ip:192.168.1.1:rule-1");
  });

  it("builds a per-workflow key", () => {
    const rule = makeRule({ scope: "per-workflow" });
    const key = buildRateLimitKey(rule, { workflowId: "wf-abc" });
    expect(key).toBe("rl:per-workflow:wf-abc:rule-1");
  });

  it("builds a per-api-key key", () => {
    const rule = makeRule({ scope: "per-api-key" });
    const key = buildRateLimitKey(rule, { apiKey: "sk-abc123" });
    expect(key).toBe("rl:per-api-key:sk-abc123:rule-1");
  });

  it("uses anonymous for missing userId", () => {
    const rule = makeRule({ scope: "per-user" });
    const key = buildRateLimitKey(rule, {});
    expect(key).toContain("anonymous");
  });

  it("includes rule id in key", () => {
    const rule = makeRule({ id: "my-rule", scope: "global" });
    const key = buildRateLimitKey(rule, {});
    expect(key).toContain("my-rule");
  });
});

// ─── checkFixedWindow ─────────────────────────────────────────────────────────

describe("checkFixedWindow", () => {
  it("allows when under limit", () => {
    const rule = makeRule({ limit: 10 });
    const state = makeState({ count: 5 });
    const result = checkFixedWindow(rule, state, baseTime);
    expect(result.allowed).toBe(true);
  });

  it("blocks when at limit", () => {
    const rule = makeRule({ limit: 10 });
    const state = makeState({ count: 10 });
    const result = checkFixedWindow(rule, state, baseTime);
    expect(result.allowed).toBe(false);
  });

  it("blocks when would exceed limit", () => {
    const rule = makeRule({ limit: 10, costPerRequest: 3 });
    const state = makeState({ count: 9 });
    const result = checkFixedWindow(rule, state, baseTime);
    expect(result.allowed).toBe(false);
  });

  it("returns correct remaining when allowed", () => {
    const rule = makeRule({ limit: 10 });
    const state = makeState({ count: 5 });
    const result = checkFixedWindow(rule, state, baseTime);
    expect(result.remaining).toBe(4); // 10 - 5 - 1 = 4
  });

  it("returns zero remaining when blocked", () => {
    const rule = makeRule({ limit: 10 });
    const state = makeState({ count: 10 });
    const result = checkFixedWindow(rule, state, baseTime);
    expect(result.remaining).toBe(0);
  });

  it("resets when outside window", () => {
    const rule = makeRule({ limit: 10, windowSeconds: 60 });
    const state = makeState({ count: 10, windowStart: new Date("2024-01-01T00:00:00Z") });
    // 2 minutes later — new window
    const future = new Date("2024-01-01T00:02:00Z");
    const result = checkFixedWindow(rule, state, future);
    expect(result.allowed).toBe(true);
  });

  it("returns resetAt in the future", () => {
    const rule = makeRule({ limit: 10, windowSeconds: 60 });
    const state = makeState({ count: 5 });
    const result = checkFixedWindow(rule, state, baseTime);
    expect(result.resetAt.getTime()).toBeGreaterThan(baseTime.getTime());
  });

  it("retryAfterSeconds is 0 when allowed", () => {
    const rule = makeRule({ limit: 10 });
    const state = makeState({ count: 3 });
    const result = checkFixedWindow(rule, state, baseTime);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("retryAfterSeconds > 0 when blocked", () => {
    const rule = makeRule({ limit: 10 });
    const state = makeState({ count: 10 });
    const result = checkFixedWindow(rule, state, baseTime);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });
});

// ─── checkSlidingWindow ───────────────────────────────────────────────────────

describe("checkSlidingWindow", () => {
  it("allows when no requests", () => {
    const rule = makeRule({ limit: 10 });
    const result = checkSlidingWindow(rule, [], baseTime);
    expect(result.allowed).toBe(true);
  });

  it("blocks when at limit within window", () => {
    const rule = makeRule({ limit: 5, windowSeconds: 60 });
    const now = new Date("2024-01-01T00:01:00Z");
    const requests = Array.from({ length: 5 }, (_, i) =>
      new Date(now.getTime() - i * 5000)
    );
    const result = checkSlidingWindow(rule, requests, now);
    expect(result.allowed).toBe(false);
  });

  it("ignores old requests outside window", () => {
    const rule = makeRule({ limit: 5, windowSeconds: 60 });
    const now = new Date("2024-01-01T00:02:00Z");
    // 5 old requests from 90s ago (outside 60s window)
    const requests = Array.from({ length: 5 }, (_, i) =>
      new Date(now.getTime() - 90000 - i * 1000)
    );
    const result = checkSlidingWindow(rule, requests, now);
    expect(result.allowed).toBe(true);
  });

  it("returns correct remaining", () => {
    const rule = makeRule({ limit: 10, windowSeconds: 60 });
    const now = new Date("2024-01-01T00:01:00Z");
    const requests = Array.from({ length: 3 }, (_, i) =>
      new Date(now.getTime() - i * 5000)
    );
    const result = checkSlidingWindow(rule, requests, now);
    expect(result.remaining).toBe(6); // 10 - 3 - 1
  });
});

// ─── checkTokenBucket ─────────────────────────────────────────────────────────

describe("checkTokenBucket", () => {
  it("allows when bucket has tokens", () => {
    const rule = makeRule({ limit: 10, windowSeconds: 60, burstLimit: 20 });
    const state = makeState({ tokens: 15, lastRefill: baseTime });
    const { result } = checkTokenBucket(rule, state, baseTime);
    expect(result.allowed).toBe(true);
  });

  it("blocks when bucket is empty", () => {
    const rule = makeRule({ limit: 10, windowSeconds: 60, burstLimit: 10 });
    const state = makeState({ tokens: 0, lastRefill: baseTime });
    const { result } = checkTokenBucket(rule, state, baseTime);
    expect(result.allowed).toBe(false);
  });

  it("refills tokens over time", () => {
    const rule = makeRule({ limit: 60, windowSeconds: 60, burstLimit: 60 }); // 1 token/sec
    const state = makeState({ tokens: 0, lastRefill: new Date("2024-01-01T00:00:00Z") });
    const later = new Date("2024-01-01T00:00:10Z"); // 10 seconds later
    const { result } = checkTokenBucket(rule, state, later);
    // Should have ~10 tokens refilled
    expect(result.allowed).toBe(true);
  });

  it("returns new state with reduced tokens", () => {
    const rule = makeRule({ limit: 10, windowSeconds: 60, burstLimit: 10 });
    const state = makeState({ tokens: 8, lastRefill: baseTime });
    const { newState } = checkTokenBucket(rule, state, baseTime);
    expect(newState.tokens).toBeLessThan(8);
  });

  it("does not exceed burst limit during refill", () => {
    const rule = makeRule({ limit: 10, windowSeconds: 60, burstLimit: 10 });
    const state = makeState({ tokens: 9, lastRefill: new Date("2024-01-01T00:00:00Z") });
    const much_later = new Date("2024-01-01T01:00:00Z");
    const { newState } = checkTokenBucket(rule, state, much_later);
    // Tokens after refill should not exceed burst limit
    expect(newState.tokens).toBeLessThanOrEqual(10);
  });
});

// ─── consumeTokens ────────────────────────────────────────────────────────────

describe("consumeTokens", () => {
  it("allows consumption when enough tokens", () => {
    const rule = makeRule({ limit: 10, windowSeconds: 60 });
    const state = makeState({ tokens: 5, lastRefill: baseTime });
    const { allowed } = consumeTokens(state, rule, 3, baseTime);
    expect(allowed).toBe(true);
  });

  it("denies consumption when insufficient tokens", () => {
    const rule = makeRule({ limit: 10, windowSeconds: 60 });
    const state = makeState({ tokens: 2, lastRefill: baseTime });
    const { allowed } = consumeTokens(state, rule, 5, baseTime);
    expect(allowed).toBe(false);
  });

  it("reduces token count on success", () => {
    const rule = makeRule({ limit: 10, windowSeconds: 60 });
    const state = makeState({ tokens: 10, lastRefill: baseTime });
    const { newState } = consumeTokens(state, rule, 3, baseTime);
    expect(newState.tokens).toBeLessThan(10);
  });

  it("updates lastRefill timestamp", () => {
    const rule = makeRule({ limit: 10, windowSeconds: 60 });
    const state = makeState({ tokens: 10, lastRefill: new Date("2024-01-01T00:00:00Z") });
    const { newState } = consumeTokens(state, rule, 1, baseTime);
    expect(newState.lastRefill).toEqual(baseTime);
  });
});

// ─── shouldSkip ───────────────────────────────────────────────────────────────

describe("shouldSkip", () => {
  it("skips when rule is disabled", () => {
    const rule = makeRule({ enabled: false });
    expect(shouldSkip(rule, {})).toBe(true);
  });

  it("does not skip when no conditions", () => {
    const rule = makeRule({ skipConditions: [] });
    expect(shouldSkip(rule, { roles: ["user"] })).toBe(false);
  });

  it("skips when role matches skipCondition", () => {
    const rule = makeRule({ skipConditions: ["admin"] });
    expect(shouldSkip(rule, { roles: ["admin"] })).toBe(true);
  });

  it("skips when tag matches skipCondition", () => {
    const rule = makeRule({ skipConditions: ["internal"] });
    expect(shouldSkip(rule, { tags: ["internal"] })).toBe(true);
  });

  it("does not skip when no matching conditions", () => {
    const rule = makeRule({ skipConditions: ["admin"] });
    expect(shouldSkip(rule, { roles: ["user"] })).toBe(false);
  });
});

// ─── getRetryAfter ────────────────────────────────────────────────────────────

describe("getRetryAfter", () => {
  it("returns 0 when allowed", () => {
    const rule = makeRule();
    const result = {
      allowed: true,
      remaining: 5,
      resetAt: new Date(),
      retryAfterSeconds: 0,
      rule,
      cost: 1,
    };
    expect(getRetryAfter(result)).toBe(0);
  });

  it("returns retryAfterSeconds when blocked", () => {
    const rule = makeRule();
    const result = {
      allowed: false,
      remaining: 0,
      resetAt: new Date(),
      retryAfterSeconds: 30,
      rule,
      cost: 1,
    };
    expect(getRetryAfter(result)).toBe(30);
  });
});

// ─── formatRateLimitHeaders ───────────────────────────────────────────────────

describe("formatRateLimitHeaders", () => {
  it("returns standard headers for allowed request", () => {
    const rule = makeRule({ limit: 100 });
    const result = {
      allowed: true,
      remaining: 99,
      resetAt: new Date("2024-01-01T01:00:00Z"),
      retryAfterSeconds: 0,
      rule,
      cost: 1,
    };
    const headers = formatRateLimitHeaders(result);
    expect(headers["X-RateLimit-Limit"]).toBe("100");
    expect(headers["X-RateLimit-Remaining"]).toBe("99");
    expect(headers["X-RateLimit-Algorithm"]).toBe("fixed-window");
  });

  it("includes Retry-After header when blocked", () => {
    const rule = makeRule();
    const result = {
      allowed: false,
      remaining: 0,
      resetAt: new Date("2024-01-01T01:00:00Z"),
      retryAfterSeconds: 30,
      rule,
      cost: 1,
    };
    const headers = formatRateLimitHeaders(result);
    expect(headers["Retry-After"]).toBe("30");
    expect(headers["X-RateLimit-Blocked"]).toBe("true");
  });

  it("does not include Retry-After when allowed", () => {
    const rule = makeRule();
    const result = {
      allowed: true,
      remaining: 5,
      resetAt: new Date(),
      retryAfterSeconds: 0,
      rule,
      cost: 1,
    };
    const headers = formatRateLimitHeaders(result);
    expect(headers["Retry-After"]).toBeUndefined();
  });

  it("includes X-RateLimit-Reset as unix timestamp", () => {
    const rule = makeRule();
    const resetAt = new Date("2024-01-01T01:00:00Z");
    const result = {
      allowed: true,
      remaining: 5,
      resetAt,
      retryAfterSeconds: 0,
      rule,
      cost: 1,
    };
    const headers = formatRateLimitHeaders(result);
    expect(headers["X-RateLimit-Reset"]).toBe(String(Math.floor(resetAt.getTime() / 1000)));
  });
});

// ─── mergeRules ───────────────────────────────────────────────────────────────

describe("mergeRules", () => {
  it("base rule values are preserved when not overridden", () => {
    const base = makeRule({ limit: 100, windowSeconds: 60 });
    const merged = mergeRules(base, {});
    expect(merged.limit).toBe(100);
    expect(merged.windowSeconds).toBe(60);
  });

  it("override takes precedence", () => {
    const base = makeRule({ limit: 100 });
    const merged = mergeRules(base, { limit: 200 });
    expect(merged.limit).toBe(200);
  });

  it("merges skip conditions without duplicates", () => {
    const base = makeRule({ skipConditions: ["admin"] });
    const merged = mergeRules(base, { skipConditions: ["internal", "admin"] });
    expect(merged.skipConditions).toHaveLength(2);
    expect(merged.skipConditions).toContain("admin");
    expect(merged.skipConditions).toContain("internal");
  });

  it("preserves base id and name if not overridden", () => {
    const base = makeRule({ id: "original", name: "Original" });
    const merged = mergeRules(base, { limit: 50 });
    expect(merged.id).toBe("original");
    expect(merged.name).toBe("Original");
  });
});

// ─── validateRule ─────────────────────────────────────────────────────────────

describe("validateRule", () => {
  it("returns valid for a correct rule", () => {
    const rule = makeRule();
    const { valid, errors } = validateRule(rule);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it("errors on missing id", () => {
    const rule = makeRule({ id: "" });
    const { valid, errors } = validateRule(rule);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("id"))).toBe(true);
  });

  it("errors on missing name", () => {
    const rule = makeRule({ name: "" });
    const { valid, errors } = validateRule(rule);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("errors on invalid algorithm", () => {
    const rule = makeRule({ algorithm: "invalid" as never });
    const { valid, errors } = validateRule(rule);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("algorithm"))).toBe(true);
  });

  it("errors on invalid scope", () => {
    const rule = makeRule({ scope: "invalid" as never });
    const { valid, errors } = validateRule(rule);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("scope"))).toBe(true);
  });

  it("errors on zero limit", () => {
    const rule = makeRule({ limit: 0 });
    const { valid, errors } = validateRule(rule);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("limit"))).toBe(true);
  });

  it("errors on zero windowSeconds", () => {
    const rule = makeRule({ windowSeconds: 0 });
    const { valid, errors } = validateRule(rule);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("windowSeconds"))).toBe(true);
  });

  it("errors when burstLimit < limit", () => {
    const rule = makeRule({ limit: 10, burstLimit: 5 });
    const { valid, errors } = validateRule(rule);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("burstLimit"))).toBe(true);
  });

  it("errors on negative costPerRequest", () => {
    const rule = makeRule({ costPerRequest: -1 });
    const { valid, errors } = validateRule(rule);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("costPerRequest"))).toBe(true);
  });
});

// ─── computeRateLimitStats ────────────────────────────────────────────────────

describe("computeRateLimitStats", () => {
  function makeResult(allowed: boolean, remaining = 0): import("./rate-limiter").RateLimitResult {
    return {
      allowed,
      remaining,
      resetAt: new Date(),
      retryAfterSeconds: allowed ? 0 : 30,
      rule: makeRule(),
      cost: 1,
    };
  }

  it("returns zeros for empty results", () => {
    const stats = computeRateLimitStats([]);
    expect(stats.totalAllowed).toBe(0);
    expect(stats.totalBlocked).toBe(0);
    expect(stats.blockRate).toBe(0);
    expect(stats.avgRemaining).toBe(0);
  });

  it("counts allowed and blocked correctly", () => {
    const results = [makeResult(true, 5), makeResult(true, 3), makeResult(false, 0)];
    const stats = computeRateLimitStats(results);
    expect(stats.totalAllowed).toBe(2);
    expect(stats.totalBlocked).toBe(1);
  });

  it("computes block rate correctly", () => {
    const results = [makeResult(true), makeResult(false), makeResult(false)];
    const stats = computeRateLimitStats(results);
    expect(stats.blockRate).toBeCloseTo(2 / 3);
  });

  it("computes avg remaining correctly", () => {
    const results = [makeResult(true, 9), makeResult(true, 5), makeResult(false, 0)];
    const stats = computeRateLimitStats(results);
    expect(stats.avgRemaining).toBeCloseTo((9 + 5 + 0) / 3);
  });
});

// ─── getRateLimitSummary ──────────────────────────────────────────────────────

describe("getRateLimitSummary", () => {
  it("returns one entry per rule", () => {
    const rules = [makeRule({ id: "r1", name: "R1" }), makeRule({ id: "r2", name: "R2" })];
    const summary = getRateLimitSummary(rules);
    expect(summary).toHaveLength(2);
  });

  it("description includes rule name", () => {
    const rules = [makeRule({ name: "My Rule" })];
    const summary = getRateLimitSummary(rules);
    expect(summary[0].description).toContain("My Rule");
  });

  it("description mentions enabled/disabled status", () => {
    const rules = [makeRule({ enabled: false })];
    const summary = getRateLimitSummary(rules);
    expect(summary[0].description).toContain("disabled");
  });

  it("description mentions algorithm", () => {
    const rules = [makeRule({ algorithm: "token-bucket" })];
    const summary = getRateLimitSummary(rules);
    expect(summary[0].description).toContain("token-bucket");
  });

  it("description mentions skip conditions when present", () => {
    const rules = [makeRule({ skipConditions: ["admin", "internal"] })];
    const summary = getRateLimitSummary(rules);
    expect(summary[0].description).toContain("admin");
  });

  it("returns empty array for no rules", () => {
    expect(getRateLimitSummary([])).toHaveLength(0);
  });
});
