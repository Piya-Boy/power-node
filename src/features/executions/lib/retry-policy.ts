/**
 * Retry policy for node execution errors.
 * Supports exponential backoff with jitter.
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

export const NO_RETRY_CONFIG: RetryConfig = {
  maxRetries: 0,
  baseDelayMs: 0,
  maxDelayMs: 0,
  backoffMultiplier: 1,
  jitter: false,
};

/**
 * Calculate delay for a given attempt number (0-indexed).
 */
export function calculateDelay(attempt: number, config: RetryConfig): number {
  if (attempt >= config.maxRetries) return -1; // No more retries

  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const clampedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  if (config.jitter) {
    // Add random jitter of ±25%
    const jitterRange = clampedDelay * 0.25;
    return clampedDelay + (Math.random() * 2 - 1) * jitterRange;
  }

  return clampedDelay;
}

/**
 * Determine if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Rate limit errors
    if (message.includes("rate limit") || message.includes("429")) return true;
    // Timeout errors
    if (message.includes("timeout") || message.includes("timed out")) return true;
    // Network errors
    if (message.includes("econnreset") || message.includes("econnrefused")) return true;
    if (message.includes("network") || message.includes("fetch failed")) return true;
    // Server errors (5xx)
    if (message.includes("500") || message.includes("502") || message.includes("503")) return true;

    // Non-retryable: auth errors, validation errors, not found
    if (message.includes("unauthorized") || message.includes("401")) return false;
    if (message.includes("forbidden") || message.includes("403")) return false;
    if (message.includes("not found") || message.includes("404")) return false;
    if (message.includes("invalid") || message.includes("validation")) return false;
  }

  return false;
}

/**
 * Classify an execution error for reporting.
 */
export type ErrorCategory =
  | "network"
  | "authentication"
  | "validation"
  | "rate_limit"
  | "timeout"
  | "server"
  | "unknown";

export function categorizeError(error: unknown): ErrorCategory {
  if (!(error instanceof Error)) return "unknown";

  const message = error.message.toLowerCase();

  if (message.includes("rate limit") || message.includes("429")) return "rate_limit";
  if (message.includes("timeout") || message.includes("timed out")) return "timeout";
  if (message.includes("unauthorized") || message.includes("401")) return "authentication";
  if (message.includes("forbidden") || message.includes("403")) return "authentication";
  if (message.includes("invalid") || message.includes("validation")) return "validation";
  if (message.includes("econnreset") || message.includes("econnrefused") || message.includes("network")) return "network";
  if (message.includes("500") || message.includes("502") || message.includes("503")) return "server";

  return "unknown";
}

/**
 * Format an error for storage/display.
 */
export function formatExecutionError(error: unknown): {
  message: string;
  category: ErrorCategory;
  retryable: boolean;
  stack?: string;
} {
  const category = categorizeError(error);
  const retryable = isRetryableError(error);

  if (error instanceof Error) {
    return {
      message: error.message,
      category,
      retryable,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
    category,
    retryable,
  };
}
