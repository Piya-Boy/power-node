/**
 * Simple in-memory rate limiter for API endpoints and workflow executions.
 * Uses a sliding window approach.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  api: { maxRequests: 100, windowMs: 60_000 }, // 100 req/min
  webhook: { maxRequests: 200, windowMs: 60_000 }, // 200 req/min
  execution: { maxRequests: 50, windowMs: 60_000 }, // 50 exec/min
  aiGenerate: { maxRequests: 10, windowMs: 60_000 }, // 10 req/min
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  const remaining = Math.max(0, config.maxRequests - entry.timestamps.length);
  const allowed = entry.timestamps.length < config.maxRequests;

  if (allowed) {
    entry.timestamps.push(now);
  }

  const resetAt = entry.timestamps.length > 0
    ? entry.timestamps[0] + config.windowMs
    : now + config.windowMs;

  return {
    allowed,
    remaining: allowed ? remaining - 1 : 0,
    resetAt,
    limit: config.maxRequests,
  };
}

export function resetRateLimit(key: string): void {
  store.delete(key);
}

export function clearAllRateLimits(): void {
  store.clear();
}

/**
 * Create a rate limit key from components.
 */
export function createRateLimitKey(
  type: string,
  identifier: string,
): string {
  return `${type}:${identifier}`;
}

/**
 * Get rate limit headers for HTTP responses.
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}
