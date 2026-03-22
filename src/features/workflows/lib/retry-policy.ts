export type BackoffStrategy = "fixed" | "linear" | "exponential" | "jitter";
export type RetryCondition = "always" | "on_error" | "on_timeout" | "on_rate_limit" | "never";

export interface RetryPolicy {
  maxAttempts: number;
  backoff: BackoffStrategy;
  baseDelayMs: number;
  maxDelayMs: number;
  conditions: RetryCondition[];
  retryOn?: number[];
  noRetryOn?: number[];
  timeout?: number;
  jitterFactor?: number;
}

export interface AttemptRecord {
  attempt: number;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  success: boolean;
  error?: string;
  errorCode?: string;
  httpStatus?: number;
  nextDelayMs?: number;
}

export interface RetryState {
  policyId: string;
  nodeId: string;
  executionId: string;
  attempts: AttemptRecord[];
  status: "pending" | "running" | "succeeded" | "failed" | "exhausted";
  totalDelayMs: number;
}

export interface RetryDecision { shouldRetry: boolean; delayMs: number; reason: string; }

export const DEFAULT_POLICIES: Record<string, RetryPolicy> = {
  no_retry: { maxAttempts: 1, backoff: "fixed", baseDelayMs: 0, maxDelayMs: 0, conditions: ["never"] },
  simple_retry: { maxAttempts: 3, backoff: "fixed", baseDelayMs: 1000, maxDelayMs: 1000, conditions: ["on_error"] },
  exponential_backoff: { maxAttempts: 5, backoff: "exponential", baseDelayMs: 500, maxDelayMs: 30000, conditions: ["on_error", "on_timeout"] },
  rate_limit_retry: { maxAttempts: 10, backoff: "exponential", baseDelayMs: 2000, maxDelayMs: 120000, conditions: ["on_rate_limit"], retryOn: [429], jitterFactor: 0.2 },
  aggressive: { maxAttempts: 8, backoff: "linear", baseDelayMs: 200, maxDelayMs: 5000, conditions: ["always"] },
};

export function computeDelay(policy: RetryPolicy, attempt: number, randomFactor = 0.5): number {
  let delay: number;
  switch (policy.backoff) {
    case "fixed": delay = policy.baseDelayMs; break;
    case "linear": delay = policy.baseDelayMs * attempt; break;
    case "exponential": delay = policy.baseDelayMs * Math.pow(2, attempt - 1); break;
    case "jitter": delay = policy.baseDelayMs * Math.pow(2, attempt - 1) * (1 + randomFactor); break;
    default: delay = policy.baseDelayMs;
  }
  if (policy.jitterFactor && policy.jitterFactor > 0) { delay = delay + delay * policy.jitterFactor * randomFactor; }
  return Math.min(Math.round(delay), policy.maxDelayMs);
}

export function shouldRetry(state: RetryState, policy: RetryPolicy, lastAttempt: AttemptRecord, randomFactor = 0.5): RetryDecision {
  const n = state.attempts.length;
  if (n >= policy.maxAttempts) return { shouldRetry: false, delayMs: 0, reason: "max_attempts_reached" };
  if (policy.conditions.includes("never")) return { shouldRetry: false, delayMs: 0, reason: "policy_never_retry" };
  if (lastAttempt.success) return { shouldRetry: false, delayMs: 0, reason: "attempt_succeeded" };
  if (lastAttempt.httpStatus !== undefined) {
    if (policy.noRetryOn && policy.noRetryOn.includes(lastAttempt.httpStatus)) return { shouldRetry: false, delayMs: 0, reason: "no_retry_on_status" };
    if (policy.retryOn && !policy.retryOn.includes(lastAttempt.httpStatus)) return { shouldRetry: false, delayMs: 0, reason: "status_not_in_retry_list" };
  }
  const ok = policy.conditions.includes("always") ||
    (policy.conditions.includes("on_error") && !lastAttempt.success) ||
    (policy.conditions.includes("on_timeout") && lastAttempt.errorCode === "TIMEOUT") ||
    (policy.conditions.includes("on_rate_limit") && lastAttempt.httpStatus === 429);
  if (!ok) return { shouldRetry: false, delayMs: 0, reason: "condition_not_met" };
  return { shouldRetry: true, delayMs: computeDelay(policy, n, randomFactor), reason: "retry_scheduled" };
}

export function createRetryState(policyId: string, nodeId: string, executionId: string): RetryState {
  return { policyId, nodeId, executionId, attempts: [], status: "pending", totalDelayMs: 0 };
}
export function startAttempt(state: RetryState, now: number): RetryState {
  const a: AttemptRecord = { attempt: state.attempts.length + 1, startedAt: now, success: false };
  return { ...state, status: "running", attempts: [...state.attempts, a] };
}
export function recordSuccess(state: RetryState, now: number): RetryState {
  const last = state.attempts[state.attempts.length - 1];
  if (!last) return state;
  const u: AttemptRecord = { ...last, finishedAt: now, durationMs: now - last.startedAt, success: true };
  return { ...state, status: "succeeded", attempts: [...state.attempts.slice(0, -1), u] };
}
export function recordFailure(state: RetryState, now: number, error: string, opts: { errorCode?: string; httpStatus?: number; nextDelayMs?: number } = {}): RetryState {
  const last = state.attempts[state.attempts.length - 1];
  if (!last) return state;
  const u: AttemptRecord = { ...last, finishedAt: now, durationMs: now - last.startedAt, success: false, error, ...opts };
  return { ...state, status: "failed", attempts: [...state.attempts.slice(0, -1), u], totalDelayMs: state.totalDelayMs + (opts.nextDelayMs ?? 0) };
}
export function markExhausted(state: RetryState): RetryState { return { ...state, status: "exhausted" }; }
export function getAttemptCount(state: RetryState): number { return state.attempts.length; }
export function getLastAttempt(state: RetryState): AttemptRecord | undefined { return state.attempts[state.attempts.length - 1]; }
export function getTotalDuration(state: RetryState): number { return state.attempts.reduce((s, a) => s + (a.durationMs ?? 0), 0); }
export function hasSucceeded(state: RetryState): boolean { return state.status === "succeeded"; }
export function isExhausted(state: RetryState): boolean { return state.status === "exhausted"; }
export function getRemainingAttempts(state: RetryState, policy: RetryPolicy): number { return Math.max(0, policy.maxAttempts - state.attempts.length); }

export interface PolicyValidationResult { valid: boolean; errors: string[]; warnings: string[]; }
export function validatePolicy(policy: RetryPolicy): PolicyValidationResult {
  const errors: string[] = []; const warnings: string[] = [];
  if (policy.maxAttempts < 1) errors.push("maxAttempts must be >= 1");
  if (policy.baseDelayMs < 0) errors.push("baseDelayMs must be >= 0");
  if (policy.maxDelayMs < 0) errors.push("maxDelayMs must be >= 0");
  if (policy.maxDelayMs < policy.baseDelayMs) warnings.push("maxDelayMs is less than baseDelayMs");
  if (policy.conditions.length === 0) errors.push("conditions must not be empty");
  if (policy.jitterFactor !== undefined && (policy.jitterFactor < 0 || policy.jitterFactor > 1)) errors.push("jitterFactor must be between 0 and 1");
  if (policy.maxAttempts > 20) warnings.push("maxAttempts > 20 may cause very long retry chains");
  return { valid: errors.length === 0, errors, warnings };
}

export interface RetryStats {
  totalAttempts: number; successCount: number; failureCount: number; exhaustedCount: number;
  averageAttemptsPerExecution: number; successRate: number; averageTotalDelayMs: number; averageDurationMs: number;
}
export function computeRetryStats(states: RetryState[]): RetryStats {
  if (states.length === 0) return { totalAttempts: 0, successCount: 0, failureCount: 0, exhaustedCount: 0, averageAttemptsPerExecution: 0, successRate: 0, averageTotalDelayMs: 0, averageDurationMs: 0 };
  const sc = states.filter((s) => s.status === "succeeded").length;
  const ec = states.filter((s) => s.status === "exhausted").length;
  const fc = states.filter((s) => s.status === "failed").length;
  const ta = states.reduce((s, x) => s + x.attempts.length, 0);
  const td = states.reduce((s, x) => s + x.totalDelayMs, 0);
  const dur = states.reduce((s, x) => s + x.attempts.reduce((a, b) => a + (b.durationMs ?? 0), 0), 0);
  return { totalAttempts: ta, successCount: sc, failureCount: fc, exhaustedCount: ec,
    averageAttemptsPerExecution: ta / states.length, successRate: sc / states.length,
    averageTotalDelayMs: td / states.length, averageDurationMs: dur / Math.max(1, ta) };
}

export function mergePolicy(base: RetryPolicy, overrides: Partial<RetryPolicy>): RetryPolicy { return { ...base, ...overrides }; }
export function summarizeRetryState(state: RetryState): string {
  const last = getLastAttempt(state); const n = state.attempts.length;
  if (state.status === "succeeded") return "succeeded after " + n + " attempt(s)";
  if (state.status === "exhausted") return "exhausted after " + n + " attempt(s), last error: " + (last?.error ?? "unknown");
  if (state.status === "failed") return "failed on attempt " + n + ", error: " + (last?.error ?? "unknown");
  return state.status + " (" + n + " attempt(s))";
}
