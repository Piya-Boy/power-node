/**
 * Phase 80 — Workflow Error Catalog
 * Pure utilities for classifying, enriching, serializing, and
 * aggregating workflow execution errors.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ErrorCategory =
  | "network"
  | "auth"
  | "validation"
  | "timeout"
  | "rate_limit"
  | "not_found"
  | "conflict"
  | "server"
  | "client"
  | "config"
  | "unknown";

export type ErrorSeverity = "debug" | "info" | "warning" | "error" | "critical" | "fatal";

export type RecoveryStrategy =
  | "retry"
  | "skip"
  | "fallback"
  | "abort"
  | "manual"
  | "ignore";

export interface ErrorDefinition {
  code: string;            // e.g. "ERR_NETWORK_TIMEOUT"
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  description?: string;
  retryable: boolean;
  recovery: RecoveryStrategy;
  httpStatus?: number;
}

export interface WorkflowError {
  id: string;
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  details?: Record<string, unknown>;
  nodeId?: string;
  workflowId?: string;
  executionId?: string;
  timestamp: number;
  retryable: boolean;
  retryCount: number;
  recovery: RecoveryStrategy;
  resolved: boolean;
  tags: string[];
}

export interface ErrorPattern {
  pattern: RegExp | string;
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  recovery: RecoveryStrategy;
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in Error Definitions
// ─────────────────────────────────────────────────────────────────────────────

export const ERROR_DEFINITIONS: Record<string, ErrorDefinition> = {
  ERR_NETWORK_TIMEOUT: {
    code: "ERR_NETWORK_TIMEOUT",
    category: "timeout",
    severity: "error",
    message: "Network request timed out",
    retryable: true,
    recovery: "retry",
    httpStatus: 408,
  },
  ERR_NETWORK_UNREACHABLE: {
    code: "ERR_NETWORK_UNREACHABLE",
    category: "network",
    severity: "error",
    message: "Network host unreachable",
    retryable: true,
    recovery: "retry",
  },
  ERR_AUTH_INVALID_TOKEN: {
    code: "ERR_AUTH_INVALID_TOKEN",
    category: "auth",
    severity: "error",
    message: "Authentication token is invalid or expired",
    retryable: false,
    recovery: "abort",
    httpStatus: 401,
  },
  ERR_AUTH_FORBIDDEN: {
    code: "ERR_AUTH_FORBIDDEN",
    category: "auth",
    severity: "error",
    message: "Insufficient permissions to perform this action",
    retryable: false,
    recovery: "abort",
    httpStatus: 403,
  },
  ERR_VALIDATION_FAILED: {
    code: "ERR_VALIDATION_FAILED",
    category: "validation",
    severity: "warning",
    message: "Input validation failed",
    retryable: false,
    recovery: "skip",
    httpStatus: 422,
  },
  ERR_RATE_LIMITED: {
    code: "ERR_RATE_LIMITED",
    category: "rate_limit",
    severity: "warning",
    message: "Rate limit exceeded",
    retryable: true,
    recovery: "retry",
    httpStatus: 429,
  },
  ERR_NOT_FOUND: {
    code: "ERR_NOT_FOUND",
    category: "not_found",
    severity: "error",
    message: "Requested resource not found",
    retryable: false,
    recovery: "skip",
    httpStatus: 404,
  },
  ERR_CONFLICT: {
    code: "ERR_CONFLICT",
    category: "conflict",
    severity: "error",
    message: "Resource conflict detected",
    retryable: false,
    recovery: "manual",
    httpStatus: 409,
  },
  ERR_SERVER_ERROR: {
    code: "ERR_SERVER_ERROR",
    category: "server",
    severity: "error",
    message: "Remote server returned an error",
    retryable: true,
    recovery: "retry",
    httpStatus: 500,
  },
  ERR_BAD_REQUEST: {
    code: "ERR_BAD_REQUEST",
    category: "client",
    severity: "warning",
    message: "Bad request — invalid parameters",
    retryable: false,
    recovery: "skip",
    httpStatus: 400,
  },
  ERR_CONFIG_MISSING: {
    code: "ERR_CONFIG_MISSING",
    category: "config",
    severity: "critical",
    message: "Required configuration is missing",
    retryable: false,
    recovery: "abort",
  },
  ERR_UNKNOWN: {
    code: "ERR_UNKNOWN",
    category: "unknown",
    severity: "error",
    message: "An unexpected error occurred",
    retryable: false,
    recovery: "manual",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Error Creation
// ─────────────────────────────────────────────────────────────────────────────

let _idSeq = 0;
export function resetErrorIdSeq(): void { _idSeq = 0; }

export function createError(
  code: string,
  overrides: Partial<Omit<WorkflowError, "id" | "code" | "timestamp">> & { timestamp?: number } = {}
): WorkflowError {
  const def = ERROR_DEFINITIONS[code] ?? ERROR_DEFINITIONS["ERR_UNKNOWN"];
  const id = `err_${++_idSeq}`;
  return {
    id,
    code,
    category: def.category,
    severity: def.severity,
    message: def.message,
    retryable: def.retryable,
    retryCount: 0,
    recovery: def.recovery,
    resolved: false,
    tags: [],
    timestamp: Date.now(),
    ...overrides,
  };
}

export function createCustomError(
  id: string,
  code: string,
  category: ErrorCategory,
  severity: ErrorSeverity,
  message: string,
  options: Partial<Omit<WorkflowError, "id" | "code" | "category" | "severity" | "message">> = {}
): WorkflowError {
  return {
    id,
    code,
    category,
    severity,
    message,
    retryable: false,
    retryCount: 0,
    recovery: "manual",
    resolved: false,
    tags: [],
    timestamp: Date.now(),
    ...options,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Status Classification
// ─────────────────────────────────────────────────────────────────────────────

export function classifyHttpStatus(status: number): ErrorDefinition {
  if (status === 400) return ERROR_DEFINITIONS["ERR_BAD_REQUEST"];
  if (status === 401) return ERROR_DEFINITIONS["ERR_AUTH_INVALID_TOKEN"];
  if (status === 403) return ERROR_DEFINITIONS["ERR_AUTH_FORBIDDEN"];
  if (status === 404) return ERROR_DEFINITIONS["ERR_NOT_FOUND"];
  if (status === 408) return ERROR_DEFINITIONS["ERR_NETWORK_TIMEOUT"];
  if (status === 409) return ERROR_DEFINITIONS["ERR_CONFLICT"];
  if (status === 422) return ERROR_DEFINITIONS["ERR_VALIDATION_FAILED"];
  if (status === 429) return ERROR_DEFINITIONS["ERR_RATE_LIMITED"];
  if (status >= 500) return ERROR_DEFINITIONS["ERR_SERVER_ERROR"];
  return ERROR_DEFINITIONS["ERR_UNKNOWN"];
}

export function fromHttpStatus(
  status: number,
  overrides: Partial<Omit<WorkflowError, "id" | "code" | "timestamp">> = {}
): WorkflowError {
  const def = classifyHttpStatus(status);
  return createError(def.code, overrides);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern-based Classification
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PATTERNS: ErrorPattern[] = [
  {
    pattern: /timeout|timed?\s*out/i,
    code: "ERR_NETWORK_TIMEOUT",
    category: "timeout",
    severity: "error",
    recovery: "retry",
  },
  {
    pattern: /unauthorized|invalid.*(token|key|credential)/i,
    code: "ERR_AUTH_INVALID_TOKEN",
    category: "auth",
    severity: "error",
    recovery: "abort",
  },
  {
    pattern: /forbidden|permission.denied/i,
    code: "ERR_AUTH_FORBIDDEN",
    category: "auth",
    severity: "error",
    recovery: "abort",
  },
  {
    pattern: /rate.limit|too.many.requests/i,
    code: "ERR_RATE_LIMITED",
    category: "rate_limit",
    severity: "warning",
    recovery: "retry",
  },
  {
    pattern: /not.found|404/i,
    code: "ERR_NOT_FOUND",
    category: "not_found",
    severity: "error",
    recovery: "skip",
  },
  {
    pattern: /ECONNREFUSED|ENOTFOUND|network.unreachable/i,
    code: "ERR_NETWORK_UNREACHABLE",
    category: "network",
    severity: "error",
    recovery: "retry",
  },
];

export function classifyByMessage(
  message: string,
  patterns: ErrorPattern[] = DEFAULT_PATTERNS
): ErrorPattern | undefined {
  for (const p of patterns) {
    const re = typeof p.pattern === "string" ? new RegExp(p.pattern, "i") : p.pattern;
    if (re.test(message)) return p;
  }
  return undefined;
}

export function fromMessage(
  message: string,
  patterns?: ErrorPattern[],
  overrides: Partial<WorkflowError> = {}
): WorkflowError {
  const match = classifyByMessage(message, patterns);
  const code = match?.code ?? "ERR_UNKNOWN";
  return createError(code, { message, ...overrides });
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

export function markRetried(error: WorkflowError): WorkflowError {
  return { ...error, retryCount: error.retryCount + 1 };
}

export function markResolved(error: WorkflowError): WorkflowError {
  return { ...error, resolved: true };
}

export function escalateSeverity(error: WorkflowError): WorkflowError {
  const order: ErrorSeverity[] = ["debug", "info", "warning", "error", "critical", "fatal"];
  const idx = order.indexOf(error.severity);
  const next = order[Math.min(idx + 1, order.length - 1)];
  return { ...error, severity: next };
}

export function addErrorTag(error: WorkflowError, tag: string): WorkflowError {
  if (error.tags.includes(tag)) return error;
  return { ...error, tags: [...error.tags, tag] };
}

export function attachContext(
  error: WorkflowError,
  context: { nodeId?: string; workflowId?: string; executionId?: string }
): WorkflowError {
  return { ...error, ...context };
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtering & Querying
// ─────────────────────────────────────────────────────────────────────────────

export function filterByCategory(
  errors: WorkflowError[],
  category: ErrorCategory
): WorkflowError[] {
  return errors.filter((e) => e.category === category);
}

export function filterBySeverity(
  errors: WorkflowError[],
  severity: ErrorSeverity
): WorkflowError[] {
  return errors.filter((e) => e.severity === severity);
}

export function filterByNode(errors: WorkflowError[], nodeId: string): WorkflowError[] {
  return errors.filter((e) => e.nodeId === nodeId);
}

export function getRetryableErrors(errors: WorkflowError[]): WorkflowError[] {
  return errors.filter((e) => e.retryable && !e.resolved);
}

export function getUnresolvedErrors(errors: WorkflowError[]): WorkflowError[] {
  return errors.filter((e) => !e.resolved);
}

export function getErrorsAboveSeverity(
  errors: WorkflowError[],
  minSeverity: ErrorSeverity
): WorkflowError[] {
  const order: ErrorSeverity[] = ["debug", "info", "warning", "error", "critical", "fatal"];
  const minIdx = order.indexOf(minSeverity);
  return errors.filter((e) => order.indexOf(e.severity) >= minIdx);
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation & Stats
// ─────────────────────────────────────────────────────────────────────────────

export interface ErrorStats {
  total: number;
  resolved: number;
  unresolved: number;
  retryable: number;
  byCategory: Record<ErrorCategory, number>;
  bySeverity: Record<ErrorSeverity, number>;
  byCode: Record<string, number>;
  mostFrequentCode: string | undefined;
}

export function computeErrorStats(errors: WorkflowError[]): ErrorStats {
  const byCategory: Record<ErrorCategory, number> = {
    network: 0, auth: 0, validation: 0, timeout: 0, rate_limit: 0,
    not_found: 0, conflict: 0, server: 0, client: 0, config: 0, unknown: 0,
  };
  const bySeverity: Record<ErrorSeverity, number> = {
    debug: 0, info: 0, warning: 0, error: 0, critical: 0, fatal: 0,
  };
  const byCode: Record<string, number> = {};

  for (const e of errors) {
    byCategory[e.category]++;
    bySeverity[e.severity]++;
    byCode[e.code] = (byCode[e.code] ?? 0) + 1;
  }

  const mostFrequentCode = Object.entries(byCode).sort(([, a], [, b]) => b - a)[0]?.[0];

  return {
    total: errors.length,
    resolved: errors.filter((e) => e.resolved).length,
    unresolved: errors.filter((e) => !e.resolved).length,
    retryable: errors.filter((e) => e.retryable).length,
    byCategory,
    bySeverity,
    byCode,
    mostFrequentCode,
  };
}

export function groupErrorsByNode(
  errors: WorkflowError[]
): Record<string, WorkflowError[]> {
  const result: Record<string, WorkflowError[]> = {};
  for (const e of errors) {
    const key = e.nodeId ?? "__none__";
    if (!result[key]) result[key] = [];
    result[key].push(e);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialization
// ─────────────────────────────────────────────────────────────────────────────

export function serializeError(error: WorkflowError): string {
  return JSON.stringify(error);
}

export function deserializeError(json: string): WorkflowError | undefined {
  try {
    return JSON.parse(json) as WorkflowError;
  } catch {
    return undefined;
  }
}

export function summarizeError(error: WorkflowError): string {
  const resolved = error.resolved ? "[RESOLVED]" : "";
  const retries = error.retryCount > 0 ? ` (retried ${error.retryCount}x)` : "";
  return `[${error.severity.toUpperCase()}] ${error.code}: ${error.message}${retries}${resolved}`.trim();
}

export function toUserMessage(error: WorkflowError): string {
  switch (error.category) {
    case "network":
    case "timeout":
      return "A network error occurred. Please check your connection and try again.";
    case "auth":
      return "Authentication failed. Please check your credentials.";
    case "rate_limit":
      return "Too many requests. Please wait a moment and try again.";
    case "validation":
      return `Validation failed: ${error.message}`;
    case "not_found":
      return "The requested resource was not found.";
    case "config":
      return "Configuration error. Please check your workflow settings.";
    default:
      return error.message;
  }
}
