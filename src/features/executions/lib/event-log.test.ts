import { describe, it, expect } from "vitest";
import {
  createEvent,
  createNodeStartEvent,
  createNodeSuccessEvent,
  createNodeErrorEvent,
  filterEventsByLevel,
  filterEventsByNode,
  getEventSummary,
  formatEventLog,
} from "./event-log";

describe("Event Log", () => {
  describe("createEvent", () => {
    it("should create event with required fields", () => {
      const event = createEvent("info", "Test message");
      expect(event.id).toMatch(/^evt_/);
      expect(event.level).toBe("info");
      expect(event.message).toBe("Test message");
      expect(event.timestamp).toBeTruthy();
    });

    it("should include optional fields", () => {
      const event = createEvent("error", "Fail", {
        nodeId: "n1",
        nodeType: "HTTP_REQUEST",
        durationMs: 500,
        data: { extra: "info" },
      });
      expect(event.nodeId).toBe("n1");
      expect(event.nodeType).toBe("HTTP_REQUEST");
      expect(event.durationMs).toBe(500);
      expect(event.data?.extra).toBe("info");
    });

    it("should generate unique IDs", () => {
      const ids = new Set(Array.from({ length: 10 }, () => createEvent("info", "msg").id));
      expect(ids.size).toBe(10);
    });
  });

  describe("createNodeStartEvent", () => {
    it("should create info event with node info", () => {
      const event = createNodeStartEvent("n1", "HTTP_REQUEST");
      expect(event.level).toBe("info");
      expect(event.nodeId).toBe("n1");
      expect(event.nodeType).toBe("HTTP_REQUEST");
      expect(event.message).toContain("HTTP_REQUEST");
    });
  });

  describe("createNodeSuccessEvent", () => {
    it("should include duration", () => {
      const event = createNodeSuccessEvent("n1", "CODE", 250);
      expect(event.durationMs).toBe(250);
      expect(event.message).toContain("250ms");
    });
  });

  describe("createNodeErrorEvent", () => {
    it("should create error event from Error object", () => {
      const err = new Error("Connection failed");
      const event = createNodeErrorEvent("n1", "HTTP_REQUEST", err, 100);
      expect(event.level).toBe("error");
      expect(event.message).toContain("Connection failed");
      expect(event.durationMs).toBe(100);
      expect(event.data?.stack).toBeDefined();
    });

    it("should handle non-Error values", () => {
      const event = createNodeErrorEvent("n1", "CODE", "string error");
      expect(event.message).toContain("string error");
    });
  });

  describe("filterEventsByLevel", () => {
    const events = [
      createEvent("debug", "debug msg"),
      createEvent("info", "info msg"),
      createEvent("warn", "warn msg"),
      createEvent("error", "error msg"),
    ];

    it("should return events at or above level", () => {
      const result = filterEventsByLevel(events, "warn");
      expect(result.length).toBe(2);
      expect(result.every((e) => e.level === "warn" || e.level === "error")).toBe(true);
    });

    it("should return all for debug level", () => {
      expect(filterEventsByLevel(events, "debug").length).toBe(4);
    });

    it("should return only errors for error level", () => {
      const result = filterEventsByLevel(events, "error");
      expect(result.length).toBe(1);
      expect(result[0].level).toBe("error");
    });
  });

  describe("filterEventsByNode", () => {
    const events = [
      createEvent("info", "msg1", { nodeId: "n1" }),
      createEvent("info", "msg2", { nodeId: "n2" }),
      createEvent("error", "msg3", { nodeId: "n1" }),
    ];

    it("should filter by node ID", () => {
      const result = filterEventsByNode(events, "n1");
      expect(result.length).toBe(2);
      expect(result.every((e) => e.nodeId === "n1")).toBe(true);
    });

    it("should return empty for unknown node", () => {
      expect(filterEventsByNode(events, "n99")).toHaveLength(0);
    });
  });

  describe("getEventSummary", () => {
    it("should count events by level", () => {
      const events = [
        createEvent("info", "a"),
        createEvent("info", "b"),
        createEvent("error", "c"),
        createEvent("warn", "d"),
      ];
      const summary = getEventSummary(events);
      expect(summary.total).toBe(4);
      expect(summary.byLevel.info).toBe(2);
      expect(summary.byLevel.error).toBe(1);
      expect(summary.byLevel.warn).toBe(1);
    });

    it("should collect error events", () => {
      const events = [
        createEvent("info", "ok"),
        createEvent("error", "fail1"),
        createEvent("error", "fail2"),
      ];
      expect(getEventSummary(events).errors.length).toBe(2);
    });

    it("should sum durations", () => {
      const events = [
        createEvent("info", "a", { durationMs: 100 }),
        createEvent("info", "b", { durationMs: 200 }),
        createEvent("info", "c", { durationMs: 50 }),
      ];
      expect(getEventSummary(events).totalDurationMs).toBe(350);
    });
  });

  describe("formatEventLog", () => {
    it("should format events as readable log", () => {
      const events = [
        createEvent("info", "Started"),
        createEvent("error", "Failed", { nodeType: "HTTP_REQUEST" }),
      ];
      const log = formatEventLog(events);
      expect(log).toContain("[INFO]");
      expect(log).toContain("[ERROR]");
      expect(log).toContain("Started");
      expect(log).toContain("Failed");
    });

    it("should include node type in output", () => {
      const events = [
        createEvent("info", "msg", { nodeId: "n1", nodeType: "CODE" }),
      ];
      expect(formatEventLog(events)).toContain("[CODE]");
    });

    it("should handle empty events array", () => {
      expect(formatEventLog([])).toBe("");
    });
  });
});
