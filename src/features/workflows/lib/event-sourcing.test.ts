import { describe, it, expect } from "vitest";
import {
  createEvent,
  createEmptyState,
  applyEvent,
  replayEvents,
  replayFromSnapshot,
  snapshotState,
  appendEvent,
  getEventsAfter,
  getEventsBetween,
  buildProjection,
  buildProjections,
  isTombstoned,
  filterActiveSteams,
  type WorkflowEvent,
  type WorkflowState,
  type EventStream,
} from "./event-sourcing";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

let seq = 0;
function nextSeq() { return ++seq; }

function makeEvent(
  type: WorkflowEvent["type"],
  payload: Record<string, unknown> = {},
  sequence?: number
): WorkflowEvent {
  return createEvent({
    id: `evt_${Math.random().toString(36).slice(2)}`,
    aggregateId: "wf1",
    sequence: sequence ?? nextSeq(),
    type,
    payload,
    userId: "user1",
    now: new Date("2025-01-01T10:00:00Z"),
  });
}

function freshState(): WorkflowState {
  seq = 0;
  return createEmptyState("wf1");
}

// ─────────────────────────────────────────────────────────────────────────────
// createEvent
// ─────────────────────────────────────────────────────────────────────────────

describe("createEvent", () => {
  it("creates event with all fields", () => {
    seq = 0;
    const evt = makeEvent("workflow.created", { name: "Test" });
    expect(evt.type).toBe("workflow.created");
    expect(evt.aggregateId).toBe("wf1");
    expect(evt.payload.name).toBe("Test");
    expect(evt.metadata.userId).toBe("user1");
    expect(evt.metadata.version).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createEmptyState
// ─────────────────────────────────────────────────────────────────────────────

describe("createEmptyState", () => {
  it("creates empty state", () => {
    const state = createEmptyState("wf1");
    expect(state.id).toBe("wf1");
    expect(state.name).toBe("");
    expect(state.active).toBe(false);
    expect(state.deleted).toBe(false);
    expect(state.nodes.size).toBe(0);
    expect(state.edges.size).toBe(0);
    expect(state.version).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyEvent
// ─────────────────────────────────────────────────────────────────────────────

describe("applyEvent — workflow.created", () => {
  it("sets name and createdAt", () => {
    const s = freshState();
    const evt = makeEvent("workflow.created", { name: "My WF", description: "Desc" });
    const next = applyEvent(s, evt);
    expect(next.name).toBe("My WF");
    expect(next.description).toBe("Desc");
    expect(next.version).toBe(1);
    expect(next.createdAt).toBeDefined();
  });
});

describe("applyEvent — workflow.renamed", () => {
  it("updates name", () => {
    const s = freshState();
    const e1 = makeEvent("workflow.created", { name: "Old" });
    const e2 = makeEvent("workflow.renamed", { name: "New" });
    const next = applyEvent(applyEvent(s, e1), e2);
    expect(next.name).toBe("New");
  });
});

describe("applyEvent — workflow.activated / deactivated", () => {
  it("sets active flag", () => {
    const s = freshState();
    const e1 = makeEvent("workflow.created", { name: "WF" });
    const e2 = makeEvent("workflow.activated");
    const active = applyEvent(applyEvent(s, e1), e2);
    expect(active.active).toBe(true);

    const e3 = makeEvent("workflow.deactivated");
    const deactivated = applyEvent(active, e3);
    expect(deactivated.active).toBe(false);
  });
});

describe("applyEvent — workflow.deleted", () => {
  it("marks as deleted and deactivates", () => {
    const s = freshState();
    const e1 = makeEvent("workflow.created", { name: "WF" });
    const e2 = makeEvent("workflow.activated");
    const e3 = makeEvent("workflow.deleted");
    const deleted = applyEvent(applyEvent(applyEvent(s, e1), e2), e3);
    expect(deleted.deleted).toBe(true);
    expect(deleted.active).toBe(false);
  });
});

describe("applyEvent — node.added", () => {
  it("adds a node", () => {
    const s = freshState();
    const e1 = makeEvent("workflow.created", { name: "WF" });
    const e2 = makeEvent("node.added", { id: "n1", type: "trigger", position: { x: 0, y: 0 }, config: {} });
    const next = applyEvent(applyEvent(s, e1), e2);
    expect(next.nodes.size).toBe(1);
    expect(next.nodes.get("n1")?.type).toBe("trigger");
  });
});

describe("applyEvent — node.removed", () => {
  it("removes a node and its connected edges", () => {
    const s = freshState();
    const e1 = makeEvent("workflow.created", { name: "WF" });
    const e2 = makeEvent("node.added", { id: "n1", type: "trigger", position: { x: 0, y: 0 }, config: {} });
    const e3 = makeEvent("node.added", { id: "n2", type: "action", position: { x: 100, y: 0 }, config: {} });
    const e4 = makeEvent("edge.added", { id: "e1", source: "n1", target: "n2" });
    const e5 = makeEvent("node.removed", { id: "n1" });
    const states = [e1, e2, e3, e4, e5].reduce((st, ev) => applyEvent(st, ev), s);
    expect(states.nodes.size).toBe(1);
    expect(states.edges.size).toBe(0); // edge removed with n1
  });
});

describe("applyEvent — node.configured", () => {
  it("merges config into existing node", () => {
    const s = freshState();
    const e1 = makeEvent("workflow.created", { name: "WF" });
    const e2 = makeEvent("node.added", { id: "n1", type: "action", position: { x: 0, y: 0 }, config: { key: "old" } });
    const e3 = makeEvent("node.configured", { id: "n1", config: { key: "new", extra: true } });
    const next = [e1, e2, e3].reduce((st, ev) => applyEvent(st, ev), s);
    expect(next.nodes.get("n1")?.config.key).toBe("new");
    expect(next.nodes.get("n1")?.config.extra).toBe(true);
  });
});

describe("applyEvent — node.moved", () => {
  it("updates node position", () => {
    const s = freshState();
    const e1 = makeEvent("workflow.created", { name: "WF" });
    const e2 = makeEvent("node.added", { id: "n1", type: "action", position: { x: 0, y: 0 }, config: {} });
    const e3 = makeEvent("node.moved", { id: "n1", position: { x: 200, y: 300 } });
    const next = [e1, e2, e3].reduce((st, ev) => applyEvent(st, ev), s);
    expect(next.nodes.get("n1")?.position).toEqual({ x: 200, y: 300 });
  });
});

describe("applyEvent — edge.added / removed", () => {
  it("adds and removes edges", () => {
    const s = freshState();
    const e1 = makeEvent("workflow.created", { name: "WF" });
    const e2 = makeEvent("edge.added", { id: "e1", source: "n1", target: "n2" });
    const e3 = makeEvent("edge.removed", { id: "e1" });
    const afterAdd = [e1, e2].reduce((st, ev) => applyEvent(st, ev), s);
    expect(afterAdd.edges.size).toBe(1);
    const afterRemove = applyEvent(afterAdd, e3);
    expect(afterRemove.edges.size).toBe(0);
  });
});

describe("applyEvent — settings.updated", () => {
  it("merges settings", () => {
    const s = freshState();
    const e1 = makeEvent("workflow.created", { name: "WF" });
    const e2 = makeEvent("settings.updated", { timeout: 30, retries: 3 });
    const e3 = makeEvent("settings.updated", { timeout: 60 });
    const next = [e1, e2, e3].reduce((st, ev) => applyEvent(st, ev), s);
    expect(next.settings.timeout).toBe(60);
    expect(next.settings.retries).toBe(3);
  });
});

describe("applyEvent — tag.added / removed", () => {
  it("adds and removes tags, deduplicates", () => {
    const s = freshState();
    const e1 = makeEvent("workflow.created", { name: "WF" });
    const e2 = makeEvent("tag.added", { tag: "production" });
    const e3 = makeEvent("tag.added", { tag: "production" }); // dup
    const e4 = makeEvent("tag.added", { tag: "v2" });
    const e5 = makeEvent("tag.removed", { tag: "production" });
    const next = [e1, e2, e3, e4, e5].reduce((st, ev) => applyEvent(st, ev), s);
    expect(next.tags).not.toContain("production");
    expect(next.tags).toContain("v2");
  });
});

describe("applyEvent — idempotency", () => {
  it("does not apply events with sequence <= state.version", () => {
    const s = freshState();
    const e1 = makeEvent("workflow.created", { name: "WF" });
    const after = applyEvent(s, e1);
    const sameAgain = applyEvent(after, e1); // replay same event
    expect(sameAgain.version).toBe(after.version);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// replayEvents
// ─────────────────────────────────────────────────────────────────────────────

describe("replayEvents", () => {
  it("replays in sequence order regardless of input order", () => {
    seq = 0;
    const e1 = makeEvent("workflow.created", { name: "WF" });
    const e2 = makeEvent("workflow.renamed", { name: "Renamed" });
    const state = replayEvents([e2, e1]); // out of order input
    expect(state.name).toBe("Renamed");
  });

  it("returns empty state for empty events", () => {
    const state = replayEvents([]);
    expect(state.name).toBe("");
    expect(state.version).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// snapshotState / replayFromSnapshot
// ─────────────────────────────────────────────────────────────────────────────

describe("snapshotState", () => {
  it("serializes state including nodes/edges as plain objects", () => {
    seq = 0;
    const s = freshState();
    const e1 = makeEvent("workflow.created", { name: "WF" });
    const e2 = makeEvent("node.added", { id: "n1", type: "trigger", position: { x: 0, y: 0 }, config: {} });
    const state = [e1, e2].reduce((st, ev) => applyEvent(st, ev), s);
    const snapshot = snapshotState(state);
    expect(snapshot.sequence).toBe(2);
    expect(snapshot.state.nodes["n1"]).toBeDefined();
    expect(snapshot.state.edges).toEqual({});
  });
});

describe("replayFromSnapshot", () => {
  it("restores state from snapshot and applies subsequent events", () => {
    seq = 0;
    const s = freshState();
    const e1 = makeEvent("workflow.created", { name: "WF" });
    const e2 = makeEvent("node.added", { id: "n1", type: "trigger", position: { x: 0, y: 0 }, config: {} });
    const state = [e1, e2].reduce((st, ev) => applyEvent(st, ev), s);
    const snapshot = snapshotState(state);

    const e3 = makeEvent("workflow.renamed", { name: "Updated" });
    const restored = replayFromSnapshot(snapshot, [e1, e2, e3]);
    expect(restored.name).toBe("Updated");
    expect(restored.nodes.get("n1")).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// appendEvent / getEventsAfter / getEventsBetween
// ─────────────────────────────────────────────────────────────────────────────

describe("appendEvent", () => {
  it("appends event with correct sequence", () => {
    seq = 0;
    const stream: EventStream = { aggregateId: "wf1", events: [] };
    const e1 = makeEvent("workflow.created", { name: "WF" }, 1);
    const result = appendEvent(stream, e1);
    expect(result.error).toBeUndefined();
    expect(result.stream.events).toHaveLength(1);
  });

  it("errors on wrong sequence", () => {
    seq = 0;
    const stream: EventStream = { aggregateId: "wf1", events: [] };
    const e2 = makeEvent("workflow.renamed", { name: "X" }, 2); // should be 1
    const result = appendEvent(stream, e2);
    expect(result.error).toContain("Expected sequence 1");
  });
});

describe("getEventsAfter", () => {
  it("returns events with sequence > given value", () => {
    seq = 0;
    const events = [
      makeEvent("workflow.created", { name: "WF" }, 1),
      makeEvent("workflow.renamed", { name: "X" }, 2),
      makeEvent("workflow.activated", {}, 3),
    ];
    const stream: EventStream = { aggregateId: "wf1", events };
    const after = getEventsAfter(stream, 1);
    expect(after).toHaveLength(2);
    expect(after[0].sequence).toBe(2);
  });
});

describe("getEventsBetween", () => {
  it("returns events in inclusive range", () => {
    seq = 0;
    const events = [
      makeEvent("workflow.created", { name: "WF" }, 1),
      makeEvent("workflow.renamed", { name: "X" }, 2),
      makeEvent("workflow.activated", {}, 3),
      makeEvent("workflow.deactivated", {}, 4),
    ];
    const stream: EventStream = { aggregateId: "wf1", events };
    const between = getEventsBetween(stream, 2, 3);
    expect(between).toHaveLength(2);
    expect(between.map((e) => e.sequence)).toEqual([2, 3]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildProjection / buildProjections
// ─────────────────────────────────────────────────────────────────────────────

describe("buildProjection", () => {
  it("builds correct projection", () => {
    seq = 0;
    const events = [
      makeEvent("workflow.created", { name: "WF" }),
      makeEvent("workflow.activated"),
      makeEvent("node.added", { id: "n1", type: "trigger", position: { x: 0, y: 0 }, config: {} }),
      makeEvent("node.added", { id: "n2", type: "action", position: { x: 100, y: 0 }, config: {} }),
      makeEvent("tag.added", { tag: "v1" }),
    ];
    const proj = buildProjection("wf1", events);
    expect(proj.isActive).toBe(true);
    expect(proj.isDeleted).toBe(false);
    expect(proj.nodeCount).toBe(2);
    expect(proj.tagCount).toBe(1);
    expect(proj.eventCount).toBe(5);
    expect(proj.lastEventType).toBe("tag.added");
  });

  it("returns null lastEventType for empty events", () => {
    const proj = buildProjection("wf1", []);
    expect(proj.lastEventType).toBeNull();
    expect(proj.eventCount).toBe(0);
  });
});

describe("buildProjections", () => {
  it("builds projections map for multiple streams", () => {
    seq = 0;
    const streams: EventStream[] = [
      {
        aggregateId: "wf1",
        events: [makeEvent("workflow.created", { name: "WF1" }, 1)],
      },
      {
        aggregateId: "wf2",
        events: [makeEvent("workflow.created", { name: "WF2" }, 1)],
      },
    ];
    const projections = buildProjections(streams);
    expect(projections.size).toBe(2);
    expect(projections.get("wf1")?.workflowId).toBe("wf1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isTombstoned / filterActiveSteams
// ─────────────────────────────────────────────────────────────────────────────

describe("isTombstoned", () => {
  it("returns true when workflow.deleted event exists", () => {
    seq = 0;
    const events = [
      makeEvent("workflow.created", { name: "WF" }),
      makeEvent("workflow.deleted"),
    ];
    expect(isTombstoned(events)).toBe(true);
  });

  it("returns false when no workflow.deleted event", () => {
    seq = 0;
    const events = [makeEvent("workflow.created", { name: "WF" })];
    expect(isTombstoned(events)).toBe(false);
  });
});

describe("filterActiveSteams", () => {
  it("filters out tombstoned streams", () => {
    seq = 0;
    const streams: EventStream[] = [
      {
        aggregateId: "wf1",
        events: [makeEvent("workflow.created", { name: "WF1" }, 1)],
      },
      {
        aggregateId: "wf2",
        events: [
          makeEvent("workflow.created", { name: "WF2" }, 1),
          makeEvent("workflow.deleted", {}, 2),
        ],
      },
    ];
    const active = filterActiveSteams(streams);
    expect(active).toHaveLength(1);
    expect(active[0].aggregateId).toBe("wf1");
  });
});
