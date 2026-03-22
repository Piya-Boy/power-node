import { describe, it, expect } from "vitest";
import {
  createSpan,
  endSpan,
  addSpanEvent,
  setSpanAttribute,
  createTrace,
  addSpan,
  updateSpan,
  finalizeTrace,
  getChildSpans,
  getDescendants,
  getAncestorPath,
  getSpanDepth,
  getSpansByStatus,
  getSpansByKind,
  computeCriticalPath,
  summarizeSpans,
  getSlowestSpans,
  getErrorSpans,
  getDurationByKind,
  buildFlamegraph,
  getTraceSummary,
  type TraceSpan,
  type ExecutionTrace,
} from "./execution-tracer";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const T0 = 1_000_000; // base timestamp

function makeSpan(spanId: string, overrides: Partial<TraceSpan> = {}): TraceSpan {
  return createSpan({
    spanId,
    traceId: "trace1",
    name: `span-${spanId}`,
    kind: "node",
    startTime: T0,
    endTime: T0 + 100,
    status: "success",
    ...overrides,
  });
}

function buildTestTrace(): ExecutionTrace {
  // root → child1, child2; child1 → grandchild
  const root = makeSpan("root", { kind: "workflow", startTime: T0, endTime: T0 + 500 });
  let trace = createTrace("trace1", "wf1", "exec1", root);

  const child1 = makeSpan("c1", { parentSpanId: "root", startTime: T0 + 10, endTime: T0 + 300, kind: "node" });
  const child2 = makeSpan("c2", { parentSpanId: "root", startTime: T0 + 300, endTime: T0 + 450, kind: "node" });
  const grandchild = makeSpan("gc1", { parentSpanId: "c1", startTime: T0 + 20, endTime: T0 + 250, kind: "api-call" });

  trace = addSpan(trace, child1);
  trace = addSpan(trace, child2);
  trace = addSpan(trace, grandchild);
  return trace;
}

// ─────────────────────────────────────────────────────────────────────────────
// createSpan / endSpan
// ─────────────────────────────────────────────────────────────────────────────

describe("createSpan", () => {
  it("creates span with computed durationMs", () => {
    const span = makeSpan("s1", { startTime: 1000, endTime: 1500 });
    expect(span.durationMs).toBe(500);
  });

  it("durationMs is undefined when no endTime", () => {
    const span = createSpan({ spanId: "s1", traceId: "t", name: "n", kind: "node", startTime: 1000, status: "running" });
    expect(span.durationMs).toBeUndefined();
  });

  it("initializes empty events and attributes", () => {
    const span = makeSpan("s1");
    expect(span.events).toHaveLength(0);
    expect(span.attributes).toEqual({});
  });
});

describe("endSpan", () => {
  it("computes durationMs and sets status", () => {
    const span = createSpan({ spanId: "s1", traceId: "t", name: "n", kind: "node", startTime: 1000, status: "running" });
    const ended = endSpan(span, 1500, "success");
    expect(ended.endTime).toBe(1500);
    expect(ended.durationMs).toBe(500);
    expect(ended.status).toBe("success");
  });

  it("records error message", () => {
    const span = makeSpan("s1");
    const ended = endSpan(span, T0 + 200, "error", "Connection refused");
    expect(ended.errorMessage).toBe("Connection refused");
    expect(ended.status).toBe("error");
  });
});

describe("addSpanEvent", () => {
  it("appends events", () => {
    const span = makeSpan("s1");
    const updated = addSpanEvent(span, { name: "cache_hit", timestamp: T0 + 50 });
    expect(updated.events).toHaveLength(1);
    expect(updated.events[0].name).toBe("cache_hit");
  });

  it("does not mutate original", () => {
    const span = makeSpan("s1");
    addSpanEvent(span, { name: "e", timestamp: T0 });
    expect(span.events).toHaveLength(0);
  });
});

describe("setSpanAttribute", () => {
  it("sets an attribute", () => {
    const span = makeSpan("s1");
    const updated = setSpanAttribute(span, "db.type", "postgres");
    expect(updated.attributes["db.type"]).toBe("postgres");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createTrace / addSpan / updateSpan / finalizeTrace
// ─────────────────────────────────────────────────────────────────────────────

describe("createTrace", () => {
  it("creates trace with root span", () => {
    const root = makeSpan("root", { kind: "workflow" });
    const trace = createTrace("t1", "wf1", "exec1", root);
    expect(trace.spans.size).toBe(1);
    expect(trace.rootSpanId).toBe("root");
    expect(trace.status).toBe("running");
  });
});

describe("addSpan / updateSpan", () => {
  it("adds a new span to the trace", () => {
    const trace = buildTestTrace();
    expect(trace.spans.size).toBe(4);
  });

  it("updates existing span", () => {
    const trace = buildTestTrace();
    const updated = updateSpan(trace, { ...trace.spans.get("c1")!, status: "error" });
    expect(updated.spans.get("c1")?.status).toBe("error");
    expect(trace.spans.get("c1")?.status).toBe("success"); // original unchanged
  });
});

describe("finalizeTrace", () => {
  it("sets success status when no errors", () => {
    const trace = finalizeTrace(buildTestTrace(), T0 + 600);
    expect(trace.status).toBe("success");
    expect(trace.totalDurationMs).toBe(600);
  });

  it("sets error status when any span has error", () => {
    let trace = buildTestTrace();
    trace = updateSpan(trace, { ...trace.spans.get("c1")!, status: "error" });
    const final = finalizeTrace(trace, T0 + 600);
    expect(final.status).toBe("error");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Querying
// ─────────────────────────────────────────────────────────────────────────────

describe("getChildSpans", () => {
  it("returns direct children only", () => {
    const trace = buildTestTrace();
    const children = getChildSpans(trace, "root");
    expect(children.map((s) => s.spanId).sort()).toEqual(["c1", "c2"]);
  });

  it("returns empty for leaf span", () => {
    const trace = buildTestTrace();
    expect(getChildSpans(trace, "gc1")).toHaveLength(0);
  });
});

describe("getDescendants", () => {
  it("returns all descendants recursively", () => {
    const trace = buildTestTrace();
    const descendants = getDescendants(trace, "root");
    expect(descendants.map((s) => s.spanId).sort()).toEqual(["c1", "c2", "gc1"]);
  });

  it("returns children and grandchildren of c1", () => {
    const trace = buildTestTrace();
    const descendants = getDescendants(trace, "c1");
    expect(descendants.map((s) => s.spanId)).toEqual(["gc1"]);
  });
});

describe("getAncestorPath", () => {
  it("returns path from root to span", () => {
    const trace = buildTestTrace();
    const path = getAncestorPath(trace, "gc1");
    expect(path.map((s) => s.spanId)).toEqual(["root", "c1", "gc1"]);
  });

  it("returns single span for root", () => {
    const trace = buildTestTrace();
    expect(getAncestorPath(trace, "root").map((s) => s.spanId)).toEqual(["root"]);
  });
});

describe("getSpanDepth", () => {
  it("returns 0 for root", () => {
    expect(getSpanDepth(buildTestTrace(), "root")).toBe(0);
  });

  it("returns 1 for direct children", () => {
    expect(getSpanDepth(buildTestTrace(), "c1")).toBe(1);
  });

  it("returns 2 for grandchildren", () => {
    expect(getSpanDepth(buildTestTrace(), "gc1")).toBe(2);
  });
});

describe("getSpansByStatus", () => {
  it("returns spans with given status", () => {
    let trace = buildTestTrace();
    trace = updateSpan(trace, { ...trace.spans.get("c2")!, status: "error" });
    const errors = getSpansByStatus(trace, "error");
    expect(errors).toHaveLength(1);
    expect(errors[0].spanId).toBe("c2");
  });
});

describe("getSpansByKind", () => {
  it("filters by kind", () => {
    const trace = buildTestTrace();
    const apiSpans = getSpansByKind(trace, "api-call");
    expect(apiSpans).toHaveLength(1);
    expect(apiSpans[0].spanId).toBe("gc1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeCriticalPath
// ─────────────────────────────────────────────────────────────────────────────

describe("computeCriticalPath", () => {
  it("finds the longest sequential chain", () => {
    const trace = buildTestTrace();
    const path = computeCriticalPath(trace);
    // root(500) → c1(290) → gc1(230) chain
    expect(path.spans.map((s) => s.spanId)).toEqual(["root", "c1", "gc1"]);
    expect(path.totalDurationMs).toBe(500 + 290 + 230);
  });

  it("handles single span trace", () => {
    const root = makeSpan("root", { kind: "workflow" });
    const trace = createTrace("t1", "wf1", "exec1", root);
    const path = computeCriticalPath(trace);
    expect(path.spans).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summarizeSpans
// ─────────────────────────────────────────────────────────────────────────────

describe("summarizeSpans", () => {
  it("returns summary for each span", () => {
    const trace = buildTestTrace();
    const summaries = summarizeSpans(trace);
    expect(summaries).toHaveLength(4);

    const rootSummary = summaries.find((s) => s.spanId === "root");
    expect(rootSummary?.depth).toBe(0);
    expect(rootSummary?.childCount).toBe(2);

    const gc1Summary = summaries.find((s) => s.spanId === "gc1");
    expect(gc1Summary?.depth).toBe(2);
    expect(gc1Summary?.childCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getSlowestSpans / getErrorSpans
// ─────────────────────────────────────────────────────────────────────────────

describe("getSlowestSpans", () => {
  it("returns N slowest spans", () => {
    const trace = buildTestTrace();
    const slowest = getSlowestSpans(trace, 2);
    expect(slowest).toHaveLength(2);
    expect(slowest[0].durationMs! >= slowest[1].durationMs!).toBe(true);
  });
});

describe("getErrorSpans", () => {
  it("returns spans with error status", () => {
    let trace = buildTestTrace();
    trace = updateSpan(trace, { ...trace.spans.get("c1")!, status: "error", errorMessage: "timeout" });
    const errors = getErrorSpans(trace);
    expect(errors).toHaveLength(1);
    expect(errors[0].errorMessage).toBe("timeout");
  });

  it("returns empty when no errors", () => {
    expect(getErrorSpans(buildTestTrace())).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDurationByKind
// ─────────────────────────────────────────────────────────────────────────────

describe("getDurationByKind", () => {
  it("sums duration per kind", () => {
    const trace = buildTestTrace();
    const byKind = getDurationByKind(trace);
    expect(byKind.get("workflow")).toBe(500);
    expect(byKind.get("node")).toBe(290 + 150); // c1 + c2
    expect(byKind.get("api-call")).toBe(230);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildFlamegraph
// ─────────────────────────────────────────────────────────────────────────────

describe("buildFlamegraph", () => {
  it("builds flamegraph sorted by startOffset", () => {
    const trace = buildTestTrace();
    const fg = buildFlamegraph(trace);
    expect(fg.length).toBe(4);
    // Root starts at offset 0
    expect(fg[0].startOffset).toBe(0);
    expect(fg[0].spanId).toBe("root");
    // All entries have non-negative depth
    expect(fg.every((f) => f.depth >= 0)).toBe(true);
  });

  it("computes correct startOffset from trace start", () => {
    const trace = buildTestTrace();
    const fg = buildFlamegraph(trace);
    const c1Entry = fg.find((f) => f.spanId === "c1");
    expect(c1Entry?.startOffset).toBe(10); // T0+10 - T0
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getTraceSummary
// ─────────────────────────────────────────────────────────────────────────────

describe("getTraceSummary", () => {
  it("returns summary fields", () => {
    const trace = finalizeTrace(buildTestTrace(), T0 + 600);
    const summary = getTraceSummary(trace);
    expect(summary.traceId).toBe("trace1");
    expect(summary.workflowId).toBe("wf1");
    expect(summary.totalSpans).toBe(4);
    expect(summary.successSpans).toBe(4);
    expect(summary.errorSpans).toBe(0);
    expect(summary.status).toBe("success");
    expect(summary.totalDurationMs).toBe(600);
    expect(summary.slowestSpanName).toBeDefined();
    expect(summary.criticalPathMs).toBeGreaterThan(0);
  });
});
