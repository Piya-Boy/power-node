/**
 * Phase 39 — Webhook Event Bus & Advanced Retry Engine
 * Pure utilities for webhook event routing, filtering, deduplication,
 * and sophisticated retry strategies.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type WebhookEventStatus =
  | "received"
  | "processing"
  | "delivered"
  | "failed"
  | "retrying"
  | "dead_letter"
  | "duplicate";

export type WebhookMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RetryStrategy = "fixed" | "exponential" | "linear" | "fibonacci";

export interface WebhookEvent {
  id: string;
  source: string;         // origin identifier (e.g., "github", "stripe")
  type: string;           // event type (e.g., "push", "payment.succeeded")
  payload: unknown;
  headers: Record<string, string>;
  method: WebhookMethod;
  receivedAt: Date;
  idempotencyKey?: string;
  status: WebhookEventStatus;
  retryCount: number;
  nextRetryAt?: Date;
  processedAt?: Date;
  deliveredAt?: Date;
  error?: string;
}

export interface WebhookRoute {
  id: string;
  name: string;
  source: string;
  eventTypePattern: string;   // glob-like pattern e.g., "payment.*", "push"
  workflowId: string;
  enabled: boolean;
  filters?: WebhookFilter[];
  transformPath?: string;     // JSON path to extract payload subset
}

export interface WebhookFilter {
  field: string;              // dot-notation field path in payload
  operator: "equals" | "not_equals" | "contains" | "starts_with" | "exists" | "in";
  value?: unknown;
}

export interface RetryPolicy {
  strategy: RetryStrategy;
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;  // for exponential/linear
  jitterMs?: number;           // random jitter added to each delay
}

export interface DeadLetterEntry {
  event: WebhookEvent;
  reason: string;
  deadLetteredAt: Date;
  retryHistory: RetryAttempt[];
}

export interface RetryAttempt {
  attemptNumber: number;
  attemptedAt: Date;
  error: string;
  nextRetryAt?: Date;
}

export interface WebhookStats {
  total: number;
  delivered: number;
  failed: number;
  retrying: number;
  deadLetter: number;
  duplicates: number;
  deliveryRate: number;     // 0-100%
  avgRetries: number;
}

export interface RouteMatchResult {
  route: WebhookRoute;
  matched: boolean;
  filteredOut: boolean;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Creation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new webhook event.
 */
export function createWebhookEvent(params: {
  source: string;
  type: string;
  payload: unknown;
  headers?: Record<string, string>;
  method?: WebhookMethod;
  idempotencyKey?: string;
}): WebhookEvent {
  return {
    id: `wh-${generateId()}`,
    source: params.source,
    type: params.type,
    payload: params.payload,
    headers: params.headers ?? {},
    method: params.method ?? "POST",
    receivedAt: new Date(),
    idempotencyKey: params.idempotencyKey,
    status: "received",
    retryCount: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Route Matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if an event type matches a route's pattern.
 * Supports glob-like wildcards: * matches any segment.
 * Examples: "payment.*" matches "payment.succeeded", "payment.failed"
 */
export function matchesEventPattern(eventType: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (!pattern.includes("*")) return eventType === pattern;

  // Convert glob to regex
  const regexStr = pattern
    .split(".")
    .map((segment) => (segment === "*" ? "[^.]*" : escapeRegex(segment)))
    .join("\\.");
  return new RegExp(`^${regexStr}$`).test(eventType);
}

/**
 * Evaluate a single webhook filter against an event payload.
 */
export function evaluateFilter(filter: WebhookFilter, payload: unknown): boolean {
  const value = getByPath(payload, filter.field);

  switch (filter.operator) {
    case "exists":
      return value !== undefined && value !== null;
    case "equals":
      return value === filter.value;
    case "not_equals":
      return value !== filter.value;
    case "contains":
      if (typeof value === "string" && typeof filter.value === "string") {
        return value.includes(filter.value);
      }
      if (Array.isArray(value)) {
        return value.includes(filter.value);
      }
      return false;
    case "starts_with":
      if (typeof value === "string" && typeof filter.value === "string") {
        return value.startsWith(filter.value);
      }
      return false;
    case "in":
      if (Array.isArray(filter.value)) {
        return filter.value.includes(value);
      }
      return false;
    default:
      return false;
  }
}

/**
 * Find all matching routes for a webhook event.
 */
export function findMatchingRoutes(
  routes: WebhookRoute[],
  event: WebhookEvent
): RouteMatchResult[] {
  return routes.map((route) => {
    if (!route.enabled) {
      return { route, matched: false, filteredOut: false, reason: "Route disabled" };
    }

    if (route.source !== event.source && route.source !== "*") {
      return { route, matched: false, filteredOut: false, reason: `Source mismatch: ${event.source} !== ${route.source}` };
    }

    if (!matchesEventPattern(event.type, route.eventTypePattern)) {
      return { route, matched: false, filteredOut: false, reason: `Event type "${event.type}" does not match pattern "${route.eventTypePattern}"` };
    }

    // Evaluate filters
    if (route.filters && route.filters.length > 0) {
      for (const filter of route.filters) {
        if (!evaluateFilter(filter, event.payload)) {
          return {
            route,
            matched: false,
            filteredOut: true,
            reason: `Filter failed: ${filter.field} ${filter.operator} ${JSON.stringify(filter.value)}`,
          };
        }
      }
    }

    return { route, matched: true, filteredOut: false };
  });
}

/**
 * Get only the routes that fully match an event.
 */
export function getMatchedRoutes(
  routes: WebhookRoute[],
  event: WebhookEvent
): WebhookRoute[] {
  return findMatchingRoutes(routes, event)
    .filter((r) => r.matched)
    .map((r) => r.route);
}

// ─────────────────────────────────────────────────────────────────────────────
// Deduplication
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if an event is a duplicate based on idempotency key.
 */
export function isDuplicate(event: WebhookEvent, processedKeys: Set<string>): boolean {
  if (!event.idempotencyKey) return false;
  return processedKeys.has(event.idempotencyKey);
}

/**
 * Mark an event as duplicate.
 */
export function markDuplicate(event: WebhookEvent): WebhookEvent {
  return { ...event, status: "duplicate" };
}

/**
 * Extract a deduplication key from event (idempotency key or fallback to source+type+timestamp).
 */
export function getDeduplicationKey(event: WebhookEvent): string {
  if (event.idempotencyKey) return event.idempotencyKey;
  return `${event.source}:${event.type}:${event.receivedAt.getTime()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate the delay for the next retry attempt.
 */
export function calculateRetryDelay(
  policy: RetryPolicy,
  attemptNumber: number
): number {
  let delay: number;

  switch (policy.strategy) {
    case "fixed":
      delay = policy.initialDelayMs;
      break;
    case "linear":
      delay = policy.initialDelayMs * (attemptNumber + 1) * (policy.backoffMultiplier ?? 1);
      break;
    case "exponential":
      delay = policy.initialDelayMs * Math.pow(policy.backoffMultiplier ?? 2, attemptNumber);
      break;
    case "fibonacci": {
      const fib = fibonacciN(attemptNumber + 1);
      delay = policy.initialDelayMs * fib;
      break;
    }
    default:
      delay = policy.initialDelayMs;
  }

  // Apply max delay cap
  if (policy.maxDelayMs) {
    delay = Math.min(delay, policy.maxDelayMs);
  }

  // Apply jitter
  if (policy.jitterMs && policy.jitterMs > 0) {
    delay += Math.random() * policy.jitterMs;
  }

  return Math.round(delay);
}

/**
 * Check if an event should be retried based on the policy.
 */
export function shouldRetry(event: WebhookEvent, policy: RetryPolicy): boolean {
  if (event.status !== "failed") return false;
  return event.retryCount < policy.maxRetries;
}

/**
 * Schedule the next retry for a failed event.
 */
export function scheduleRetry(
  event: WebhookEvent,
  policy: RetryPolicy,
  error: string,
  now = new Date()
): WebhookEvent {
  if (!shouldRetry(event, policy)) {
    return { ...event, status: "dead_letter", error };
  }

  const delay = calculateRetryDelay(policy, event.retryCount);
  const nextRetryAt = new Date(now.getTime() + delay);

  return {
    ...event,
    status: "retrying",
    retryCount: event.retryCount + 1,
    nextRetryAt,
    error,
  };
}

/**
 * Move an event to dead letter queue.
 */
export function sendToDeadLetter(
  event: WebhookEvent,
  reason: string,
  retryHistory: RetryAttempt[] = []
): DeadLetterEntry {
  return {
    event: { ...event, status: "dead_letter" },
    reason,
    deadLetteredAt: new Date(),
    retryHistory,
  };
}

/**
 * Get all events that are due for retry.
 */
export function getEventsForRetry(events: WebhookEvent[], now = new Date()): WebhookEvent[] {
  return events.filter(
    (e) => e.status === "retrying" && e.nextRetryAt && e.nextRetryAt <= now
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload Transformation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract a subset of the payload using a dot-notation path.
 * Returns the full payload if path is not provided.
 */
export function extractPayloadSubset(
  payload: unknown,
  path?: string
): unknown {
  if (!path) return payload;
  return getByPath(payload, path);
}

/**
 * Normalize webhook headers to lowercase keys.
 */
export function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
}

/**
 * Extract a signature from webhook headers (supports common formats).
 */
export function extractSignature(headers: Record<string, string>): {
  provider: string;
  signature: string;
} | null {
  const normalized = normalizeHeaders(headers);

  if (normalized["x-hub-signature-256"]) {
    return { provider: "github", signature: normalized["x-hub-signature-256"] };
  }
  if (normalized["stripe-signature"]) {
    return { provider: "stripe", signature: normalized["stripe-signature"] };
  }
  if (normalized["x-webhook-signature"]) {
    return { provider: "generic", signature: normalized["x-webhook-signature"] };
  }
  if (normalized["x-slack-signature"]) {
    return { provider: "slack", signature: normalized["x-slack-signature"] };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Statistics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute statistics for a batch of webhook events.
 */
export function computeWebhookStats(events: WebhookEvent[]): WebhookStats {
  const total = events.length;
  const delivered = events.filter((e) => e.status === "delivered").length;
  const failed = events.filter((e) => e.status === "failed").length;
  const retrying = events.filter((e) => e.status === "retrying").length;
  const deadLetter = events.filter((e) => e.status === "dead_letter").length;
  const duplicates = events.filter((e) => e.status === "duplicate").length;

  const deliveryRate = total > 0 ? Math.round((delivered / (total - duplicates)) * 100) : 0;

  const retryableEvents = events.filter((e) => e.retryCount > 0);
  const avgRetries =
    retryableEvents.length > 0
      ? retryableEvents.reduce((sum, e) => sum + e.retryCount, 0) / retryableEvents.length
      : 0;

  return {
    total,
    delivered,
    failed,
    retrying,
    deadLetter,
    duplicates,
    deliveryRate,
    avgRetries: Math.round(avgRetries * 10) / 10,
  };
}

/**
 * Group webhook events by source.
 */
export function groupEventsBySource(
  events: WebhookEvent[]
): Record<string, WebhookEvent[]> {
  return events.reduce<Record<string, WebhookEvent[]>>((acc, event) => {
    if (!acc[event.source]) acc[event.source] = [];
    acc[event.source].push(event);
    return acc;
  }, {});
}

/**
 * Group webhook events by event type.
 */
export function groupEventsByType(
  events: WebhookEvent[]
): Record<string, WebhookEvent[]> {
  return events.reduce<Record<string, WebhookEvent[]>>((acc, event) => {
    if (!acc[event.type]) acc[event.type] = [];
    acc[event.type].push(event);
    return acc;
  }, {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateId(length = 12): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getByPath(obj: unknown, path: string): unknown {
  if (obj == null || typeof obj !== "object") return undefined;
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function fibonacciN(n: number): number {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}
