import { describe, it, expect } from "vitest";
import {
  createWebhookEvent,
  matchesEventPattern,
  evaluateFilter,
  findMatchingRoutes,
  getMatchedRoutes,
  isDuplicate,
  markDuplicate,
  getDeduplicationKey,
  calculateRetryDelay,
  shouldRetry,
  scheduleRetry,
  sendToDeadLetter,
  getEventsForRetry,
  extractPayloadSubset,
  normalizeHeaders,
  extractSignature,
  computeWebhookStats,
  groupEventsBySource,
  groupEventsByType,
  type WebhookEvent,
  type WebhookRoute,
  type RetryPolicy,
} from "./webhook-event-bus";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const makeEvent = (overrides: Partial<WebhookEvent> = {}): WebhookEvent => ({
  id: "wh-1",
  source: "github",
  type: "push",
  payload: { ref: "refs/heads/main", repository: { name: "myrepo" } },
  headers: { "content-type": "application/json" },
  method: "POST",
  receivedAt: new Date(),
  status: "received",
  retryCount: 0,
  ...overrides,
});

const makeRoute = (overrides: Partial<WebhookRoute> = {}): WebhookRoute => ({
  id: "route-1",
  name: "GitHub Push",
  source: "github",
  eventTypePattern: "push",
  workflowId: "wf-1",
  enabled: true,
  ...overrides,
});

const defaultRetryPolicy: RetryPolicy = {
  strategy: "exponential",
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 60_000,
};

// ─────────────────────────────────────────────────────────────────────────────
// createWebhookEvent
// ─────────────────────────────────────────────────────────────────────────────

describe("createWebhookEvent", () => {
  it("creates event with defaults", () => {
    const event = createWebhookEvent({ source: "github", type: "push", payload: {} });
    expect(event.id).toBeTruthy();
    expect(event.status).toBe("received");
    expect(event.retryCount).toBe(0);
    expect(event.method).toBe("POST");
    expect(event.receivedAt).toBeInstanceOf(Date);
  });

  it("uses provided idempotency key", () => {
    const event = createWebhookEvent({
      source: "stripe",
      type: "payment.succeeded",
      payload: {},
      idempotencyKey: "evt_123",
    });
    expect(event.idempotencyKey).toBe("evt_123");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// matchesEventPattern
// ─────────────────────────────────────────────────────────────────────────────

describe("matchesEventPattern", () => {
  it("exact match", () => {
    expect(matchesEventPattern("push", "push")).toBe(true);
    expect(matchesEventPattern("push", "pull_request")).toBe(false);
  });

  it("wildcard matches any type", () => {
    expect(matchesEventPattern("anything", "*")).toBe(true);
  });

  it("partial wildcard: payment.*", () => {
    expect(matchesEventPattern("payment.succeeded", "payment.*")).toBe(true);
    expect(matchesEventPattern("payment.failed", "payment.*")).toBe(true);
    expect(matchesEventPattern("subscription.created", "payment.*")).toBe(false);
  });

  it("does not match across dots with single *", () => {
    expect(matchesEventPattern("a.b.c", "a.*")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateFilter
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateFilter", () => {
  const payload = { action: "opened", number: 42, labels: ["bug", "urgent"], ref: "refs/heads/main" };

  it("equals operator", () => {
    expect(evaluateFilter({ field: "action", operator: "equals", value: "opened" }, payload)).toBe(true);
    expect(evaluateFilter({ field: "action", operator: "equals", value: "closed" }, payload)).toBe(false);
  });

  it("not_equals operator", () => {
    expect(evaluateFilter({ field: "action", operator: "not_equals", value: "closed" }, payload)).toBe(true);
  });

  it("contains operator (string)", () => {
    expect(evaluateFilter({ field: "ref", operator: "contains", value: "main" }, payload)).toBe(true);
  });

  it("contains operator (array)", () => {
    expect(evaluateFilter({ field: "labels", operator: "contains", value: "bug" }, payload)).toBe(true);
    expect(evaluateFilter({ field: "labels", operator: "contains", value: "feature" }, payload)).toBe(false);
  });

  it("starts_with operator", () => {
    expect(evaluateFilter({ field: "ref", operator: "starts_with", value: "refs/" }, payload)).toBe(true);
  });

  it("exists operator", () => {
    expect(evaluateFilter({ field: "action", operator: "exists" }, payload)).toBe(true);
    expect(evaluateFilter({ field: "missing_field", operator: "exists" }, payload)).toBe(false);
  });

  it("in operator", () => {
    expect(evaluateFilter({ field: "action", operator: "in", value: ["opened", "closed"] }, payload)).toBe(true);
    expect(evaluateFilter({ field: "action", operator: "in", value: ["merged"] }, payload)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findMatchingRoutes / getMatchedRoutes
// ─────────────────────────────────────────────────────────────────────────────

describe("findMatchingRoutes", () => {
  it("matches route with exact event type", () => {
    const routes = [makeRoute()];
    const event = makeEvent();
    const results = findMatchingRoutes(routes, event);
    expect(results[0].matched).toBe(true);
  });

  it("ignores disabled routes", () => {
    const routes = [makeRoute({ enabled: false })];
    const results = findMatchingRoutes(routes, makeEvent());
    expect(results[0].matched).toBe(false);
    expect(results[0].reason).toContain("disabled");
  });

  it("rejects source mismatch", () => {
    const routes = [makeRoute({ source: "stripe" })];
    const results = findMatchingRoutes(routes, makeEvent({ source: "github" }));
    expect(results[0].matched).toBe(false);
  });

  it("applies filters and marks as filteredOut", () => {
    const routes = [
      makeRoute({
        filters: [{ field: "action", operator: "equals", value: "merged" }],
      }),
    ];
    const event = makeEvent({ payload: { action: "opened" } });
    const results = findMatchingRoutes(routes, event);
    expect(results[0].matched).toBe(false);
    expect(results[0].filteredOut).toBe(true);
  });

  it("matches wildcard source", () => {
    const routes = [makeRoute({ source: "*", eventTypePattern: "push" })];
    const event = makeEvent({ source: "any-source" });
    const results = findMatchingRoutes(routes, event);
    expect(results[0].matched).toBe(true);
  });
});

describe("getMatchedRoutes", () => {
  it("returns only matched routes", () => {
    const routes = [
      makeRoute({ id: "r1", eventTypePattern: "push" }),
      makeRoute({ id: "r2", eventTypePattern: "pull_request" }),
      makeRoute({ id: "r3", enabled: false }),
    ];
    const matched = getMatchedRoutes(routes, makeEvent({ type: "push" }));
    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe("r1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Deduplication
// ─────────────────────────────────────────────────────────────────────────────

describe("isDuplicate", () => {
  it("returns true for known idempotency key", () => {
    const event = makeEvent({ idempotencyKey: "evt_123" });
    const keys = new Set(["evt_123"]);
    expect(isDuplicate(event, keys)).toBe(true);
  });

  it("returns false for unknown key", () => {
    const event = makeEvent({ idempotencyKey: "evt_new" });
    const keys = new Set<string>();
    expect(isDuplicate(event, keys)).toBe(false);
  });

  it("returns false when no idempotency key", () => {
    const event = makeEvent();
    const keys = new Set<string>();
    expect(isDuplicate(event, keys)).toBe(false);
  });
});

describe("markDuplicate", () => {
  it("sets status to duplicate", () => {
    expect(markDuplicate(makeEvent()).status).toBe("duplicate");
  });
});

describe("getDeduplicationKey", () => {
  it("returns idempotency key when present", () => {
    const event = makeEvent({ idempotencyKey: "my-key" });
    expect(getDeduplicationKey(event)).toBe("my-key");
  });

  it("generates fallback key from source:type:timestamp", () => {
    const event = makeEvent();
    const key = getDeduplicationKey(event);
    expect(key).toContain("github:push:");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateRetryDelay
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateRetryDelay", () => {
  it("fixed strategy returns constant delay", () => {
    const policy: RetryPolicy = { strategy: "fixed", maxRetries: 3, initialDelayMs: 1000 };
    expect(calculateRetryDelay(policy, 0)).toBe(1000);
    expect(calculateRetryDelay(policy, 2)).toBe(1000);
  });

  it("exponential strategy doubles each time", () => {
    const policy: RetryPolicy = { strategy: "exponential", maxRetries: 5, initialDelayMs: 1000, backoffMultiplier: 2 };
    expect(calculateRetryDelay(policy, 0)).toBe(1000);
    expect(calculateRetryDelay(policy, 1)).toBe(2000);
    expect(calculateRetryDelay(policy, 2)).toBe(4000);
  });

  it("linear strategy grows linearly", () => {
    const policy: RetryPolicy = { strategy: "linear", maxRetries: 5, initialDelayMs: 500, backoffMultiplier: 1 };
    expect(calculateRetryDelay(policy, 0)).toBe(500);
    expect(calculateRetryDelay(policy, 1)).toBe(1000);
    expect(calculateRetryDelay(policy, 2)).toBe(1500);
  });

  it("fibonacci strategy uses Fibonacci sequence", () => {
    const policy: RetryPolicy = { strategy: "fibonacci", maxRetries: 5, initialDelayMs: 1000 };
    // fib(1)=1, fib(2)=1, fib(3)=2, fib(4)=3
    expect(calculateRetryDelay(policy, 0)).toBe(1000);
    expect(calculateRetryDelay(policy, 1)).toBe(1000);
    expect(calculateRetryDelay(policy, 2)).toBe(2000);
    expect(calculateRetryDelay(policy, 3)).toBe(3000);
  });

  it("caps delay at maxDelayMs", () => {
    const policy: RetryPolicy = { strategy: "exponential", maxRetries: 5, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 5000 };
    expect(calculateRetryDelay(policy, 5)).toBe(5000); // 32000 capped at 5000
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// shouldRetry / scheduleRetry
// ─────────────────────────────────────────────────────────────────────────────

describe("shouldRetry", () => {
  it("returns true for failed event within maxRetries", () => {
    const event = makeEvent({ status: "failed", retryCount: 1 });
    expect(shouldRetry(event, defaultRetryPolicy)).toBe(true);
  });

  it("returns false when retryCount >= maxRetries", () => {
    const event = makeEvent({ status: "failed", retryCount: 3 });
    expect(shouldRetry(event, defaultRetryPolicy)).toBe(false);
  });

  it("returns false for non-failed events", () => {
    const event = makeEvent({ status: "delivered" });
    expect(shouldRetry(event, defaultRetryPolicy)).toBe(false);
  });
});

describe("scheduleRetry", () => {
  it("schedules retry with delay", () => {
    const event = makeEvent({ status: "failed", retryCount: 0 });
    const retried = scheduleRetry(event, defaultRetryPolicy, "connection timeout");
    expect(retried.status).toBe("retrying");
    expect(retried.retryCount).toBe(1);
    expect(retried.nextRetryAt).toBeInstanceOf(Date);
    expect(retried.error).toBe("connection timeout");
  });

  it("sends to dead letter when max retries exceeded", () => {
    const event = makeEvent({ status: "failed", retryCount: 3 });
    const result = scheduleRetry(event, defaultRetryPolicy, "still failing");
    expect(result.status).toBe("dead_letter");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sendToDeadLetter
// ─────────────────────────────────────────────────────────────────────────────

describe("sendToDeadLetter", () => {
  it("creates dead letter entry", () => {
    const event = makeEvent({ status: "failed" });
    const entry = sendToDeadLetter(event, "Too many retries");
    expect(entry.event.status).toBe("dead_letter");
    expect(entry.reason).toBe("Too many retries");
    expect(entry.deadLetteredAt).toBeInstanceOf(Date);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getEventsForRetry
// ─────────────────────────────────────────────────────────────────────────────

describe("getEventsForRetry", () => {
  it("returns events due for retry", () => {
    const past = new Date(Date.now() - 5000);
    const future = new Date(Date.now() + 60_000);
    const events = [
      makeEvent({ id: "e1", status: "retrying", nextRetryAt: past }),
      makeEvent({ id: "e2", status: "retrying", nextRetryAt: future }),
      makeEvent({ id: "e3", status: "delivered" }),
    ];
    const due = getEventsForRetry(events);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe("e1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractPayloadSubset
// ─────────────────────────────────────────────────────────────────────────────

describe("extractPayloadSubset", () => {
  it("returns full payload when no path", () => {
    const payload = { a: 1, b: 2 };
    expect(extractPayloadSubset(payload)).toEqual({ a: 1, b: 2 });
  });

  it("extracts nested value by path", () => {
    const payload = { repository: { name: "myrepo" } };
    expect(extractPayloadSubset(payload, "repository.name")).toBe("myrepo");
  });

  it("returns undefined for missing path", () => {
    expect(extractPayloadSubset({ a: 1 }, "b.c")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeHeaders
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizeHeaders", () => {
  it("lowercases all header keys", () => {
    const normalized = normalizeHeaders({
      "Content-Type": "application/json",
      "X-Hub-Signature": "sha256=abc",
    });
    expect(normalized["content-type"]).toBe("application/json");
    expect(normalized["x-hub-signature"]).toBe("sha256=abc");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractSignature
// ─────────────────────────────────────────────────────────────────────────────

describe("extractSignature", () => {
  it("extracts GitHub signature", () => {
    const sig = extractSignature({ "x-hub-signature-256": "sha256=abc" });
    expect(sig?.provider).toBe("github");
    expect(sig?.signature).toBe("sha256=abc");
  });

  it("extracts Stripe signature", () => {
    const sig = extractSignature({ "stripe-signature": "t=123,v1=abc" });
    expect(sig?.provider).toBe("stripe");
  });

  it("returns null when no signature header", () => {
    expect(extractSignature({ "content-type": "application/json" })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeWebhookStats
// ─────────────────────────────────────────────────────────────────────────────

describe("computeWebhookStats", () => {
  it("computes correct stats", () => {
    const events = [
      makeEvent({ status: "delivered" }),
      makeEvent({ status: "delivered" }),
      makeEvent({ status: "failed" }),
      makeEvent({ status: "retrying", retryCount: 2 }),
      makeEvent({ status: "dead_letter" }),
      makeEvent({ status: "duplicate" }),
    ];
    const stats = computeWebhookStats(events);
    expect(stats.total).toBe(6);
    expect(stats.delivered).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.retrying).toBe(1);
    expect(stats.deadLetter).toBe(1);
    expect(stats.duplicates).toBe(1);
    expect(stats.deliveryRate).toBe(40); // 2/5 non-duplicates
    expect(stats.avgRetries).toBe(2);
  });

  it("handles empty events", () => {
    const stats = computeWebhookStats([]);
    expect(stats.total).toBe(0);
    expect(stats.deliveryRate).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// groupEventsBySource / groupEventsByType
// ─────────────────────────────────────────────────────────────────────────────

describe("groupEventsBySource", () => {
  it("groups by source", () => {
    const events = [
      makeEvent({ source: "github" }),
      makeEvent({ source: "github" }),
      makeEvent({ source: "stripe" }),
    ];
    const grouped = groupEventsBySource(events);
    expect(grouped["github"]).toHaveLength(2);
    expect(grouped["stripe"]).toHaveLength(1);
  });
});

describe("groupEventsByType", () => {
  it("groups by event type", () => {
    const events = [
      makeEvent({ type: "push" }),
      makeEvent({ type: "push" }),
      makeEvent({ type: "pull_request" }),
    ];
    const grouped = groupEventsByType(events);
    expect(grouped["push"]).toHaveLength(2);
    expect(grouped["pull_request"]).toHaveLength(1);
  });
});
