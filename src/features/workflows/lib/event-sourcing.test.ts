import { describe, it, expect, beforeEach } from "vitest";
import {
  createEvent,
  createEventStore,
  appendEvent,
  appendEvents,
  getEventsForAggregate,
  getEventsSince,
  getEventsByType,
  getEventsInWindow,
  rebuildState,
  rebuildFromSnapshot,
  saveSnapshot,
  getSnapshot,
  getAggregateVersion,
  hasConflict,
  replayEvents,
  groupEventsByAggregate,
  getStoreStats,
  resetEvtSeq,
  type DomainEvent,
} from "./event-sourcing";

const NOW = 1_700_000_000_000;

beforeEach(() => {
  resetEvtSeq();
});

// ─────────────────────────────────────────────────────────────────────────────
// createEvent
// ─────────────────────────────────────────────────────────────────────────────

describe("createEvent", () => {
  it("creates event with auto-id", () => {
    const e = createEvent("workflow.created", "wf1", "Workflow", { name: "test" }, {}, NOW);
    expect(e.id).toBe("evt_1");
    expect(e.type).toBe("workflow.created");
    expect(e.aggregateId).toBe("wf1");
    expect(e.aggregateType).toBe("Workflow");
    expect(e.payload.name).toBe("test");
    expect(e.timestamp).toBe(NOW);
  });

  it("uses provided version", () => {
    const e = createEvent("x", "a", "T", {}, { version: 5 }, NOW);
    expect(e.version).toBe(5);
  });

  it("sets causedBy", () => {
    const e = createEvent("x", "a", "T", {}, { causedBy: "cmd_1" }, NOW);
    expect(e.causedBy).toBe("cmd_1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// appendEvent / appendEvents
// ─────────────────────────────────────────────────────────────────────────────

describe("appendEvent", () => {
  it("adds event to store", () => {
    let store = createEventStore();
    const e = createEvent("wf.created", "wf1", "Workflow", {}, { version: 1 }, NOW);
    store = appendEvent(store, e);
    expect(store.events).toHaveLength(1);
  });

  it("is immutable", () => {
    const original = createEventStore();
    const e = createEvent("wf.created", "wf1", "Workflow", {}, { version: 1 }, NOW);
    appendEvent(original, e);
    expect(original.events).toHaveLength(0);
  });

  it("throws on version conflict", () => {
    let store = createEventStore();
    const e1 = createEvent("wf.created", "wf1", "Workflow", {}, { version: 1 }, NOW);
    store = appendEvent(store, e1);
    const e2 = createEvent("wf.updated", "wf1", "Workflow", {}, { version: 1 }, NOW);
    expect(() => appendEvent(store, e2)).toThrow("Version conflict");
  });
});

describe("appendEvents", () => {
  it("appends multiple events", () => {
    let store = createEventStore();
    const events = [
      createEvent("a", "wf1", "T", {}, { version: 1 }, NOW),
      createEvent("b", "wf1", "T", {}, { version: 2 }, NOW),
    ];
    store = appendEvents(store, events);
    expect(store.events).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Query functions
// ─────────────────────────────────────────────────────────────────────────────

describe("getEventsForAggregate", () => {
  it("returns sorted events for aggregate", () => {
    let store = createEventStore();
    store = appendEvent(store, createEvent("b", "wf1", "T", {}, { version: 2 }, NOW));
    store = appendEvent(store, createEvent("a", "wf1", "T", {}, { version: 1 }, NOW));
    store = appendEvent(store, createEvent("c", "wf2", "T", {}, { version: 1 }, NOW));
    const events = getEventsForAggregate(store, "wf1");
    expect(events).toHaveLength(2);
    expect(events[0].version).toBe(1);
  });
});

describe("getEventsSince", () => {
  it("returns events after given version", () => {
    let store = createEventStore();
    store = appendEvents(store, [
      createEvent("a", "wf1", "T", {}, { version: 1 }, NOW),
      createEvent("b", "wf1", "T", {}, { version: 2 }, NOW),
      createEvent("c", "wf1", "T", {}, { version: 3 }, NOW),
    ]);
    const events = getEventsSince(store, "wf1", 1);
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.version > 1)).toBe(true);
  });
});

describe("getEventsByType", () => {
  it("filters by event type", () => {
    let store = createEventStore();
    store = appendEvent(store, createEvent("created", "wf1", "T", {}, { version: 1 }, NOW));
    store = appendEvent(store, createEvent("updated", "wf1", "T", {}, { version: 2 }, NOW));
    expect(getEventsByType(store, "created")).toHaveLength(1);
  });
});

describe("getEventsInWindow", () => {
  it("returns events within time window", () => {
    let store = createEventStore();
    store = appendEvent(store, createEvent("a", "wf1", "T", {}, { version: 1 }, NOW));
    store = appendEvent(store, createEvent("b", "wf1", "T", {}, { version: 2 }, NOW + 5000));
    store = appendEvent(store, createEvent("c", "wf1", "T", {}, { version: 3 }, NOW + 10000));
    const events = getEventsInWindow(store, NOW + 1000, NOW + 8000);
    expect(events).toHaveLength(1);
    expect(events[0].version).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rebuildState / rebuildFromSnapshot
// ─────────────────────────────────────────────────────────────────────────────

describe("rebuildState", () => {
  it("reconstructs state by applying events", () => {
    type WfState = { name: string; active: boolean; nodeCount: number };
    const reducer = (state: WfState, event: DomainEvent): WfState => {
      if (event.type === "wf.created") return { ...state, name: event.payload.name as string, active: true };
      if (event.type === "wf.node_added") return { ...state, nodeCount: state.nodeCount + 1 };
      return state;
    };
    const events = [
      createEvent("wf.created", "wf1", "T", { name: "My WF" }, { version: 1 }, NOW),
      createEvent("wf.node_added", "wf1", "T", {}, { version: 2 }, NOW),
      createEvent("wf.node_added", "wf1", "T", {}, { version: 3 }, NOW),
    ];
    const state = rebuildState(events, reducer, { name: "", active: false, nodeCount: 0 });
    expect(state.name).toBe("My WF");
    expect(state.active).toBe(true);
    expect(state.nodeCount).toBe(2);
  });
});

describe("rebuildFromSnapshot", () => {
  it("uses snapshot as base state", () => {
    type S = { count: number };
    const reducer = (state: S, e: DomainEvent): S => ({ count: state.count + (e.payload.delta as number) });
    const events = [
      { ...createEvent("inc", "a", "T", { delta: 1 }, { version: 1 }, NOW) },
      { ...createEvent("inc", "a", "T", { delta: 2 }, { version: 2 }, NOW) },
      { ...createEvent("inc", "a", "T", { delta: 3 }, { version: 3 }, NOW) },
    ];
    const snapshot = { aggregateId: "a", aggregateType: "T", version: 2, state: { count: 3 }, timestamp: NOW };
    const state = rebuildFromSnapshot(snapshot, events, reducer, { count: 0 });
    expect(state.count).toBe(6); // 3 + 3 (only v3 applied)
  });

  it("falls back to full replay without snapshot", () => {
    type S = { count: number };
    const reducer = (state: S, e: DomainEvent): S => ({ count: state.count + 1 });
    const events = [
      createEvent("inc", "a", "T", {}, { version: 1 }, NOW),
      createEvent("inc", "a", "T", {}, { version: 2 }, NOW),
    ];
    const state = rebuildFromSnapshot(undefined, events, reducer, { count: 0 });
    expect(state.count).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// saveSnapshot / getSnapshot
// ─────────────────────────────────────────────────────────────────────────────

describe("saveSnapshot / getSnapshot", () => {
  it("saves and retrieves snapshot", () => {
    let store = createEventStore();
    store = saveSnapshot(store, "wf1", "Workflow", { count: 5 }, 3, NOW);
    const snap = getSnapshot(store, "wf1");
    expect(snap?.version).toBe(3);
    expect(snap?.state.count).toBe(5);
  });

  it("returns undefined for missing", () => {
    expect(getSnapshot(createEventStore(), "missing")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getAggregateVersion / hasConflict
// ─────────────────────────────────────────────────────────────────────────────

describe("getAggregateVersion", () => {
  it("returns latest version", () => {
    let store = createEventStore();
    store = appendEvents(store, [
      createEvent("a", "wf1", "T", {}, { version: 1 }, NOW),
      createEvent("b", "wf1", "T", {}, { version: 3 }, NOW),
    ]);
    expect(getAggregateVersion(store, "wf1")).toBe(3);
  });

  it("returns 0 for unknown aggregate", () => {
    expect(getAggregateVersion(createEventStore(), "unknown")).toBe(0);
  });
});

describe("hasConflict", () => {
  it("true when version mismatch", () => {
    let store = createEventStore();
    store = appendEvent(store, createEvent("a", "wf1", "T", {}, { version: 2 }, NOW));
    expect(hasConflict(store, "wf1", 1)).toBe(true);
  });

  it("false when version matches", () => {
    let store = createEventStore();
    store = appendEvent(store, createEvent("a", "wf1", "T", {}, { version: 2 }, NOW));
    expect(hasConflict(store, "wf1", 2)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// replayEvents / groupEventsByAggregate / getStoreStats
// ─────────────────────────────────────────────────────────────────────────────

describe("replayEvents", () => {
  it("returns events up to version", () => {
    const events = [
      createEvent("a", "wf1", "T", {}, { version: 1 }, NOW),
      createEvent("b", "wf1", "T", {}, { version: 2 }, NOW),
      createEvent("c", "wf1", "T", {}, { version: 3 }, NOW),
    ];
    const replayed = replayEvents(events, 2);
    expect(replayed).toHaveLength(2);
    expect(replayed.every((e) => e.version <= 2)).toBe(true);
  });
});

describe("groupEventsByAggregate", () => {
  it("groups events by aggregateId", () => {
    let store = createEventStore();
    store = appendEvents(store, [
      createEvent("a", "wf1", "T", {}, { version: 1 }, NOW),
      createEvent("b", "wf2", "T", {}, { version: 1 }, NOW),
      createEvent("c", "wf1", "T", {}, { version: 2 }, NOW),
    ]);
    const grouped = groupEventsByAggregate(store);
    expect(grouped.get("wf1")).toHaveLength(2);
    expect(grouped.get("wf2")).toHaveLength(1);
  });
});

describe("getStoreStats", () => {
  it("computes store statistics", () => {
    let store = createEventStore();
    store = appendEvents(store, [
      createEvent("created", "wf1", "T", {}, { version: 1 }, NOW),
      createEvent("updated", "wf1", "T", {}, { version: 2 }, NOW),
      createEvent("created", "wf2", "T", {}, { version: 1 }, NOW),
    ]);
    store = saveSnapshot(store, "wf1", "T", {}, 2, NOW);
    const stats = getStoreStats(store);
    expect(stats.totalEvents).toBe(3);
    expect(stats.totalAggregates).toBe(2);
    expect(stats.totalSnapshots).toBe(1);
    expect(stats.eventsByType.created).toBe(2);
    expect(stats.eventsPerAggregate["wf1"]).toBe(2);
  });
});
