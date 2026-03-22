import { describe, it, expect } from "vitest";
import {
  computeDelay,
  shouldRetry,
  createRetryState,
  startAttempt,
  recordSuccess,
  recordFailure,
  markExhausted,
  getAttemptCount,
  getLastAttempt,
  getTotalDuration,
  hasSucceeded,
  isExhausted,
  getRemainingAttempts,
  validatePolicy,
  computeRetryStats,
  mergePolicy,
  summarizeRetryState,
  DEFAULT_POLICIES,
  type RetryPolicy,
  type AttemptRecord,
} from "./retry-policy";

const NOW = 1_700_000_000_000;

// ─────────────────────────────────────────────────────────────────────────────
// computeDelay
// ─────────────────────────────────────────────────────────────────────────────

describe("computeDelay", () => {
  const fixed: RetryPolicy = { maxAttempts: 5, backoff: "fixed", baseDelayMs: 1000, maxDelayMs: 10000, conditions: ["on_error"] };
  const linear: RetryPolicy = { ...fixed, backoff: "linear" };
  const exp: RetryPolicy = { ...fixed, backoff: "exponential" };
  const jitter: RetryPolicy = { ...fixed, backoff: "jitter" };

  it("fixed always returns baseDelayMs", () => {
    expect(computeDelay(fixed, 1)).toBe(1000);
    expect(computeDelay(fixed, 3)).toBe(1000);
  });

  it("linear scales with attempt", () => {
    expect(computeDelay(linear, 2)).toBe(2000);
    expect(computeDelay(linear, 4)).toBe(4000);
  });

  it("exponential doubles each attempt", () => {
    expect(computeDelay(exp, 1)).toBe(1000);
    expect(computeDelay(exp, 2)).toBe(2000);
    expect(computeDelay(exp, 3)).toBe(4000);
  });

  it("jitter adds randomFactor", () => {
    const d = computeDelay(jitter, 1, 0.5);
    expect(d).toBeGreaterThan(1000);
  });

  it("caps at maxDelayMs", () => {
    const policy: RetryPolicy = { ...exp, baseDelayMs: 5000, maxDelayMs: 8000 };
    expect(computeDelay(policy, 3)).toBe(8000); // 5000*4=20000 capped at 8000
  });

  it("applies jitterFactor", () => {
    const policy: RetryPolicy = { ...fixed, jitterFactor: 0.1 };
    const d = computeDelay(policy, 1, 1.0);
    expect(d).toBeGreaterThan(1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// shouldRetry
// ─────────────────────────────────────────────────────────────────────────────

describe("shouldRetry", () => {
  const policy = DEFAULT_POLICIES.simple_retry;
  const baseState = createRetryState("p1", "n1", "e1");
  const failedAttempt: AttemptRecord = { attempt: 1, startedAt: NOW, finishedAt: NOW + 100, durationMs: 100, success: false, error: "oops" };
  const successAttempt: AttemptRecord = { ...failedAttempt, success: true };

  it("allows retry on failure", () => {
    const state = { ...baseState, attempts: [failedAttempt] };
    const { shouldRetry: yes } = shouldRetry(state, policy, failedAttempt);
    expect(yes).toBe(true);
  });

  it("does not retry on success", () => {
    const state = { ...baseState, attempts: [successAttempt] };
    expect(shouldRetry(state, policy, successAttempt).shouldRetry).toBe(false);
  });

  it("stops when maxAttempts reached", () => {
    const attempts = [failedAttempt, failedAttempt, failedAttempt];
    const state = { ...baseState, attempts };
    expect(shouldRetry(state, policy, failedAttempt).shouldRetry).toBe(false);
    expect(shouldRetry(state, policy, failedAttempt).reason).toBe("max_attempts_reached");
  });

  it("never retries on never policy", () => {
    // no_retry has maxAttempts=1; use a policy with more attempts but never condition
    const neverPolicy: RetryPolicy = { ...DEFAULT_POLICIES.simple_retry, conditions: ["never"] };
    const state = { ...baseState, attempts: [failedAttempt] };
    expect(shouldRetry(state, neverPolicy, failedAttempt).shouldRetry).toBe(false);
    expect(shouldRetry(state, neverPolicy, failedAttempt).reason).toBe("policy_never_retry");
  });

  it("respects noRetryOn HTTP status", () => {
    const p: RetryPolicy = { ...policy, noRetryOn: [400] };
    const attempt: AttemptRecord = { ...failedAttempt, httpStatus: 400 };
    const state = { ...baseState, attempts: [attempt] };
    expect(shouldRetry(state, p, attempt).shouldRetry).toBe(false);
    expect(shouldRetry(state, p, attempt).reason).toBe("no_retry_on_status");
  });

  it("respects retryOn whitelist", () => {
    const p: RetryPolicy = { ...policy, retryOn: [503] };
    const attempt: AttemptRecord = { ...failedAttempt, httpStatus: 500 };
    const state = { ...baseState, attempts: [attempt] };
    expect(shouldRetry(state, p, attempt).shouldRetry).toBe(false);
  });

  it("on_timeout condition fires on TIMEOUT errorCode", () => {
    const p = DEFAULT_POLICIES.exponential_backoff;
    const attempt: AttemptRecord = { ...failedAttempt, errorCode: "TIMEOUT" };
    const state = { ...baseState, attempts: [attempt] };
    expect(shouldRetry(state, p, attempt).shouldRetry).toBe(true);
  });

  it("on_rate_limit fires on 429", () => {
    const p = DEFAULT_POLICIES.rate_limit_retry;
    const attempt: AttemptRecord = { ...failedAttempt, httpStatus: 429 };
    const state = { ...baseState, attempts: [attempt] };
    expect(shouldRetry(state, p, attempt).shouldRetry).toBe(true);
  });

  it("condition_not_met when wrong error type", () => {
    const p: RetryPolicy = { ...policy, conditions: ["on_timeout"] };
    const attempt: AttemptRecord = { ...failedAttempt, errorCode: "OTHER" };
    const state = { ...baseState, attempts: [attempt] };
    expect(shouldRetry(state, p, attempt).reason).toBe("condition_not_met");
  });

  it("returns delayMs > 0 when retrying", () => {
    const state = { ...baseState, attempts: [failedAttempt] };
    const { delayMs } = shouldRetry(state, policy, failedAttempt);
    expect(delayMs).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// State Management
// ─────────────────────────────────────────────────────────────────────────────

describe("createRetryState", () => {
  it("creates pending state", () => {
    const s = createRetryState("p", "n", "e");
    expect(s.status).toBe("pending");
    expect(s.attempts).toHaveLength(0);
    expect(s.totalDelayMs).toBe(0);
  });
});

describe("startAttempt", () => {
  it("adds attempt and sets running", () => {
    const s = startAttempt(createRetryState("p", "n", "e"), NOW);
    expect(s.status).toBe("running");
    expect(s.attempts).toHaveLength(1);
    expect(s.attempts[0].attempt).toBe(1);
    expect(s.attempts[0].startedAt).toBe(NOW);
  });

  it("increments attempt number", () => {
    let s = createRetryState("p", "n", "e");
    s = startAttempt(s, NOW);
    s = recordFailure(s, NOW + 100, "err");
    s = startAttempt(s, NOW + 200);
    expect(s.attempts[1].attempt).toBe(2);
  });
});

describe("recordSuccess", () => {
  it("sets succeeded and durationMs", () => {
    let s = startAttempt(createRetryState("p", "n", "e"), NOW);
    s = recordSuccess(s, NOW + 500);
    expect(s.status).toBe("succeeded");
    expect(s.attempts[0].success).toBe(true);
    expect(s.attempts[0].durationMs).toBe(500);
  });
});

describe("recordFailure", () => {
  it("sets failed with error and updates totalDelayMs", () => {
    let s = startAttempt(createRetryState("p", "n", "e"), NOW);
    s = recordFailure(s, NOW + 200, "Network error", { httpStatus: 503, nextDelayMs: 1000 });
    expect(s.status).toBe("failed");
    expect(s.attempts[0].error).toBe("Network error");
    expect(s.attempts[0].httpStatus).toBe(503);
    expect(s.totalDelayMs).toBe(1000);
  });
});

describe("markExhausted", () => {
  it("sets exhausted status", () => {
    const s = markExhausted(createRetryState("p", "n", "e"));
    expect(s.status).toBe("exhausted");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

describe("query helpers", () => {
  it("getAttemptCount", () => {
    let s = createRetryState("p", "n", "e");
    s = startAttempt(s, NOW);
    expect(getAttemptCount(s)).toBe(1);
  });

  it("getLastAttempt returns last", () => {
    let s = createRetryState("p", "n", "e");
    s = startAttempt(s, NOW);
    s = recordFailure(s, NOW + 100, "err");
    s = startAttempt(s, NOW + 200);
    expect(getLastAttempt(s)?.attempt).toBe(2);
  });

  it("getTotalDuration sums durations", () => {
    let s = createRetryState("p", "n", "e");
    s = startAttempt(s, NOW);
    s = recordFailure(s, NOW + 300, "e1");
    s = startAttempt(s, NOW + 400);
    s = recordSuccess(s, NOW + 900);
    expect(getTotalDuration(s)).toBe(800); // 300 + 500
  });

  it("hasSucceeded", () => {
    let s = startAttempt(createRetryState("p", "n", "e"), NOW);
    s = recordSuccess(s, NOW + 100);
    expect(hasSucceeded(s)).toBe(true);
  });

  it("isExhausted", () => {
    expect(isExhausted(markExhausted(createRetryState("p", "n", "e")))).toBe(true);
  });

  it("getRemainingAttempts", () => {
    const policy = DEFAULT_POLICIES.simple_retry; // maxAttempts=3
    let s = createRetryState("p", "n", "e");
    expect(getRemainingAttempts(s, policy)).toBe(3);
    s = startAttempt(s, NOW);
    s = recordFailure(s, NOW + 100, "e");
    expect(getRemainingAttempts(s, policy)).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validatePolicy
// ─────────────────────────────────────────────────────────────────────────────

describe("validatePolicy", () => {
  it("valid policy passes", () => {
    expect(validatePolicy(DEFAULT_POLICIES.simple_retry).valid).toBe(true);
  });

  it("invalid maxAttempts < 1", () => {
    const result = validatePolicy({ ...DEFAULT_POLICIES.simple_retry, maxAttempts: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("maxAttempts must be >= 1");
  });

  it("invalid negative baseDelayMs", () => {
    const result = validatePolicy({ ...DEFAULT_POLICIES.simple_retry, baseDelayMs: -1 });
    expect(result.valid).toBe(false);
  });

  it("invalid jitterFactor out of range", () => {
    const result = validatePolicy({ ...DEFAULT_POLICIES.simple_retry, jitterFactor: 2 });
    expect(result.valid).toBe(false);
  });

  it("warns when maxDelayMs < baseDelayMs", () => {
    const result = validatePolicy({ ...DEFAULT_POLICIES.simple_retry, maxDelayMs: 100, baseDelayMs: 500 });
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("warns when maxAttempts > 20", () => {
    const result = validatePolicy({ ...DEFAULT_POLICIES.simple_retry, maxAttempts: 25 });
    expect(result.warnings.some((w) => w.includes("20"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeRetryStats
// ─────────────────────────────────────────────────────────────────────────────

describe("computeRetryStats", () => {
  it("empty returns zeros", () => {
    expect(computeRetryStats([]).successCount).toBe(0);
  });

  it("counts success, failure, exhausted", () => {
    let s1 = startAttempt(createRetryState("p", "n", "e1"), NOW);
    s1 = recordSuccess(s1, NOW + 100);
    let s2 = startAttempt(createRetryState("p", "n", "e2"), NOW);
    s2 = recordFailure(s2, NOW + 100, "err");
    let s3 = markExhausted(createRetryState("p", "n", "e3"));
    const stats = computeRetryStats([s1, s2, s3]);
    expect(stats.successCount).toBe(1);
    expect(stats.failureCount).toBe(1);
    expect(stats.exhaustedCount).toBe(1);
  });

  it("computes successRate", () => {
    let s1 = startAttempt(createRetryState("p", "n", "e1"), NOW);
    s1 = recordSuccess(s1, NOW + 100);
    let s2 = startAttempt(createRetryState("p", "n", "e2"), NOW);
    s2 = recordFailure(s2, NOW + 100, "err");
    expect(computeRetryStats([s1, s2]).successRate).toBe(0.5);
  });

  it("computes averageAttemptsPerExecution", () => {
    let s1 = createRetryState("p", "n", "e1");
    s1 = startAttempt(s1, NOW);
    s1 = recordFailure(s1, NOW + 100, "e");
    s1 = startAttempt(s1, NOW + 200);
    s1 = recordSuccess(s1, NOW + 300);
    let s2 = startAttempt(createRetryState("p", "n", "e2"), NOW);
    s2 = recordSuccess(s2, NOW + 100);
    // s1=2 attempts, s2=1 attempt => avg=1.5
    expect(computeRetryStats([s1, s2]).averageAttemptsPerExecution).toBe(1.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mergePolicy + summarizeRetryState
// ─────────────────────────────────────────────────────────────────────────────

describe("mergePolicy", () => {
  it("overrides fields", () => {
    const merged = mergePolicy(DEFAULT_POLICIES.simple_retry, { maxAttempts: 10 });
    expect(merged.maxAttempts).toBe(10);
    expect(merged.backoff).toBe("fixed");
  });
});

describe("summarizeRetryState", () => {
  it("succeeded", () => {
    let s = startAttempt(createRetryState("p", "n", "e"), NOW);
    s = recordSuccess(s, NOW + 100);
    expect(summarizeRetryState(s)).toContain("succeeded");
  });

  it("exhausted", () => {
    let s = startAttempt(createRetryState("p", "n", "e"), NOW);
    s = recordFailure(s, NOW + 100, "oops");
    s = markExhausted(s);
    expect(summarizeRetryState(s)).toContain("exhausted");
    expect(summarizeRetryState(s)).toContain("oops");
  });

  it("failed", () => {
    let s = startAttempt(createRetryState("p", "n", "e"), NOW);
    s = recordFailure(s, NOW + 100, "timeout");
    expect(summarizeRetryState(s)).toContain("failed");
  });

  it("pending", () => {
    const s = createRetryState("p", "n", "e");
    expect(summarizeRetryState(s)).toContain("pending");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT_POLICIES
// ─────────────────────────────────────────────────────────────────────────────

describe("DEFAULT_POLICIES", () => {
  it("no_retry has maxAttempts=1", () => expect(DEFAULT_POLICIES.no_retry.maxAttempts).toBe(1));
  it("exponential_backoff has 5 attempts", () => expect(DEFAULT_POLICIES.exponential_backoff.maxAttempts).toBe(5));
  it("rate_limit_retry targets 429", () => expect(DEFAULT_POLICIES.rate_limit_retry.retryOn).toContain(429));
  it("aggressive uses always condition", () => expect(DEFAULT_POLICIES.aggressive.conditions).toContain("always"));
});
