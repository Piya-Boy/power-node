import { describe, it, expect, beforeEach } from "vitest";
import {
  severityIndex,
  isSeverityAtLeast,
  createEvent,
  matchesRule,
  getMatchingRules,
  isChannelEligible,
  filterEligibleChannels,
  isEventMutedForRecipient,
  getRecipientChannels,
  createRateWindow,
  checkRateLimit,
  createRecord,
  markSent,
  markFailed,
  markSuppressed,
  routeEvent,
  computeNotificationStats,
  getFailedRecords,
  getPendingRecords,
  resetIdSeq,
  type NotificationEvent,
  type ChannelConfig,
  type RecipientPreferences,
  type RoutingRule,
  type NotificationRecord,
} from "./notification-router";

const NOW = 1_700_000_000_000;

beforeEach(() => {
  resetIdSeq();
});

// ─────────────────────────────────────────────────────────────────────────────
// Severity
// ─────────────────────────────────────────────────────────────────────────────

describe("severityIndex", () => {
  it("info < warning < error < critical", () => {
    expect(severityIndex("info")).toBeLessThan(severityIndex("warning"));
    expect(severityIndex("warning")).toBeLessThan(severityIndex("error"));
    expect(severityIndex("error")).toBeLessThan(severityIndex("critical"));
  });
});

describe("isSeverityAtLeast", () => {
  it("true when actual >= min", () => {
    expect(isSeverityAtLeast("error", "warning")).toBe(true);
    expect(isSeverityAtLeast("critical", "critical")).toBe(true);
  });
  it("false when actual < min", () => {
    expect(isSeverityAtLeast("info", "error")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createEvent
// ─────────────────────────────────────────────────────────────────────────────

describe("createEvent", () => {
  it("creates event with auto-id", () => {
    const e = createEvent("workflow.failed", "error", "Workflow Failed", "Details here", { timestamp: NOW });
    expect(e.id).toBe("evt_1");
    expect(e.type).toBe("workflow.failed");
    expect(e.severity).toBe("error");
    expect(e.tags).toEqual([]);
  });

  it("applies options", () => {
    const e = createEvent("node.done", "info", "Done", "body", {
      workflowId: "wf1", tags: ["billing"], timestamp: NOW,
    });
    expect(e.workflowId).toBe("wf1");
    expect(e.tags).toContain("billing");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rule Matching
// ─────────────────────────────────────────────────────────────────────────────

const EVENT: NotificationEvent = {
  id: "e1",
  type: "workflow.failed",
  severity: "error",
  title: "Failed",
  body: "Something went wrong",
  tags: ["billing", "production"],
  metadata: {},
  timestamp: NOW,
  workflowId: "wf1",
};

describe("matchesRule", () => {
  it("matches when no constraints", () => {
    const rule: RoutingRule = { id: "r1", priority: 1, targetChannelIds: [] };
    expect(matchesRule(EVENT, rule)).toBe(true);
  });

  it("matches event type", () => {
    const rule: RoutingRule = { id: "r1", priority: 1, matchEventType: ["workflow.failed"], targetChannelIds: [] };
    expect(matchesRule(EVENT, rule)).toBe(true);
  });

  it("rejects wrong event type", () => {
    const rule: RoutingRule = { id: "r1", priority: 1, matchEventType: ["workflow.success"], targetChannelIds: [] };
    expect(matchesRule(EVENT, rule)).toBe(false);
  });

  it("matches severity", () => {
    const rule: RoutingRule = { id: "r1", priority: 1, matchSeverity: ["error", "critical"], targetChannelIds: [] };
    expect(matchesRule(EVENT, rule)).toBe(true);
  });

  it("matches tags (any)", () => {
    const rule: RoutingRule = { id: "r1", priority: 1, matchTags: ["billing"], targetChannelIds: [] };
    expect(matchesRule(EVENT, rule)).toBe(true);
  });

  it("matches workflowId", () => {
    const rule: RoutingRule = { id: "r1", priority: 1, matchWorkflowId: "wf1", targetChannelIds: [] };
    expect(matchesRule(EVENT, rule)).toBe(true);
  });

  it("rejects wrong workflowId", () => {
    const rule: RoutingRule = { id: "r1", priority: 1, matchWorkflowId: "wf2", targetChannelIds: [] };
    expect(matchesRule(EVENT, rule)).toBe(false);
  });
});

describe("getMatchingRules", () => {
  const rules: RoutingRule[] = [
    { id: "r1", priority: 1, matchSeverity: ["error", "critical"], targetChannelIds: ["ch1"] },
    { id: "r2", priority: 2, matchEventType: ["workflow.failed"], targetChannelIds: ["ch2"] },
    { id: "r3", priority: 3, matchSeverity: ["info"], targetChannelIds: ["ch3"] },
  ];

  it("returns matched rules sorted by priority", () => {
    const matched = getMatchingRules(EVENT, rules);
    expect(matched).toHaveLength(2);
    expect(matched[0].id).toBe("r1");
    expect(matched[1].id).toBe("r2");
  });

  it("stops at stop=true rule", () => {
    const stopRules: RoutingRule[] = [
      { id: "r1", priority: 1, targetChannelIds: ["ch1"], stop: true },
      { id: "r2", priority: 2, targetChannelIds: ["ch2"] },
    ];
    const matched = getMatchingRules(EVENT, stopRules);
    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe("r1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Channel Filtering
// ─────────────────────────────────────────────────────────────────────────────

const CHANNELS: ChannelConfig[] = [
  { id: "email", type: "email", name: "Email", enabled: true, target: "ops@example.com", minSeverity: "warning" },
  { id: "slack", type: "slack", name: "Slack", enabled: true, target: "#alerts" },
  { id: "sms", type: "sms", name: "SMS", enabled: false, target: "+1234567890" },
  { id: "pager", type: "pagerduty", name: "PagerDuty", enabled: true, target: "pd-key", minSeverity: "critical" },
];

describe("isChannelEligible", () => {
  it("false for disabled channel", () => {
    expect(isChannelEligible(CHANNELS[2], EVENT)).toBe(false); // sms disabled
  });

  it("false when severity below minimum", () => {
    expect(isChannelEligible(CHANNELS[3], EVENT)).toBe(false); // pagerduty needs critical, event is error
  });

  it("true when all conditions met", () => {
    expect(isChannelEligible(CHANNELS[0], EVENT)).toBe(true); // email, warning+, event is error
  });
});

describe("filterEligibleChannels", () => {
  it("returns only eligible channels", () => {
    const eligible = filterEligibleChannels(CHANNELS, EVENT);
    expect(eligible.some((c) => c.id === "email")).toBe(true);
    expect(eligible.some((c) => c.id === "slack")).toBe(true);
    expect(eligible.every((c) => c.enabled)).toBe(true);
    expect(eligible.some((c) => c.id === "pager")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Recipient Preferences
// ─────────────────────────────────────────────────────────────────────────────

describe("isEventMutedForRecipient", () => {
  const prefs: RecipientPreferences = {
    userId: "u1",
    channels: ["email"],
    mutedEventTypes: ["workflow.success"],
    mutedSeverities: ["info"],
    quietHours: { start: 22, end: 8 }, // 10pm - 8am
  };

  it("true for muted event type", () => {
    const e = { ...EVENT, type: "workflow.success" };
    expect(isEventMutedForRecipient(e, prefs)).toBe(true);
  });

  it("true for muted severity", () => {
    const e = { ...EVENT, severity: "info" as const };
    expect(isEventMutedForRecipient(e, prefs)).toBe(true);
  });

  it("false for non-muted event", () => {
    expect(isEventMutedForRecipient(EVENT, prefs)).toBe(false);
  });

  it("true during quiet hours (midnight = hour 0)", () => {
    expect(isEventMutedForRecipient(EVENT, prefs, 0)).toBe(true);
  });

  it("true during quiet hours (hour 23)", () => {
    expect(isEventMutedForRecipient(EVENT, prefs, 23)).toBe(true);
  });

  it("false outside quiet hours (hour 12)", () => {
    expect(isEventMutedForRecipient(EVENT, prefs, 12)).toBe(false);
  });
});

describe("getRecipientChannels", () => {
  it("returns subscribed channels", () => {
    const prefs: RecipientPreferences = { userId: "u1", channels: ["email", "slack"] };
    const chs = getRecipientChannels(prefs, CHANNELS);
    expect(chs.map((c) => c.id)).toEqual(["email", "slack"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiting
// ─────────────────────────────────────────────────────────────────────────────

describe("checkRateLimit", () => {
  const channel: ChannelConfig = {
    id: "email", type: "email", name: "Email", enabled: true, target: "x@y.com",
    rateLimit: { maxPerHour: 2, maxPerDay: 5 },
  };

  it("allows first call", () => {
    const window = createRateWindow("email", NOW);
    const { allowed } = checkRateLimit(window, channel, NOW);
    expect(allowed).toBe(true);
  });

  it("blocks when hourly limit reached", () => {
    let window = createRateWindow("email", NOW);
    const r1 = checkRateLimit(window, channel, NOW);
    window = r1.window;
    const r2 = checkRateLimit(window, channel, NOW + 1000);
    window = r2.window;
    const r3 = checkRateLimit(window, channel, NOW + 2000); // 3rd in same hour
    expect(r3.allowed).toBe(false);
  });

  it("resets in new hour", () => {
    let window = createRateWindow("email", NOW);
    window = checkRateLimit(window, channel, NOW).window;
    window = checkRateLimit(window, channel, NOW + 1000).window;
    // Move to next hour
    const { allowed } = checkRateLimit(window, channel, NOW + 3_600_001);
    expect(allowed).toBe(true);
  });

  it("always allows when no rateLimit on channel", () => {
    const ch = { ...channel, rateLimit: undefined };
    const window = createRateWindow("email", NOW);
    expect(checkRateLimit(window, ch, NOW).allowed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Notification Records
// ─────────────────────────────────────────────────────────────────────────────

describe("createRecord", () => {
  it("creates pending record", () => {
    const r = createRecord("e1", "email", "u1");
    expect(r.status).toBe("pending");
    expect(r.channelId).toBe("email");
    expect(r.recipientId).toBe("u1");
    expect(r.retryCount).toBe(0);
  });
});

describe("markSent / markFailed / markSuppressed", () => {
  it("markSent sets status and sentAt", () => {
    const r = markSent(createRecord("e1", "email"), NOW);
    expect(r.status).toBe("sent");
    expect(r.sentAt).toBe(NOW);
  });

  it("markFailed increments retryCount", () => {
    const r = markFailed(createRecord("e1", "email"), "Timeout");
    expect(r.status).toBe("failed");
    expect(r.retryCount).toBe(1);
    expect(r.error).toBe("Timeout");
  });

  it("markSuppressed sets suppressed status", () => {
    expect(markSuppressed(createRecord("e1", "email")).status).toBe("suppressed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// routeEvent
// ─────────────────────────────────────────────────────────────────────────────

describe("routeEvent", () => {
  const rules: RoutingRule[] = [
    { id: "r1", priority: 1, matchSeverity: ["error", "critical"], targetChannelIds: ["slack"] },
    { id: "r2", priority: 2, matchEventType: ["workflow.failed"], targetChannelIds: ["email"] },
  ];

  it("creates records for each matched channel", () => {
    const result = routeEvent(EVENT, rules, CHANNELS);
    expect(result.routed).toBe(2);
    expect(result.records.some((r) => r.channelId === "slack")).toBe(true);
    expect(result.records.some((r) => r.channelId === "email")).toBe(true);
  });

  it("suppresses ineligible channels", () => {
    const rules2: RoutingRule[] = [
      { id: "r1", priority: 1, targetChannelIds: ["pager"] }, // pager needs critical, event is error
    ];
    const result = routeEvent(EVENT, rules2, CHANNELS);
    expect(result.suppressed).toBe(1);
    expect(result.routed).toBe(0);
  });

  it("suppresses for muted recipients", () => {
    const rules3: RoutingRule[] = [
      { id: "r1", priority: 1, targetChannelIds: ["email"], targetUserIds: ["u1"] },
    ];
    const prefs: RecipientPreferences[] = [
      { userId: "u1", channels: ["email"], mutedEventTypes: ["workflow.failed"] },
    ];
    const result = routeEvent(EVENT, rules3, CHANNELS, prefs);
    expect(result.suppressed).toBe(1);
    expect(result.routed).toBe(0);
  });

  it("returns routed=0 when no rules match", () => {
    const result = routeEvent({ ...EVENT, severity: "info" }, rules, CHANNELS);
    expect(result.routed).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────────────────────────────

describe("computeNotificationStats", () => {
  const records: NotificationRecord[] = [
    markSent(createRecord("e1", "email"), NOW),
    markSent(createRecord("e1", "slack"), NOW),
    markFailed(createRecord("e1", "sms"), "Error"),
    markSuppressed(createRecord("e1", "pager")),
  ];

  it("counts by status", () => {
    const stats = computeNotificationStats(records);
    expect(stats.byStatus.sent).toBe(2);
    expect(stats.byStatus.failed).toBe(1);
    expect(stats.byStatus.suppressed).toBe(1);
  });

  it("computes success rate", () => {
    const stats = computeNotificationStats(records);
    expect(stats.successRate).toBeCloseTo(2 / 3);
  });

  it("counts by channel", () => {
    const stats = computeNotificationStats(records);
    expect(stats.byChannel.email).toBe(1);
    expect(stats.byChannel.slack).toBe(1);
  });

  it("lists failed IDs", () => {
    const stats = computeNotificationStats(records);
    expect(stats.failedIds).toHaveLength(1);
  });
});

describe("getFailedRecords / getPendingRecords", () => {
  const records: NotificationRecord[] = [
    createRecord("e1", "email"),
    markFailed(createRecord("e1", "sms"), "Error"),
  ];

  it("getFailedRecords", () => expect(getFailedRecords(records)).toHaveLength(1));
  it("getPendingRecords", () => expect(getPendingRecords(records)).toHaveLength(1));
});
