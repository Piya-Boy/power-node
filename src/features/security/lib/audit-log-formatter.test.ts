/**
 * Phase 47 — Tests for audit-log-formatter.ts
 */

import { describe, it, expect } from "vitest";
import {
  createAuditEvent,
  formatAuditEvent,
  formatAuditEventJson,
  formatAuditEventCef,
  formatAuditEventLeef,
  maskSensitiveFields,
  redactPii,
  filterAuditEvents,
  groupAuditEvents,
  computeAuditStats,
  detectAnomalies,
  generateAuditReport,
  exportAuditLog,
  type AuditEvent,
} from "./audit-log-formatter";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return createAuditEvent({
    id: "evt-1",
    timestamp: "2025-03-01T10:00:00.000Z",
    action: "user.login",
    actor: {
      id: "user-1",
      type: "user",
      email: "alice@example.com",
      ip: "192.168.1.1",
    },
    resource: { type: "auth", id: "session-1", name: "Session" },
    outcome: "success",
    severity: "low",
    ...overrides,
  });
}

function makeEvents(count: number, overrides: Partial<AuditEvent> = {}): AuditEvent[] {
  return Array.from({ length: count }, (_, i) =>
    makeEvent({ id: `evt-${i + 1}`, ...overrides })
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// createAuditEvent
// ─────────────────────────────────────────────────────────────────────────────

describe("createAuditEvent", () => {
  it("creates an event with the provided fields", () => {
    const e = makeEvent();
    expect(e.action).toBe("user.login");
    expect(e.outcome).toBe("success");
    expect(e.severity).toBe("low");
  });

  it("auto-generates id when not provided", () => {
    const e = createAuditEvent({
      action: "x",
      actor: { id: "u1", type: "user" },
      resource: { type: "r", id: "r1" },
      outcome: "success",
      severity: "low",
    });
    expect(typeof e.id).toBe("string");
    expect(e.id.length).toBeGreaterThan(0);
  });

  it("auto-generates timestamp when not provided", () => {
    const e = createAuditEvent({
      action: "x",
      actor: { id: "u1", type: "user" },
      resource: { type: "r", id: "r1" },
      outcome: "success",
      severity: "low",
    });
    expect(() => new Date(e.timestamp)).not.toThrow();
  });

  it("preserves provided id and timestamp", () => {
    const e = makeEvent({ id: "fixed-id", timestamp: "2024-01-01T00:00:00.000Z" });
    expect(e.id).toBe("fixed-id");
    expect(e.timestamp).toBe("2024-01-01T00:00:00.000Z");
  });

  it("preserves optional metadata", () => {
    const e = makeEvent({ metadata: { workflowId: "wf-1" } });
    expect(e.metadata?.workflowId).toBe("wf-1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatAuditEvent
// ─────────────────────────────────────────────────────────────────────────────

describe("formatAuditEvent", () => {
  it("includes the timestamp", () => {
    const e = makeEvent();
    const formatted = formatAuditEvent(e);
    expect(formatted).toContain("2025-03-01T10:00:00.000Z");
  });

  it("includes the actor email", () => {
    const e = makeEvent();
    const formatted = formatAuditEvent(e);
    expect(formatted).toContain("alice@example.com");
  });

  it("includes the IP address", () => {
    const e = makeEvent();
    const formatted = formatAuditEvent(e);
    expect(formatted).toContain("192.168.1.1");
  });

  it("includes the action", () => {
    const e = makeEvent();
    const formatted = formatAuditEvent(e);
    expect(formatted).toContain("user.login");
  });

  it("includes the outcome", () => {
    const e = makeEvent();
    const formatted = formatAuditEvent(e);
    expect(formatted).toContain("success");
  });

  it("includes the severity in uppercase", () => {
    const e = makeEvent({ severity: "high" });
    const formatted = formatAuditEvent(e);
    expect(formatted).toContain("HIGH");
  });

  it("uses actor id when no email is provided", () => {
    const e = makeEvent({ actor: { id: "svc-1", type: "service" } });
    const formatted = formatAuditEvent(e);
    expect(formatted).toContain("svc-1");
  });

  it("uses resource name when available", () => {
    const e = makeEvent();
    const formatted = formatAuditEvent(e);
    expect(formatted).toContain("Session");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatAuditEventJson
// ─────────────────────────────────────────────────────────────────────────────

describe("formatAuditEventJson", () => {
  it("returns valid JSON", () => {
    const e = makeEvent();
    expect(() => JSON.parse(formatAuditEventJson(e))).not.toThrow();
  });

  it("JSON contains event id", () => {
    const e = makeEvent();
    const json = JSON.parse(formatAuditEventJson(e));
    expect(json.id).toBe("evt-1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatAuditEventCef
// ─────────────────────────────────────────────────────────────────────────────

describe("formatAuditEventCef", () => {
  it("starts with CEF:0", () => {
    const e = makeEvent();
    expect(formatAuditEventCef(e)).toMatch(/^CEF:0/);
  });

  it("includes PowerNode as vendor", () => {
    const e = makeEvent();
    expect(formatAuditEventCef(e)).toContain("PowerNode");
  });

  it("includes action in the format", () => {
    const e = makeEvent();
    expect(formatAuditEventCef(e)).toContain("user.login");
  });

  it("maps severity to numeric value", () => {
    const low = formatAuditEventCef(makeEvent({ severity: "low" }));
    const critical = formatAuditEventCef(makeEvent({ severity: "critical" }));
    expect(low).toContain("|3|");
    expect(critical).toContain("|10|");
  });

  it("includes actor info in extension", () => {
    const e = makeEvent();
    const cef = formatAuditEventCef(e);
    expect(cef).toContain("suid=user-1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatAuditEventLeef
// ─────────────────────────────────────────────────────────────────────────────

describe("formatAuditEventLeef", () => {
  it("starts with LEEF:2.0", () => {
    const e = makeEvent();
    expect(formatAuditEventLeef(e)).toMatch(/^LEEF:2\.0/);
  });

  it("includes PowerNode as vendor", () => {
    const e = makeEvent();
    expect(formatAuditEventLeef(e)).toContain("PowerNode");
  });

  it("includes action in LEEF output", () => {
    const e = makeEvent();
    expect(formatAuditEventLeef(e)).toContain("user.login");
  });

  it("includes severity field", () => {
    const e = makeEvent({ severity: "high" });
    const leef = formatAuditEventLeef(e);
    expect(leef).toContain("severity=high");
  });

  it("uses tab as attribute separator", () => {
    const e = makeEvent();
    const leef = formatAuditEventLeef(e);
    // after the header section, attributes should be tab-separated
    const extPart = leef.split("|").slice(5).join("|");
    expect(extPart).toContain("\t");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// maskSensitiveFields
// ─────────────────────────────────────────────────────────────────────────────

describe("maskSensitiveFields", () => {
  it("masks password in metadata", () => {
    const e = makeEvent({ metadata: { password: "hunter2" } });
    const masked = maskSensitiveFields(e);
    expect(masked.metadata?.password).toBe("***");
  });

  it("masks token in metadata", () => {
    const e = makeEvent({ metadata: { token: "secret-token" } });
    const masked = maskSensitiveFields(e);
    expect(masked.metadata?.token).toBe("***");
  });

  it("does not mask non-sensitive fields", () => {
    const e = makeEvent({ metadata: { workflowId: "wf-1", token: "tkn" } });
    const masked = maskSensitiveFields(e);
    expect(masked.metadata?.workflowId).toBe("wf-1");
  });

  it("returns event unchanged when no metadata", () => {
    const e = makeEvent({ metadata: undefined });
    const masked = maskSensitiveFields(e);
    expect(masked.metadata).toBeUndefined();
  });

  it("does not mutate original event", () => {
    const e = makeEvent({ metadata: { password: "secret" } });
    maskSensitiveFields(e);
    expect(e.metadata?.password).toBe("secret");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// redactPii
// ─────────────────────────────────────────────────────────────────────────────

describe("redactPii", () => {
  it("redacts actor email", () => {
    const e = makeEvent();
    const redacted = redactPii(e);
    expect(redacted.actor.email).toBe("[REDACTED_EMAIL]");
  });

  it("redacts actor IP", () => {
    const e = makeEvent();
    const redacted = redactPii(e);
    expect(redacted.actor.ip).toBe("[REDACTED_IP]");
  });

  it("leaves actor without email unchanged", () => {
    const e = makeEvent({ actor: { id: "u1", type: "service" } });
    const redacted = redactPii(e);
    expect(redacted.actor.email).toBeUndefined();
  });

  it("redacts email patterns in metadata strings", () => {
    const e = makeEvent({ metadata: { note: "contact john@test.com for help" } });
    const redacted = redactPii(e);
    expect(redacted.metadata?.note).toContain("[REDACTED]");
    expect(redacted.metadata?.note).not.toContain("john@test.com");
  });

  it("does not mutate original event", () => {
    const e = makeEvent();
    redactPii(e);
    expect(e.actor.email).toBe("alice@example.com");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// filterAuditEvents
// ─────────────────────────────────────────────────────────────────────────────

describe("filterAuditEvents", () => {
  const events = [
    makeEvent({ id: "e1", timestamp: "2025-01-01T00:00:00.000Z", action: "user.login", outcome: "success", severity: "low", actor: { id: "u1", type: "user", email: "a@b.com", ip: "1.1.1.1" } }),
    makeEvent({ id: "e2", timestamp: "2025-02-01T00:00:00.000Z", action: "workflow.delete", outcome: "failure", severity: "high", actor: { id: "u2", type: "user", ip: "2.2.2.2" } }),
    makeEvent({ id: "e3", timestamp: "2025-03-01T00:00:00.000Z", action: "user.login", outcome: "failure", severity: "medium", actor: { id: "u1", type: "user", ip: "1.1.1.1" } }),
  ];

  it("filters by userId", () => {
    const r = filterAuditEvents(events, { userId: "u1" });
    expect(r.every((e) => e.actor.id === "u1")).toBe(true);
    expect(r).toHaveLength(2);
  });

  it("filters by action substring", () => {
    const r = filterAuditEvents(events, { action: "workflow" });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("e2");
  });

  it("filters by outcome", () => {
    const r = filterAuditEvents(events, { outcome: "failure" });
    expect(r.every((e) => e.outcome === "failure")).toBe(true);
    expect(r).toHaveLength(2);
  });

  it("filters by severity", () => {
    const r = filterAuditEvents(events, { severity: "high" });
    expect(r).toHaveLength(1);
  });

  it("filters by fromDate", () => {
    const r = filterAuditEvents(events, { fromDate: "2025-02-01T00:00:00.000Z" });
    expect(r.every((e) => e.timestamp >= "2025-02-01T00:00:00.000Z")).toBe(true);
  });

  it("filters by toDate", () => {
    const r = filterAuditEvents(events, { toDate: "2025-01-31T23:59:59.999Z" });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("e1");
  });

  it("filters by IP address", () => {
    const r = filterAuditEvents(events, { ip: "1.1.1.1" });
    expect(r.every((e) => e.actor.ip === "1.1.1.1")).toBe(true);
  });

  it("returns all events with empty filter", () => {
    const r = filterAuditEvents(events, {});
    expect(r).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// groupAuditEvents
// ─────────────────────────────────────────────────────────────────────────────

describe("groupAuditEvents", () => {
  const events = makeEvents(4, {}).map((e, i) => ({
    ...e,
    action: i < 2 ? "user.login" : "workflow.execute",
    outcome: (i % 2 === 0 ? "success" : "failure") as "success" | "failure",
    severity: (i < 2 ? "low" : "high") as "low" | "high",
  }));

  it("groups by action", () => {
    const groups = groupAuditEvents(events, "action");
    expect(Object.keys(groups)).toHaveLength(2);
    expect(groups["user.login"]).toHaveLength(2);
  });

  it("groups by outcome", () => {
    const groups = groupAuditEvents(events, "outcome");
    expect(groups["success"]).toBeDefined();
    expect(groups["failure"]).toBeDefined();
  });

  it("groups by severity", () => {
    const groups = groupAuditEvents(events, "severity");
    expect(groups["low"]).toHaveLength(2);
    expect(groups["high"]).toHaveLength(2);
  });

  it("groups by date", () => {
    const e1 = makeEvent({ timestamp: "2025-01-01T10:00:00.000Z" });
    const e2 = makeEvent({ timestamp: "2025-01-02T10:00:00.000Z" });
    const groups = groupAuditEvents([e1, e2], "date");
    expect(groups["2025-01-01"]).toHaveLength(1);
    expect(groups["2025-01-02"]).toHaveLength(1);
  });

  it("groups by actor.id", () => {
    const e1 = makeEvent({ actor: { id: "u1", type: "user" } });
    const e2 = makeEvent({ actor: { id: "u2", type: "user" } });
    const e3 = makeEvent({ actor: { id: "u1", type: "user" } });
    const groups = groupAuditEvents([e1, e2, e3], "actor.id");
    expect(groups["u1"]).toHaveLength(2);
    expect(groups["u2"]).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeAuditStats
// ─────────────────────────────────────────────────────────────────────────────

describe("computeAuditStats", () => {
  const period = { from: "2025-01-01T00:00:00.000Z", to: "2025-12-31T23:59:59.999Z" };
  const events = [
    makeEvent({ id: "e1", action: "user.login", outcome: "success", severity: "low", actor: { id: "u1", type: "user" } }),
    makeEvent({ id: "e2", action: "user.login", outcome: "failure", severity: "medium", actor: { id: "u2", type: "user" } }),
    makeEvent({ id: "e3", action: "workflow.delete", outcome: "success", severity: "high", actor: { id: "u1", type: "user" } }),
  ];

  const stats = computeAuditStats(events, period);

  it("counts total events", () => {
    expect(stats.total).toBe(3);
  });

  it("counts by outcome", () => {
    expect(stats.byOutcome.success).toBe(2);
    expect(stats.byOutcome.failure).toBe(1);
  });

  it("counts by severity", () => {
    expect(stats.bySeverity.low).toBe(1);
    expect(stats.bySeverity.medium).toBe(1);
    expect(stats.bySeverity.high).toBe(1);
  });

  it("counts by action", () => {
    expect(stats.byAction["user.login"]).toBe(2);
    expect(stats.byAction["workflow.delete"]).toBe(1);
  });

  it("counts by actor", () => {
    expect(stats.byActor["u1"]).toBe(2);
    expect(stats.byActor["u2"]).toBe(1);
  });

  it("computes success rate", () => {
    expect(stats.successRate).toBeCloseTo(2 / 3);
  });

  it("preserves the period", () => {
    expect(stats.period.from).toBe(period.from);
  });

  it("handles empty events", () => {
    const s = computeAuditStats([], period);
    expect(s.total).toBe(0);
    expect(s.successRate).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectAnomalies
// ─────────────────────────────────────────────────────────────────────────────

describe("detectAnomalies", () => {
  it("detects brute-force login attempts", () => {
    const events: AuditEvent[] = Array.from({ length: 6 }, (_, i) =>
      makeEvent({
        id: `e${i}`,
        action: "user.login",
        outcome: "failure",
        timestamp: "2025-03-01T10:00:00.000Z",
        actor: { id: "u1", type: "user", ip: "1.1.1.1" },
      })
    );
    const anomalies = detectAnomalies(events, { failedLoginsPerMinute: 5 });
    expect(anomalies.some((a) => a.type === "brute_force")).toBe(true);
  });

  it("does not flag normal login activity", () => {
    const events = [makeEvent({ action: "user.login", outcome: "failure" })];
    const anomalies = detectAnomalies(events, { failedLoginsPerMinute: 5 });
    expect(anomalies.filter((a) => a.type === "brute_force")).toHaveLength(0);
  });

  it("detects action flood", () => {
    const events: AuditEvent[] = Array.from({ length: 65 }, (_, i) =>
      makeEvent({
        id: `e${i}`,
        action: "api.call",
        outcome: "success",
        timestamp: "2025-03-01T10:00:00.000Z",
        actor: { id: "u1", type: "user" },
      })
    );
    const anomalies = detectAnomalies(events, { actionsPerMinute: 60 });
    expect(anomalies.some((a) => a.type === "action_flood")).toBe(true);
  });

  it("detects IP scatter", () => {
    const events: AuditEvent[] = Array.from({ length: 11 }, (_, i) =>
      makeEvent({
        id: `e${i}`,
        action: "user.login",
        outcome: "success",
        timestamp: "2025-03-01T10:00:00.000Z",
        actor: { id: "u1", type: "user", ip: `10.0.0.${i}` },
      })
    );
    const anomalies = detectAnomalies(events, { uniqueIpsPerHour: 10 });
    expect(anomalies.some((a) => a.type === "ip_scatter")).toBe(true);
  });

  it("returns empty array for normal events", () => {
    const events = [makeEvent(), makeEvent({ id: "e2" })];
    const anomalies = detectAnomalies(events);
    expect(anomalies).toHaveLength(0);
  });

  it("uses default thresholds when none provided", () => {
    // Just 2 failed logins — well below default threshold of 5
    const events = [
      makeEvent({ action: "user.login", outcome: "failure", timestamp: "2025-03-01T10:00:00.000Z" }),
      makeEvent({ id: "e2", action: "user.login", outcome: "failure", timestamp: "2025-03-01T10:00:00.000Z" }),
    ];
    const anomalies = detectAnomalies(events);
    expect(anomalies.filter((a) => a.type === "brute_force")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateAuditReport
// ─────────────────────────────────────────────────────────────────────────────

describe("generateAuditReport", () => {
  const period = { from: "2025-01-01T00:00:00.000Z", to: "2025-12-31T23:59:59.999Z" };
  const events = makeEvents(5);

  it("includes a generatedAt timestamp", () => {
    const report = generateAuditReport(events, { period });
    expect(() => new Date(report.generatedAt)).not.toThrow();
  });

  it("uses default title when not provided", () => {
    const report = generateAuditReport(events, { period });
    expect(report.title).toBe("Audit Log Report");
  });

  it("uses custom title when provided", () => {
    const report = generateAuditReport(events, { title: "Security Review", period });
    expect(report.title).toBe("Security Review");
  });

  it("includes summary with event count", () => {
    const report = generateAuditReport(events, { period });
    expect(report.summary).toContain("5 events");
  });

  it("includes stats", () => {
    const report = generateAuditReport(events, { period });
    expect(report.stats.total).toBe(5);
  });

  it("includes topActions list", () => {
    const report = generateAuditReport(events, { period });
    expect(Array.isArray(report.topActions)).toBe(true);
  });

  it("includes topActors list", () => {
    const report = generateAuditReport(events, { period });
    expect(Array.isArray(report.topActors)).toBe(true);
  });

  it("includes anomalies array", () => {
    const report = generateAuditReport(events, { period });
    expect(Array.isArray(report.anomalies)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// exportAuditLog
// ─────────────────────────────────────────────────────────────────────────────

describe("exportAuditLog", () => {
  const events = makeEvents(3);

  it("exports valid JSON array", () => {
    const output = exportAuditLog(events, "json");
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
  });

  it("exports CEF lines (one per event)", () => {
    const output = exportAuditLog(events, "cef");
    const lines = output.split("\n").filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.startsWith("CEF:0"))).toBe(true);
  });

  it("exports CSV with header row", () => {
    const output = exportAuditLog(events, "csv");
    const lines = output.split("\n");
    expect(lines[0]).toContain("id,timestamp,action");
    expect(lines).toHaveLength(4); // header + 3 events
  });

  it("CSV rows contain event data", () => {
    const output = exportAuditLog(events, "csv");
    const lines = output.split("\n");
    expect(lines[1]).toContain("user.login");
  });

  it("exports empty JSON array for empty events", () => {
    const output = exportAuditLog([], "json");
    expect(JSON.parse(output)).toEqual([]);
  });
});
