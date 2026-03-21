import { describe, it, expect } from "vitest";
import {
  createAuditEntry,
  filterAuditLog,
  sortAuditLog,
  getAuditStats,
  formatAuditEntry,
  getRecentFailures,
  detectBruteForce,
  type AuditEntry,
} from "./audit-log";

const makeEntry = (overrides: Partial<AuditEntry> = {}): AuditEntry => ({
  id: "audit-1",
  action: "workflow.create",
  severity: "info",
  userId: "user-1",
  userEmail: "user@example.com",
  resourceType: "workflow",
  resourceId: "wf-1",
  resourceName: "My Workflow",
  timestamp: new Date("2026-01-01T10:00:00Z"),
  success: true,
  ...overrides,
});

describe("createAuditEntry", () => {
  it("creates an entry with default success=true", () => {
    const entry = createAuditEntry({
      action: "workflow.create",
      userId: "user-1",
      resourceType: "workflow",
    });
    expect(entry.action).toBe("workflow.create");
    expect(entry.success).toBe(true);
    expect(entry.severity).toBe("info");
    expect(entry.timestamp).toBeInstanceOf(Date);
    expect(entry.id).toBeTruthy();
  });

  it("assigns critical severity to auth.login_failed", () => {
    const entry = createAuditEntry({
      action: "auth.login_failed",
      userId: "user-1",
      resourceType: "auth",
      success: false,
    });
    expect(entry.severity).toBe("critical");
    expect(entry.success).toBe(false);
  });

  it("assigns warning severity to workflow.delete", () => {
    const entry = createAuditEntry({
      action: "workflow.delete",
      userId: "user-1",
      resourceType: "workflow",
    });
    expect(entry.severity).toBe("warning");
  });
});

describe("filterAuditLog", () => {
  const entries: AuditEntry[] = [
    makeEntry({ id: "1", userId: "user-1", action: "workflow.create", resourceType: "workflow" }),
    makeEntry({ id: "2", userId: "user-2", action: "credential.delete", resourceType: "credential", severity: "warning" }),
    makeEntry({ id: "3", userId: "user-1", action: "auth.login_failed", severity: "critical", success: false }),
  ];

  it("filters by userId", () => {
    expect(filterAuditLog(entries, { userId: "user-1" })).toHaveLength(2);
  });

  it("filters by action", () => {
    expect(filterAuditLog(entries, { action: "workflow.create" })).toHaveLength(1);
  });

  it("filters by success=false", () => {
    expect(filterAuditLog(entries, { success: false })).toHaveLength(1);
  });

  it("filters by severity", () => {
    expect(filterAuditLog(entries, { severity: "critical" })).toHaveLength(1);
  });

  it("filters by date range", () => {
    const from = new Date("2025-12-31T00:00:00Z");
    const to = new Date("2026-01-02T00:00:00Z");
    expect(filterAuditLog(entries, { from, to })).toHaveLength(3);
  });

  it("filters by resourceType", () => {
    expect(filterAuditLog(entries, { resourceType: "credential" })).toHaveLength(1);
  });
});

describe("sortAuditLog", () => {
  const entries: AuditEntry[] = [
    makeEntry({ id: "1", timestamp: new Date("2026-01-01T10:00:00Z") }),
    makeEntry({ id: "2", timestamp: new Date("2026-01-03T10:00:00Z") }),
    makeEntry({ id: "3", timestamp: new Date("2026-01-02T10:00:00Z") }),
  ];

  it("sorts newest first by default", () => {
    const sorted = sortAuditLog(entries);
    expect(sorted[0].id).toBe("2");
    expect(sorted[2].id).toBe("1");
  });

  it("sorts oldest first with asc", () => {
    const sorted = sortAuditLog(entries, "asc");
    expect(sorted[0].id).toBe("1");
    expect(sorted[2].id).toBe("2");
  });
});

describe("getAuditStats", () => {
  const entries: AuditEntry[] = [
    makeEntry({ userId: "user-1", action: "workflow.create", success: true }),
    makeEntry({ userId: "user-1", action: "workflow.delete", success: true, severity: "warning" }),
    makeEntry({ userId: "user-2", action: "auth.login_failed", success: false, severity: "critical" }),
  ];

  it("counts totals", () => {
    const stats = getAuditStats(entries);
    expect(stats.total).toBe(3);
    expect(stats.successCount).toBe(2);
    expect(stats.failureCount).toBe(1);
    expect(stats.criticalCount).toBe(1);
  });

  it("groups by action", () => {
    const stats = getAuditStats(entries);
    expect(stats.byAction["workflow.create"]).toBe(1);
    expect(stats.byAction["auth.login_failed"]).toBe(1);
  });

  it("groups by user", () => {
    const stats = getAuditStats(entries);
    expect(stats.byUser["user-1"]).toBe(2);
    expect(stats.byUser["user-2"]).toBe(1);
  });
});

describe("formatAuditEntry", () => {
  it("formats entry with resource name", () => {
    const entry = makeEntry();
    const formatted = formatAuditEntry(entry);
    expect(formatted).toContain("workflow.create");
    expect(formatted).toContain("My Workflow");
    expect(formatted).toContain("user@example.com");
    expect(formatted).toContain("✓");
  });

  it("shows ✗ for failed entries", () => {
    const entry = makeEntry({ success: false });
    expect(formatAuditEntry(entry)).toContain("✗");
  });
});

describe("getRecentFailures", () => {
  it("returns only failed entries", () => {
    const entries: AuditEntry[] = [
      makeEntry({ success: true }),
      makeEntry({ success: false, id: "fail-1", timestamp: new Date("2026-01-02T00:00:00Z") }),
      makeEntry({ success: false, id: "fail-2", timestamp: new Date("2026-01-03T00:00:00Z") }),
    ];
    const failures = getRecentFailures(entries, 5);
    expect(failures).toHaveLength(2);
    expect(failures[0].id).toBe("fail-2"); // newest first
  });

  it("respects limit", () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ id: `fail-${i}`, success: false })
    );
    expect(getRecentFailures(entries, 3)).toHaveLength(3);
  });
});

describe("detectBruteForce", () => {
  it("returns false when below threshold", () => {
    const entries: AuditEntry[] = Array.from({ length: 4 }, (_, i) =>
      makeEntry({
        id: `e${i}`,
        userId: "user-1",
        action: "auth.login_failed",
        success: false,
        timestamp: new Date(),
      })
    );
    expect(detectBruteForce(entries, "user-1", 5)).toBe(false);
  });

  it("returns true when at or above threshold", () => {
    const entries: AuditEntry[] = Array.from({ length: 5 }, (_, i) =>
      makeEntry({
        id: `e${i}`,
        userId: "user-1",
        action: "auth.login_failed",
        success: false,
        timestamp: new Date(),
      })
    );
    expect(detectBruteForce(entries, "user-1", 5)).toBe(true);
  });

  it("ignores old entries outside window", () => {
    const oldTimestamp = new Date(Date.now() - 20 * 60 * 1000); // 20 min ago
    const entries: AuditEntry[] = Array.from({ length: 10 }, (_, i) =>
      makeEntry({
        id: `e${i}`,
        userId: "user-1",
        action: "auth.login_failed",
        success: false,
        timestamp: oldTimestamp,
      })
    );
    expect(detectBruteForce(entries, "user-1", 5, 15 * 60 * 1000)).toBe(false);
  });
});
