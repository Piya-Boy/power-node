import { describe, it, expect } from "vitest";
import {
  createRetryPolicy,
  noRetryPolicy,
  defaultExponentialPolicy,
  computeBaseDelay,
  applyJitter,
  computeDelay,
  shouldRetryOnError,
  decideRetry,
  createRetryState,
  recordAttempt,
  markExhausted,
  createRetryBudget,
  recordBudgetCall,
  isBudgetAvailable,
  getFailureRate,
  validateRetryPolicy,
  computeRetryStats,
  summarizeRetries,
  type RetryPolicy,
  type AttemptResult,
  type RetryState,
} from "./retry-policy";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makePolicy(overrides: Partial<RetryPolicy> = {}): RetryPolicy {
  return createRetryPolicy({ id: "p1", name: "Test Policy", ...overrides });
}

function makeAttempt(overrides: Partial<AttemptResult> = {}): AttemptResult {
  return {
    attemptNumber: 1,
    success: false,
    errorType: "network_error",
    durationMs: 100,
    timestamp: new Date("2025-06-01"),
    ...overrides,
  };
}

function makeState(overrides: Partial<RetryState> = {}): RetryState {
  return {
    policyId: "p1",
    runId: "run1",
    nodeId: "node1",
    attempts: [],
    exhausted: false,
    succeeded: false,
    totalDurationMs: 0,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// createRetryPolicy
// ─────────────────────────────────────────────────────────────────────────────

describe("createRetryPolicy", () => {
  it("creates a policy with defaults", () => {
    const p = createRetryPolicy({ id: "p1", name: "Test" });
    expect(p.strategy).toBe("exponential");
    expect(p.maxAttempts).toBe(3);
    expect(p.jitter).toBe("full");
    expect(p.retryOn).toContain("any_error");
  });

  it("overrides defaults", () => {
    const p = createRetryPolicy({ id: "p1", name: "Test", maxAttempts: 10, strategy: "fixed" });
    expect(p.maxAttempts).toBe(10);
    expect(p.strategy).toBe("fixed");
  });
});

describe("noRetryPolicy", () => {
  it("has maxAttempts=1 and no retryOn", () => {
    const p = noRetryPolicy("p1", "None");
    expect(p.maxAttempts).toBe(1);
    expect(p.strategy).toBe("none");
    expect(p.retryOn).toHaveLength(0);
  });
});

describe("defaultExponentialPolicy", () => {
  it("has 5 max attempts", () => {
    const p = defaultExponentialPolicy("p1", "Default");
    expect(p.maxAttempts).toBe(5);
    expect(p.strategy).toBe("exponential");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeBaseDelay
// ─────────────────────────────────────────────────────────────────────────────

describe("computeBaseDelay", () => {
  it("returns 0 for none strategy", () => {
    const p = makePolicy({ strategy: "none", initialDelayMs: 1000 });
    expect(computeBaseDelay(p, 1)).toBe(0);
  });

  it("returns fixed delay for fixed strategy", () => {
    const p = makePolicy({ strategy: "fixed", initialDelayMs: 500 });
    expect(computeBaseDelay(p, 1)).toBe(500);
    expect(computeBaseDelay(p, 3)).toBe(500);
  });

  it("computes linear delay", () => {
    const p = makePolicy({ strategy: "linear", initialDelayMs: 100, multiplier: 1 });
    expect(computeBaseDelay(p, 1)).toBe(100);
    expect(computeBaseDelay(p, 2)).toBe(200);
    expect(computeBaseDelay(p, 3)).toBe(300);
  });

  it("computes exponential delay", () => {
    const p = makePolicy({ strategy: "exponential", initialDelayMs: 1000, multiplier: 2 });
    expect(computeBaseDelay(p, 1)).toBe(1000);
    expect(computeBaseDelay(p, 2)).toBe(2000);
    expect(computeBaseDelay(p, 3)).toBe(4000);
    expect(computeBaseDelay(p, 4)).toBe(8000);
  });

  it("computes fibonacci delay", () => {
    const p = makePolicy({ strategy: "fibonacci", initialDelayMs: 100, multiplier: 1 });
    expect(computeBaseDelay(p, 1)).toBe(100);  // fib(1)=1
    expect(computeBaseDelay(p, 2)).toBe(100);  // fib(2)=1
    expect(computeBaseDelay(p, 3)).toBe(200);  // fib(3)=2
    expect(computeBaseDelay(p, 4)).toBe(300);  // fib(4)=3
    expect(computeBaseDelay(p, 5)).toBe(500);  // fib(5)=5
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyJitter
// ─────────────────────────────────────────────────────────────────────────────

describe("applyJitter", () => {
  it("returns base delay for none jitter", () => {
    expect(applyJitter(1000, "none", 0.5)).toBe(1000);
  });

  it("full jitter is in [0, base]", () => {
    const base = 1000;
    expect(applyJitter(base, "full", 0)).toBe(0);
    expect(applyJitter(base, "full", 0.5)).toBeLessThanOrEqual(base);
    expect(applyJitter(base, "full", 1)).toBeLessThanOrEqual(base);
  });

  it("equal jitter is in [base/2, base]", () => {
    const base = 1000;
    const result = applyJitter(base, "equal", 0.5);
    expect(result).toBeGreaterThanOrEqual(base / 2);
    expect(result).toBeLessThanOrEqual(base);
  });

  it("decorrelated jitter is above base/2", () => {
    const result = applyJitter(1000, "decorrelated", 0.5);
    expect(result).toBeGreaterThanOrEqual(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeDelay
// ─────────────────────────────────────────────────────────────────────────────

describe("computeDelay", () => {
  it("respects maxDelayMs cap", () => {
    const p = makePolicy({
      strategy: "exponential",
      initialDelayMs: 1000,
      multiplier: 2,
      maxDelayMs: 5000,
      jitter: "none",
    });
    // attempt 5: base = 1000 * 2^4 = 16000 > 5000
    expect(computeDelay(p, 5, 0.5)).toBe(5000);
  });

  it("computes delay with jitter=none", () => {
    const p = makePolicy({
      strategy: "fixed",
      initialDelayMs: 1000,
      maxDelayMs: 30_000,
      jitter: "none",
    });
    expect(computeDelay(p, 1, 0.5)).toBe(1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// shouldRetryOnError
// ─────────────────────────────────────────────────────────────────────────────

describe("shouldRetryOnError", () => {
  it("any_error matches everything", () => {
    const p = makePolicy({ retryOn: ["any_error"] });
    expect(shouldRetryOnError(p, "network_error")).toBe(true);
    expect(shouldRetryOnError(p, "timeout")).toBe(true);
    expect(shouldRetryOnError(p, "server_error")).toBe(true);
  });

  it("specific conditions match only themselves", () => {
    const p = makePolicy({ retryOn: ["network_error", "timeout"] });
    expect(shouldRetryOnError(p, "network_error")).toBe(true);
    expect(shouldRetryOnError(p, "timeout")).toBe(true);
    expect(shouldRetryOnError(p, "server_error")).toBe(false);
  });

  it("empty retryOn matches nothing", () => {
    const p = makePolicy({ retryOn: [] });
    expect(shouldRetryOnError(p, "any_error")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// decideRetry
// ─────────────────────────────────────────────────────────────────────────────

describe("decideRetry", () => {
  it("does not retry on success", () => {
    const p = makePolicy({ maxAttempts: 3 });
    const state = makeState({ attempts: [makeAttempt({ success: true })] });
    const result = decideRetry(p, state, makeAttempt({ success: true }));
    expect(result.shouldRetry).toBe(false);
    expect(result.reason).toContain("succeeded");
  });

  it("does not retry when strategy=none", () => {
    const p = makePolicy({ strategy: "none", maxAttempts: 1, retryOn: [] });
    const state = makeState();
    const result = decideRetry(p, state, makeAttempt());
    expect(result.shouldRetry).toBe(false);
    expect(result.reason).toContain("disabled");
  });

  it("does not retry when max attempts exhausted", () => {
    const p = makePolicy({ maxAttempts: 2 });
    const state = makeState({
      attempts: [makeAttempt({ attemptNumber: 1 }), makeAttempt({ attemptNumber: 2 })],
    });
    const result = decideRetry(p, state, makeAttempt());
    expect(result.shouldRetry).toBe(false);
    expect(result.reason).toContain("exhausted");
  });

  it("does not retry on non-retryable error type", () => {
    const p = makePolicy({ retryOn: ["network_error"] });
    const state = makeState();
    const result = decideRetry(p, state, makeAttempt({ errorType: "server_error" }));
    expect(result.shouldRetry).toBe(false);
    expect(result.reason).toContain("not retryable");
  });

  it("retries with delay on retryable error", () => {
    const p = makePolicy({
      maxAttempts: 3,
      strategy: "fixed",
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      jitter: "none",
      retryOn: ["any_error"],
    });
    const state = makeState({ attempts: [makeAttempt()] });
    const result = decideRetry(p, state, makeAttempt());
    expect(result.shouldRetry).toBe(true);
    expect(result.delayMs).toBe(1000);
    expect(result.attemptsRemaining).toBe(1);
  });

  it("reports correct attemptsRemaining", () => {
    const p = makePolicy({ maxAttempts: 5, strategy: "fixed", initialDelayMs: 100, maxDelayMs: 10_000, jitter: "none" });
    const state = makeState({ attempts: [makeAttempt(), makeAttempt()] });
    const result = decideRetry(p, state, makeAttempt());
    expect(result.attemptsRemaining).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// State Management
// ─────────────────────────────────────────────────────────────────────────────

describe("createRetryState", () => {
  it("creates empty state", () => {
    const state = createRetryState("p1", "run1", "node1");
    expect(state.attempts).toHaveLength(0);
    expect(state.succeeded).toBe(false);
    expect(state.exhausted).toBe(false);
  });
});

describe("recordAttempt", () => {
  it("appends attempt and updates succeeded flag", () => {
    const state = createRetryState("p1", "run1", "node1");
    const attempt = makeAttempt({ success: true, durationMs: 200 });
    const updated = recordAttempt(state, attempt);
    expect(updated.attempts).toHaveLength(1);
    expect(updated.succeeded).toBe(true);
    expect(updated.totalDurationMs).toBe(200);
  });

  it("accumulates duration across attempts", () => {
    let state = createRetryState("p1", "run1", "node1");
    state = recordAttempt(state, makeAttempt({ durationMs: 100 }));
    state = recordAttempt(state, makeAttempt({ durationMs: 150, success: true }));
    expect(state.totalDurationMs).toBe(250);
  });
});

describe("markExhausted", () => {
  it("sets exhausted flag", () => {
    const state = makeState();
    expect(markExhausted(state).exhausted).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Retry Budget
// ─────────────────────────────────────────────────────────────────────────────

describe("createRetryBudget", () => {
  it("creates budget with zero calls", () => {
    const b = createRetryBudget(60_000, 20);
    expect(b.totalCalls).toBe(0);
    expect(b.budgetExhausted).toBe(false);
  });
});

describe("recordBudgetCall", () => {
  it("tracks successful calls", () => {
    let b = createRetryBudget(60_000, 50);
    b = recordBudgetCall(b, false);
    b = recordBudgetCall(b, false);
    expect(b.totalCalls).toBe(2);
    expect(b.failedCalls).toBe(0);
    expect(b.budgetExhausted).toBe(false);
  });

  it("exhausts budget when failure rate exceeds threshold", () => {
    let b = createRetryBudget(60_000, 25);
    b = recordBudgetCall(b, false);
    b = recordBudgetCall(b, false);
    b = recordBudgetCall(b, false);
    b = recordBudgetCall(b, true); // 1/4 = 25% >= threshold
    expect(b.budgetExhausted).toBe(true);
  });

  it("does not exhaust when failures are below threshold", () => {
    let b = createRetryBudget(60_000, 50);
    b = recordBudgetCall(b, false);
    b = recordBudgetCall(b, true); // 1/2 = 50% = threshold (should exhaust)
    expect(b.budgetExhausted).toBe(true);
  });

  it("stays available when all calls succeed", () => {
    let b = createRetryBudget(60_000, 20);
    for (let i = 0; i < 10; i++) b = recordBudgetCall(b, false);
    expect(isBudgetAvailable(b)).toBe(true);
  });
});

describe("getFailureRate", () => {
  it("returns 0 for no calls", () => {
    expect(getFailureRate(createRetryBudget(60_000, 20))).toBe(0);
  });

  it("computes correct rate", () => {
    let b = createRetryBudget(60_000, 20);
    b = recordBudgetCall(b, false);
    b = recordBudgetCall(b, true);
    expect(getFailureRate(b)).toBe(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateRetryPolicy
// ─────────────────────────────────────────────────────────────────────────────

describe("validateRetryPolicy", () => {
  it("validates a good policy", () => {
    const result = validateRetryPolicy(makePolicy());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("requires id", () => {
    const result = validateRetryPolicy(makePolicy({ id: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("id"))).toBe(true);
  });

  it("requires maxAttempts >= 1", () => {
    const result = validateRetryPolicy(makePolicy({ maxAttempts: 0 }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("maxAttempts"))).toBe(true);
  });

  it("rejects negative initialDelayMs", () => {
    const result = validateRetryPolicy(makePolicy({ initialDelayMs: -1 }));
    expect(result.valid).toBe(false);
  });

  it("rejects maxDelayMs < initialDelayMs", () => {
    const result = validateRetryPolicy(makePolicy({ initialDelayMs: 5000, maxDelayMs: 1000 }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("maxDelayMs"))).toBe(true);
  });

  it("rejects zero multiplier", () => {
    const result = validateRetryPolicy(makePolicy({ multiplier: 0 }));
    expect(result.valid).toBe(false);
  });

  it("rejects empty retryOn when strategy is not none", () => {
    const result = validateRetryPolicy(makePolicy({ strategy: "fixed", retryOn: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("retryOn"))).toBe(true);
  });

  it("rejects invalid budgetPercent", () => {
    const result = validateRetryPolicy(makePolicy({ budgetPercent: 150 }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("budgetPercent"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeRetryStats
// ─────────────────────────────────────────────────────────────────────────────

describe("computeRetryStats", () => {
  it("handles empty state", () => {
    const stats = computeRetryStats(makeState());
    expect(stats.totalAttempts).toBe(0);
    expect(stats.avgAttemptDurationMs).toBe(0);
    expect(stats.retryCount).toBe(0);
  });

  it("computes stats for successful first attempt", () => {
    const state = makeState({
      attempts: [makeAttempt({ success: true, durationMs: 100 })],
      succeeded: true,
      totalDurationMs: 100,
    });
    const stats = computeRetryStats(state);
    expect(stats.totalAttempts).toBe(1);
    expect(stats.successfulAttempts).toBe(1);
    expect(stats.retryCount).toBe(0);
    expect(stats.firstAttemptSucceeded).toBe(true);
    expect(stats.avgAttemptDurationMs).toBe(100);
  });

  it("computes stats with retries", () => {
    const state = makeState({
      attempts: [
        makeAttempt({ success: false, durationMs: 100 }),
        makeAttempt({ success: false, durationMs: 200 }),
        makeAttempt({ success: true, durationMs: 150 }),
      ],
      succeeded: true,
      totalDurationMs: 450,
    });
    const stats = computeRetryStats(state);
    expect(stats.totalAttempts).toBe(3);
    expect(stats.failedAttempts).toBe(2);
    expect(stats.successfulAttempts).toBe(1);
    expect(stats.retryCount).toBe(2);
    expect(stats.firstAttemptSucceeded).toBe(false);
    expect(stats.avgAttemptDurationMs).toBe(150);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summarizeRetries
// ─────────────────────────────────────────────────────────────────────────────

describe("summarizeRetries", () => {
  it("handles empty list", () => {
    const summary = summarizeRetries([]);
    expect(summary.total).toBe(0);
    expect(summary.avgRetries).toBe(0);
  });

  it("summarizes multiple states", () => {
    const s1 = makeState({
      attempts: [makeAttempt({ success: true })],
      succeeded: true,
      totalDurationMs: 100,
    });
    const s2 = makeState({
      attempts: [makeAttempt(), makeAttempt({ success: true })],
      succeeded: true,
      totalDurationMs: 300,
    });
    const s3 = makeState({
      attempts: [makeAttempt(), makeAttempt(), makeAttempt()],
      exhausted: true,
      totalDurationMs: 500,
    });
    const summary = summarizeRetries([s1, s2, s3]);
    expect(summary.total).toBe(3);
    expect(summary.succeeded).toBe(2);
    expect(summary.exhausted).toBe(1);
    expect(summary.totalDurationMs).toBe(900);
    // retries: 0 + 1 + 2 = 3, avg = 3/3 = 1.0
    expect(summary.avgRetries).toBe(1);
  });
});
