import { describe, it, expect, beforeEach } from "vitest";
import {
  createEntry,
  resetIdCounter,
  filterEntries,
  getEntriesInRange,
  getActorHistory,
  getResourceHistory,
  getDeniedEntries,
  sortEntries,
  detectAnomalies,
  summarizeEntries,
  paginateEntries,
  applyRetention,
  type AccessLogEntry,
} from "./access-log";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => resetIdCounter());

function makeEntry(overrides: Partial<AccessLogEntry> = {}): AccessLogEntry {
  return createEntry({
    actorId: "user1",
    actorType: "user",
    action: "view",
    resourceType: "workflow",
    resourceId: "wf1",
    outcome: "success",
    timestamp: new Date("2025-06-01T10:00:00Z"),
    ...overrides,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// createEntry
// ─────────────────────────────────────────────────────────────────────────────

describe("createEntry", () => {
  it("creates entry with auto-id", () => {
    const e = makeEntry();
    expect(e.id).toBe("log_1");
  });

  it("uses provided id", () => {
    const e = makeEntry({ id: "custom_id" });
    expect(e.id).toBe("custom_id");
  });

  it("increments id counter", () => {
    const e1 = makeEntry();
    const e2 = makeEntry();
    expect(e1.id).toBe("log_1");
    expect(e2.id).toBe("log_2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// filterEntries
// ─────────────────────────────────────────────────────────────────────────────

describe("filterEntries", () => {
  const entries = [
    makeEntry({ actorId: "u1", action: "view", outcome: "success", resourceType: "workflow", ipAddress: "1.2.3.4" }),
    makeEntry({ actorId: "u2", action: "delete", outcome: "denied", resourceType: "credential", ipAddress: "5.6.7.8" }),
    makeEntry({ actorId: "u1", action: "execute", outcome: "error", resourceType: "workflow" }),
  ];

  it("filters by actorId", () => {
    expect(filterEntries(entries, { actorId: "u1" })).toHaveLength(2);
  });

  it("filters by action", () => {
    expect(filterEntries(entries, { actions: ["delete"] })).toHaveLength(1);
  });

  it("filters by outcome", () => {
    expect(filterEntries(entries, { outcomes: ["denied", "error"] })).toHaveLength(2);
  });

  it("filters by resourceType", () => {
    expect(filterEntries(entries, { resourceTypes: ["credential"] })).toHaveLength(1);
  });

  it("filters by ipAddress", () => {
    expect(filterEntries(entries, { ipAddress: "1.2.3.4" })).toHaveLength(1);
  });

  it("filters by time range", () => {
    const timestampedEntries = [
      makeEntry({ timestamp: new Date("2025-06-01T08:00:00Z") }),
      makeEntry({ timestamp: new Date("2025-06-01T12:00:00Z") }),
      makeEntry({ timestamp: new Date("2025-06-01T16:00:00Z") }),
    ];
    const filtered = filterEntries(timestampedEntries, {
      from: new Date("2025-06-01T10:00:00Z"),
      to: new Date("2025-06-01T14:00:00Z"),
    });
    expect(filtered).toHaveLength(1);
  });

  it("filters by search in reason", () => {
    const e = makeEntry({ reason: "IP not in allowlist" });
    expect(filterEntries([e], { search: "allowlist" })).toHaveLength(1);
    expect(filterEntries([e], { search: "unknown" })).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getEntriesInRange
// ─────────────────────────────────────────────────────────────────────────────

describe("getEntriesInRange", () => {
  it("returns entries in inclusive range", () => {
    const entries = [
      makeEntry({ timestamp: new Date("2025-06-01T00:00:00Z") }),
      makeEntry({ timestamp: new Date("2025-06-01T12:00:00Z") }),
      makeEntry({ timestamp: new Date("2025-06-02T00:00:00Z") }),
    ];
    const result = getEntriesInRange(
      entries,
      new Date("2025-06-01T00:00:00Z"),
      new Date("2025-06-01T12:00:00Z")
    );
    expect(result).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getActorHistory / getResourceHistory / getDeniedEntries
// ─────────────────────────────────────────────────────────────────────────────

describe("getActorHistory", () => {
  it("returns entries for specific actor", () => {
    const entries = [makeEntry({ actorId: "u1" }), makeEntry({ actorId: "u2" })];
    expect(getActorHistory(entries, "u1")).toHaveLength(1);
  });
});

describe("getResourceHistory", () => {
  it("returns entries for specific resource", () => {
    const entries = [
      makeEntry({ resourceType: "workflow", resourceId: "wf1" }),
      makeEntry({ resourceType: "workflow", resourceId: "wf2" }),
      makeEntry({ resourceType: "credential", resourceId: "wf1" }),
    ];
    expect(getResourceHistory(entries, "workflow", "wf1")).toHaveLength(1);
  });
});

describe("getDeniedEntries", () => {
  it("returns only denied entries", () => {
    const entries = [
      makeEntry({ outcome: "success" }),
      makeEntry({ outcome: "denied" }),
      makeEntry({ outcome: "denied" }),
    ];
    expect(getDeniedEntries(entries)).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sortEntries
// ─────────────────────────────────────────────────────────────────────────────

describe("sortEntries", () => {
  const entries = [
    makeEntry({ timestamp: new Date("2025-06-01T10:00:00Z") }),
    makeEntry({ timestamp: new Date("2025-06-03T10:00:00Z") }),
    makeEntry({ timestamp: new Date("2025-06-02T10:00:00Z") }),
  ];

  it("sorts newest first by default", () => {
    const sorted = sortEntries(entries);
    expect(sorted[0].timestamp.toISOString()).toBe("2025-06-03T10:00:00.000Z");
  });

  it("sorts oldest first with asc", () => {
    const sorted = sortEntries(entries, "asc");
    expect(sorted[0].timestamp.toISOString()).toBe("2025-06-01T10:00:00.000Z");
  });

  it("does not mutate input", () => {
    sortEntries(entries);
    expect(entries[0].timestamp.toISOString()).toBe("2025-06-01T10:00:00.000Z");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectAnomalies
// ─────────────────────────────────────────────────────────────────────────────

describe("detectAnomalies", () => {
  it("detects high denial rate", () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ actorId: "u1", outcome: i < 7 ? "denied" : "success" })
    );
    const anomalies = detectAnomalies(entries, { denialRateThreshold: 50 });
    expect(anomalies.some((a) => a.type === "high_denial_rate" && a.actorId === "u1")).toBe(true);
  });

  it("detects rapid access", () => {
    // 25 requests within 1 minute window
    const base = new Date("2025-06-01T10:00:00Z");
    const entries = Array.from({ length: 25 }, (_, i) =>
      makeEntry({
        actorId: "u1",
        timestamp: new Date(base.getTime() + i * 2000), // 2s apart = 25 in 50s
      })
    );
    const anomalies = detectAnomalies(entries, { rapidAccessThreshold: 20 });
    expect(anomalies.some((a) => a.type === "rapid_access" && a.actorId === "u1")).toBe(true);
  });

  it("detects bulk delete", () => {
    const entries = Array.from({ length: 6 }, () =>
      makeEntry({ actorId: "u1", action: "delete" })
    );
    const anomalies = detectAnomalies(entries, { bulkDeleteThreshold: 5 });
    expect(anomalies.some((a) => a.type === "bulk_delete")).toBe(true);
  });

  it("detects unusual IP", () => {
    const entries = [makeEntry({ actorId: "u1", ipAddress: "9.9.9.9" })];
    const anomalies = detectAnomalies(entries, { knownIpAddresses: ["1.1.1.1"] });
    expect(anomalies.some((a) => a.type === "unusual_ip")).toBe(true);
  });

  it("no anomalies for normal traffic", () => {
    const entries = [makeEntry({ outcome: "success" }), makeEntry({ outcome: "success" })];
    expect(detectAnomalies(entries)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summarizeEntries
// ─────────────────────────────────────────────────────────────────────────────

describe("summarizeEntries", () => {
  it("returns zeros for empty entries", () => {
    const summary = summarizeEntries([]);
    expect(summary.totalEvents).toBe(0);
    expect(summary.denialRate).toBe(0);
  });

  it("counts outcomes correctly", () => {
    const entries = [
      makeEntry({ outcome: "success" }),
      makeEntry({ outcome: "success" }),
      makeEntry({ outcome: "denied" }),
      makeEntry({ outcome: "error" }),
    ];
    const summary = summarizeEntries(entries);
    expect(summary.successCount).toBe(2);
    expect(summary.deniedCount).toBe(1);
    expect(summary.errorCount).toBe(1);
    expect(summary.denialRate).toBe(25);
  });

  it("counts unique actors and resources", () => {
    const entries = [
      makeEntry({ actorId: "u1", resourceId: "wf1" }),
      makeEntry({ actorId: "u2", resourceId: "wf1" }),
      makeEntry({ actorId: "u1", resourceId: "wf2" }),
    ];
    const summary = summarizeEntries(entries);
    expect(summary.uniqueActors).toBe(2);
    expect(summary.uniqueResources).toBe(2);
  });

  it("ranks top actions", () => {
    const entries = [
      makeEntry({ action: "view" }),
      makeEntry({ action: "view" }),
      makeEntry({ action: "execute" }),
    ];
    const summary = summarizeEntries(entries);
    expect(summary.topActions[0].action).toBe("view");
    expect(summary.topActions[0].count).toBe(2);
  });

  it("ranks top actors", () => {
    const entries = [
      makeEntry({ actorId: "u1" }),
      makeEntry({ actorId: "u1" }),
      makeEntry({ actorId: "u2" }),
    ];
    const summary = summarizeEntries(entries);
    expect(summary.topActors[0].actorId).toBe("u1");
    expect(summary.topActors[0].count).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// paginateEntries
// ─────────────────────────────────────────────────────────────────────────────

describe("paginateEntries", () => {
  const entries = Array.from({ length: 25 }, (_, i) => makeEntry({ resourceId: `r${i}` }));

  it("returns first page", () => {
    const result = paginateEntries(entries, 1, 10);
    expect(result.entries).toHaveLength(10);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(3);
    expect(result.hasNext).toBe(true);
    expect(result.hasPrev).toBe(false);
  });

  it("returns last page with remaining items", () => {
    const result = paginateEntries(entries, 3, 10);
    expect(result.entries).toHaveLength(5);
    expect(result.hasNext).toBe(false);
    expect(result.hasPrev).toBe(true);
  });

  it("clamps to valid page range", () => {
    const result = paginateEntries(entries, 99, 10);
    expect(result.page).toBe(3); // last valid page
  });

  it("handles empty entries", () => {
    const result = paginateEntries([], 1, 10);
    expect(result.totalPages).toBe(1);
    expect(result.entries).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyRetention
// ─────────────────────────────────────────────────────────────────────────────

describe("applyRetention", () => {
  it("removes entries older than retention period", () => {
    const now = Date.now();
    const entries = [
      makeEntry({ timestamp: new Date(now - 100 * 86_400_000) }), // 100 days ago
      makeEntry({ timestamp: new Date(now - 20 * 86_400_000) }),  // 20 days ago
      makeEntry({ timestamp: new Date(now - 5 * 86_400_000) }),   // 5 days ago
    ];
    const { retained, purged } = applyRetention(entries, 30);
    expect(retained).toHaveLength(2);
    expect(purged).toBe(1);
  });

  it("retains all when nothing is old", () => {
    const entries = [makeEntry({ timestamp: new Date() })];
    const { purged } = applyRetention(entries, 90);
    expect(purged).toBe(0);
  });
});
