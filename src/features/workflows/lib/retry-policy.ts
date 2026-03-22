/**
 * Phase 67 — Workflow Retry Policy Engine
 * Pure utilities for defining, evaluating, and tracking retry policies
 * with exponential backoff, jitter, and per-workflow retry budgets.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type RetryStrategy =
  | "none"
  | "fixed"
  | "linear"
  | "exponential"
  | "fibonacci";

export type BackoffJitter = "none" | "full" | "equal" | "decorrelated";

export interface RetryPolicy {
  id: string;
  name: string;
  strategy: RetryStrategy;
  maxAttempts: number;          // total attempts including first (1 = no retry)
  initialDelayMs: number;       // delay before first retry
  maxDelayMs: number;           // cap for computed delay
  multiplier: number;           // for exponential/linear (base multiplier)
  jitter: BackoffJitter;
  retryOn: RetryCondition[];
  timeoutMs?: number;           // per-attempt timeout
  budgetPercent?: number;       // max % of calls that can be retrying (0–100)
}

export type RetryCondition =
  | "any_error"
  | "network_error"
  | "timeout"
  | "rate_limited"
  | "server_error"          // 5xx
  | "service_unavailable";  // 503

export interface AttemptResult {
  attemptNumber: number;    // 1-based
  success: boolean;
  errorType?: RetryCondition;
  durationMs: number;
  timestamp: Date;
}

export interface RetryState {
  policyId: string;
  runId: string;
  nodeId: string;
  attempts: AttemptResult[];
  exhausted: boolean;
  succeeded: boolean;
  totalDurationMs: number;
}

export interface RetryDecision {
  shouldRetry: boolean;
  delayMs: number;
  attemptsRemaining: number;
  reason: string;
}

export interface RetryBudget {
  windowMs: number;          // rolling window (e.g. 60_000 for 1 min)
  maxFailurePercent: number; // e.g. 20 means at most 20% of calls may fail
  totalCalls: number;
  failedCalls: number;
  budgetExhausted: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Policy Factories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a retry policy with defaults filled in.
 */
export function createRetryPolicy(
  overrides: Partial<RetryPolicy> & Pick<RetryPolicy, "id" | "name">
): RetryPolicy {
  return {
    strategy: "exponential",
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30_000,
    multiplier: 2,
    jitter: "full",
    retryOn: ["any_error"],
    ...overrides,
  };
}

/** No-retry policy (single attempt). */
export function noRetryPolicy(id: string, name: string): RetryPolicy {
  return createRetryPolicy({ id, name, strategy: "none", maxAttempts: 1, retryOn: [] });
}

/** Standard exponential backoff: up to 5 retries, starting at 500ms. */
export function defaultExponentialPolicy(id: string, name: string): RetryPolicy {
  return createRetryPolicy({
    id,
    name,
    strategy: "exponential",
    maxAttempts: 5,
    initialDelayMs: 500,
    maxDelayMs: 60_000,
    multiplier: 2,
    jitter: "full",
    retryOn: ["any_error"],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Delay Computation
// ─────────────────────────────────────────────────────────────────────────────

/** Fibonacci sequence helper (1-indexed). */
function fibonacci(n: number): number {
  if (n <= 1) return 1;
  if (n === 2) return 1;
  let a = 1, b = 1;
  for (let i = 3; i <= n; i++) {
    const c = a + b;
    a = b;
    b = c;
  }
  return b;
}

/**
 * Compute the raw (pre-jitter) delay for a given attempt number.
 * `attemptNumber` is 1-based (1 = first retry after initial failure).
 */
export function computeBaseDelay(policy: RetryPolicy, attemptNumber: number): number {
  const { strategy, initialDelayMs, multiplier } = policy;
  switch (strategy) {
    case "none":
      return 0;
    case "fixed":
      return initialDelayMs;
    case "linear":
      return initialDelayMs * attemptNumber * multiplier;
    case "exponential":
      return initialDelayMs * Math.pow(multiplier, attemptNumber - 1);
    case "fibonacci":
      return initialDelayMs * fibonacci(attemptNumber);
    default:
      return initialDelayMs;
  }
}

/**
 * Apply jitter to a base delay. Uses a seeded pseudo-random via a simple
 * deterministic formula so tests can verify bounds without mocking Math.random.
 * In production, replace `rand` with Math.random().
 */
export function applyJitter(
  baseDelay: number,
  jitter: BackoffJitter,
  rand: number   // 0–1 deterministic or Math.random()
): number {
  switch (jitter) {
    case "none":
      return baseDelay;
    case "full":
      // Uniform [0, baseDelay]
      return Math.floor(rand * baseDelay);
    case "equal":
      // Uniform [baseDelay/2, baseDelay]
      return Math.floor(baseDelay / 2 + rand * (baseDelay / 2));
    case "decorrelated":
      // AWS-style: uniform [initialDelay, 3 * prevDelay] — approximated here
      return Math.floor(baseDelay / 2 + rand * baseDelay * 1.5);
    default:
      return baseDelay;
  }
}

/**
 * Compute the actual delay for a retry attempt, clamped to maxDelayMs.
 */
export function computeDelay(
  policy: RetryPolicy,
  attemptNumber: number,
  rand = 0.5
): number {
  const base = computeBaseDelay(policy, attemptNumber);
  const withJitter = applyJitter(base, policy.jitter, rand);
  return Math.min(withJitter, policy.maxDelayMs);
}

// ─────────────────────────────────────────────────────────────────────────────
// Condition Matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check whether a given error type satisfies the policy's retryOn conditions.
 */
export function shouldRetryOnError(
  policy: RetryPolicy,
  errorType: RetryCondition
): boolean {
  if (policy.retryOn.includes("any_error")) return true;
  return policy.retryOn.includes(errorType);
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry Decision
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decide whether to retry given the current state and latest attempt result.
 */
export function decideRetry(
  policy: RetryPolicy,
  state: RetryState,
  lastResult: AttemptResult,
  rand = 0.5
): RetryDecision {
  if (lastResult.success) {
    return { shouldRetry: false, delayMs: 0, attemptsRemaining: 0, reason: "last attempt succeeded" };
  }

  if (policy.strategy === "none") {
    return { shouldRetry: false, delayMs: 0, attemptsRemaining: 0, reason: "retry disabled" };
  }

  const attemptsUsed = state.attempts.length;
  const attemptsRemaining = policy.maxAttempts - attemptsUsed;

  if (attemptsRemaining <= 0) {
    return { shouldRetry: false, delayMs: 0, attemptsRemaining: 0, reason: "max attempts exhausted" };
  }

  const errorType = lastResult.errorType ?? "any_error";
  if (!shouldRetryOnError(policy, errorType)) {
    return { shouldRetry: false, delayMs: 0, attemptsRemaining, reason: `error type '${errorType}' not retryable` };
  }

  const nextAttemptNumber = attemptsUsed + 1; // 1-based retry number
  const delayMs = computeDelay(policy, nextAttemptNumber, rand);

  return {
    shouldRetry: true,
    delayMs,
    attemptsRemaining: attemptsRemaining - 1,
    reason: `retrying (attempt ${attemptsUsed + 1}/${policy.maxAttempts})`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// State Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an initial retry state.
 */
export function createRetryState(policyId: string, runId: string, nodeId: string): RetryState {
  return {
    policyId,
    runId,
    nodeId,
    attempts: [],
    exhausted: false,
    succeeded: false,
    totalDurationMs: 0,
  };
}

/**
 * Record an attempt result and return updated state.
 */
export function recordAttempt(state: RetryState, result: AttemptResult): RetryState {
  const attempts = [...state.attempts, result];
  const succeeded = result.success;
  const totalDurationMs = state.totalDurationMs + result.durationMs;
  return { ...state, attempts, succeeded, totalDurationMs };
}

/**
 * Mark state as exhausted (all retries consumed without success).
 */
export function markExhausted(state: RetryState): RetryState {
  return { ...state, exhausted: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry Budget
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a retry budget tracker.
 */
export function createRetryBudget(windowMs: number, maxFailurePercent: number): RetryBudget {
  return {
    windowMs,
    maxFailurePercent,
    totalCalls: 0,
    failedCalls: 0,
    budgetExhausted: false,
  };
}

/**
 * Record a call outcome and return updated budget.
 */
export function recordBudgetCall(budget: RetryBudget, failed: boolean): RetryBudget {
  const totalCalls = budget.totalCalls + 1;
  const failedCalls = budget.failedCalls + (failed ? 1 : 0);
  const failurePercent = totalCalls > 0 ? (failedCalls / totalCalls) * 100 : 0;
  const budgetExhausted = failurePercent >= budget.maxFailurePercent;
  return { ...budget, totalCalls, failedCalls, budgetExhausted };
}

/**
 * Check if the retry budget allows retrying.
 */
export function isBudgetAvailable(budget: RetryBudget): boolean {
  return !budget.budgetExhausted;
}

/**
 * Compute current failure rate as percentage.
 */
export function getFailureRate(budget: RetryBudget): number {
  if (budget.totalCalls === 0) return 0;
  return (budget.failedCalls / budget.totalCalls) * 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export interface PolicyValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a retry policy configuration.
 */
export function validateRetryPolicy(policy: RetryPolicy): PolicyValidationResult {
  const errors: string[] = [];

  if (!policy.id.trim()) errors.push("id is required");
  if (!policy.name.trim()) errors.push("name is required");
  if (policy.maxAttempts < 1) errors.push("maxAttempts must be >= 1");
  if (policy.initialDelayMs < 0) errors.push("initialDelayMs must be >= 0");
  if (policy.maxDelayMs < policy.initialDelayMs) {
    errors.push("maxDelayMs must be >= initialDelayMs");
  }
  if (policy.multiplier <= 0) errors.push("multiplier must be > 0");
  if (policy.strategy !== "none" && policy.retryOn.length === 0) {
    errors.push("retryOn must not be empty when strategy is not 'none'");
  }
  if (policy.budgetPercent !== undefined) {
    if (policy.budgetPercent < 0 || policy.budgetPercent > 100) {
      errors.push("budgetPercent must be between 0 and 100");
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────────────────────────────────────

export interface RetryStats {
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  totalDurationMs: number;
  avgAttemptDurationMs: number;
  retryCount: number;          // attempts beyond the first
  succeeded: boolean;
  exhausted: boolean;
  firstAttemptSucceeded: boolean;
}

/**
 * Compute statistics from a retry state.
 */
export function computeRetryStats(state: RetryState): RetryStats {
  const { attempts, succeeded, exhausted, totalDurationMs } = state;
  const totalAttempts = attempts.length;
  const successfulAttempts = attempts.filter((a) => a.success).length;
  const failedAttempts = totalAttempts - successfulAttempts;
  const avgAttemptDurationMs = totalAttempts > 0 ? Math.round(totalDurationMs / totalAttempts) : 0;
  const retryCount = Math.max(0, totalAttempts - 1);
  const firstAttemptSucceeded = totalAttempts > 0 && attempts[0].success;

  return {
    totalAttempts,
    successfulAttempts,
    failedAttempts,
    totalDurationMs,
    avgAttemptDurationMs,
    retryCount,
    succeeded,
    exhausted,
    firstAttemptSucceeded,
  };
}

/**
 * Summarize retry outcomes across multiple states.
 */
export function summarizeRetries(states: RetryState[]): {
  total: number;
  succeeded: number;
  exhausted: number;
  avgRetries: number;
  totalDurationMs: number;
} {
  if (states.length === 0) {
    return { total: 0, succeeded: 0, exhausted: 0, avgRetries: 0, totalDurationMs: 0 };
  }

  let succeeded = 0, exhausted = 0, totalRetries = 0, totalDurationMs = 0;
  for (const state of states) {
    if (state.succeeded) succeeded++;
    if (state.exhausted) exhausted++;
    totalRetries += Math.max(0, state.attempts.length - 1);
    totalDurationMs += state.totalDurationMs;
  }

  return {
    total: states.length,
    succeeded,
    exhausted,
    avgRetries: Math.round((totalRetries / states.length) * 10) / 10,
    totalDurationMs,
  };
}
