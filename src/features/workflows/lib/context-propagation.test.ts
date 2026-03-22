import { describe, it, expect, beforeEach } from "vitest";
import {
  createContext,
  childContext,
  setEntry,
  getEntry,
  getValue,
  deleteEntry,
  hasEntry,
  mergeContexts,
  filterByScope,
  filterByNode,
  getPropagatedEntries,
  expireEntries,
  inferType,
  serializeEntry,
  deserializeEntry,
  toHeaders,
  fromHeaders,
  toBaggage,
  getContextStats,
  resetSpanSeq,
} from "./context-propagation";

const NOW = 1_700_000_000_000;

beforeEach(() => {
  resetSpanSeq();
});

// ─────────────────────────────────────────────────────────────────────────────
// createContext
// ─────────────────────────────────────────────────────────────────────────────

describe("createContext", () => {
  it("creates context with auto traceId", () => {
    const ctx = createContext("wf1", "ex1", {}, NOW);
    expect(ctx.traceId).toBeDefined();
    expect(ctx.spanId).toBeDefined();
    expect(ctx.workflowId).toBe("wf1");
    expect(ctx.executionId).toBe("ex1");
    expect(ctx.entries.size).toBe(0);
    expect(ctx.createdAt).toBe(NOW);
  });

  it("uses provided traceId", () => {
    const ctx = createContext("wf1", "ex1", { traceId: "my-trace" }, NOW);
    expect(ctx.traceId).toBe("my-trace");
  });

  it("sets optional userId and tenantId", () => {
    const ctx = createContext("wf1", "ex1", { userId: "u1", tenantId: "t1" }, NOW);
    expect(ctx.userId).toBe("u1");
    expect(ctx.tenantId).toBe("t1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// childContext
// ─────────────────────────────────────────────────────────────────────────────

describe("childContext", () => {
  it("inherits traceId, new spanId", () => {
    const parent = createContext("wf1", "ex1", {}, NOW);
    const child = childContext(parent, "node1", NOW + 100);
    expect(child.traceId).toBe(parent.traceId);
    expect(child.spanId).not.toBe(parent.spanId);
    expect(child.parentSpanId).toBe(parent.spanId);
    expect(child.nodeId).toBe("node1");
  });

  it("propagates entries with propagate=true", () => {
    let parent = createContext("wf1", "ex1", {}, NOW);
    parent = setEntry(parent, "keep", "yes", { propagate: true }, NOW);
    parent = setEntry(parent, "drop", "no", { propagate: false }, NOW);
    const child = childContext(parent, "n1", NOW + 100);
    expect(child.entries.has("keep")).toBe(true);
    expect(child.entries.has("drop")).toBe(false);
  });

  it("does not mutate parent", () => {
    let parent = createContext("wf1", "ex1", {}, NOW);
    parent = setEntry(parent, "k", "v", {}, NOW);
    const child = childContext(parent, "n1", NOW + 100);
    // modifying child entries should not affect parent
    child.entries.set("extra", { key: "extra", value: 1, type: "number", scope: "node", propagate: true, createdAt: NOW });
    expect(parent.entries.has("extra")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setEntry / getEntry / getValue / deleteEntry / hasEntry
// ─────────────────────────────────────────────────────────────────────────────

describe("setEntry", () => {
  it("adds entry", () => {
    const ctx = setEntry(createContext("wf1", "ex1", {}, NOW), "userId", "u1", {}, NOW);
    expect(ctx.entries.size).toBe(1);
    expect(ctx.entries.get("userId")?.value).toBe("u1");
  });

  it("infers type automatically", () => {
    let ctx = createContext("wf1", "ex1", {}, NOW);
    ctx = setEntry(ctx, "n", 42, {}, NOW);
    ctx = setEntry(ctx, "b", true, {}, NOW);
    ctx = setEntry(ctx, "s", "str", {}, NOW);
    ctx = setEntry(ctx, "o", { a: 1 }, {}, NOW);
    expect(ctx.entries.get("n")?.type).toBe("number");
    expect(ctx.entries.get("b")?.type).toBe("boolean");
    expect(ctx.entries.get("s")?.type).toBe("string");
    expect(ctx.entries.get("o")?.type).toBe("json");
  });

  it("computes expiresAt from ttl", () => {
    const ctx = setEntry(createContext("wf1", "ex1", {}, NOW), "k", "v", { ttl: 5000 }, NOW);
    expect(ctx.entries.get("k")?.expiresAt).toBe(NOW + 5000);
  });

  it("is immutable", () => {
    const original = createContext("wf1", "ex1", {}, NOW);
    setEntry(original, "k", "v", {}, NOW);
    expect(original.entries.size).toBe(0);
  });
});

describe("getEntry / getValue / hasEntry", () => {
  it("returns entry", () => {
    const ctx = setEntry(createContext("wf1", "ex1", {}, NOW), "k", 99, {}, NOW);
    expect(getEntry(ctx, "k", NOW)?.value).toBe(99);
    expect(getValue(ctx, "k", NOW)).toBe(99);
    expect(hasEntry(ctx, "k", NOW)).toBe(true);
  });

  it("returns undefined for missing key", () => {
    const ctx = createContext("wf1", "ex1", {}, NOW);
    expect(getEntry(ctx, "missing", NOW)).toBeUndefined();
    expect(hasEntry(ctx, "missing", NOW)).toBe(false);
  });

  it("returns undefined for expired entry", () => {
    const ctx = setEntry(createContext("wf1", "ex1", {}, NOW), "k", "v", { ttl: 1000 }, NOW);
    expect(getEntry(ctx, "k", NOW + 2000)).toBeUndefined();
    expect(hasEntry(ctx, "k", NOW + 2000)).toBe(false);
  });
});

describe("deleteEntry", () => {
  it("removes entry", () => {
    let ctx = setEntry(createContext("wf1", "ex1", {}, NOW), "k", "v", {}, NOW);
    ctx = deleteEntry(ctx, "k");
    expect(ctx.entries.has("k")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mergeContexts
// ─────────────────────────────────────────────────────────────────────────────

describe("mergeContexts", () => {
  it("overlay entries win", () => {
    let base = setEntry(createContext("wf1", "ex1", {}, NOW), "k", "base", {}, NOW);
    let overlay = setEntry(createContext("wf1", "ex1", {}, NOW), "k", "overlay", {}, NOW);
    overlay = setEntry(overlay, "extra", "x", {}, NOW);
    const merged = mergeContexts(base, overlay);
    expect(getValue(merged, "k", NOW)).toBe("overlay");
    expect(getValue(merged, "extra", NOW)).toBe("x");
  });

  it("merges metadata", () => {
    const base = { ...createContext("wf1", "ex1", {}, NOW), metadata: { a: 1 } };
    const overlay = { ...createContext("wf1", "ex1", {}, NOW), metadata: { b: 2 } };
    const merged = mergeContexts(base, overlay);
    expect(merged.metadata).toEqual({ a: 1, b: 2 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// filterByScope / filterByNode / getPropagatedEntries
// ─────────────────────────────────────────────────────────────────────────────

describe("filterByScope", () => {
  it("returns entries with matching scope", () => {
    let ctx = createContext("wf1", "ex1", {}, NOW);
    ctx = setEntry(ctx, "a", 1, { scope: "global" }, NOW);
    ctx = setEntry(ctx, "b", 2, { scope: "node" }, NOW);
    ctx = setEntry(ctx, "c", 3, { scope: "global" }, NOW);
    expect(filterByScope(ctx, "global")).toHaveLength(2);
    expect(filterByScope(ctx, "node")).toHaveLength(1);
  });
});

describe("filterByNode", () => {
  it("returns entries tied to nodeId", () => {
    let ctx = createContext("wf1", "ex1", {}, NOW);
    ctx = setEntry(ctx, "a", 1, { nodeId: "n1" }, NOW);
    ctx = setEntry(ctx, "b", 2, { nodeId: "n2" }, NOW);
    expect(filterByNode(ctx, "n1")).toHaveLength(1);
  });
});

describe("getPropagatedEntries", () => {
  it("returns only propagate=true entries", () => {
    let ctx = createContext("wf1", "ex1", {}, NOW);
    ctx = setEntry(ctx, "yes", 1, { propagate: true }, NOW);
    ctx = setEntry(ctx, "no", 2, { propagate: false }, NOW);
    const propagated = getPropagatedEntries(ctx);
    expect(propagated).toHaveLength(1);
    expect(propagated[0].key).toBe("yes");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// expireEntries
// ─────────────────────────────────────────────────────────────────────────────

describe("expireEntries", () => {
  it("removes expired entries", () => {
    let ctx = createContext("wf1", "ex1", {}, NOW);
    ctx = setEntry(ctx, "expired", 1, { ttl: 100 }, NOW);
    ctx = setEntry(ctx, "alive", 2, { ttl: 10000 }, NOW);
    ctx = setEntry(ctx, "no-ttl", 3, {}, NOW);
    const result = expireEntries(ctx, NOW + 5000);
    expect(result.entries.has("expired")).toBe(false);
    expect(result.entries.has("alive")).toBe(true);
    expect(result.entries.has("no-ttl")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// inferType / serializeEntry / deserializeEntry
// ─────────────────────────────────────────────────────────────────────────────

describe("inferType", () => {
  it("infers types correctly", () => {
    expect(inferType("hello")).toBe("string");
    expect(inferType(42)).toBe("number");
    expect(inferType(true)).toBe("boolean");
    expect(inferType({ x: 1 })).toBe("json");
    expect(inferType([1, 2])).toBe("json");
  });
});

describe("serializeEntry / deserializeEntry", () => {
  it("round-trips string", () => {
    const entry = { key: "k", value: "hello", type: "string" as const, scope: "workflow" as const, propagate: true, createdAt: NOW };
    expect(deserializeEntry(serializeEntry(entry), "string")).toBe("hello");
  });

  it("round-trips number", () => {
    const entry = { key: "k", value: 42, type: "number" as const, scope: "workflow" as const, propagate: true, createdAt: NOW };
    expect(deserializeEntry(serializeEntry(entry), "number")).toBe(42);
  });

  it("round-trips boolean", () => {
    const entry = { key: "k", value: true, type: "boolean" as const, scope: "workflow" as const, propagate: true, createdAt: NOW };
    expect(deserializeEntry(serializeEntry(entry), "boolean")).toBe(true);
  });

  it("round-trips json", () => {
    const entry = { key: "k", value: { a: 1 }, type: "json" as const, scope: "workflow" as const, propagate: true, createdAt: NOW };
    expect(deserializeEntry(serializeEntry(entry), "json")).toEqual({ a: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toHeaders / fromHeaders
// ─────────────────────────────────────────────────────────────────────────────

describe("toHeaders / fromHeaders", () => {
  it("round-trips core fields", () => {
    const ctx = createContext("wf1", "ex1", { userId: "u1", tenantId: "t1" }, NOW);
    const headers = toHeaders(ctx);
    expect(headers["x-trace-id"]).toBe(ctx.traceId);
    expect(headers["x-workflow-id"]).toBe("wf1");
    expect(headers["x-execution-id"]).toBe("ex1");
    expect(headers["x-user-id"]).toBe("u1");
    expect(headers["x-tenant-id"]).toBe("t1");
  });

  it("fromHeaders restores context", () => {
    const ctx = createContext("wf1", "ex1", { userId: "u1" }, NOW);
    const child = childContext(ctx, "n1", NOW + 100);
    const headers = toHeaders(child);
    const restored = fromHeaders(headers, NOW + 200);
    expect(restored.traceId).toBe(child.traceId);
    expect(restored.workflowId).toBe("wf1");
    expect(restored.userId).toBe("u1");
  });

  it("omits undefined optional headers", () => {
    const ctx = createContext("wf1", "ex1", {}, NOW);
    const headers = toHeaders(ctx);
    expect(headers["x-user-id"]).toBeUndefined();
    expect(headers["x-parent-span-id"]).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toBaggage
// ─────────────────────────────────────────────────────────────────────────────

describe("toBaggage", () => {
  it("serializes propagated entries", () => {
    let ctx = createContext("wf1", "ex1", {}, NOW);
    ctx = setEntry(ctx, "k", "val", { propagate: true }, NOW);
    ctx = setEntry(ctx, "secret", "hidden", { propagate: false }, NOW);
    const bag = toBaggage(ctx, NOW);
    expect(bag["k"]).toBe("val");
    expect(bag["secret"]).toBeUndefined();
  });

  it("excludes expired entries", () => {
    let ctx = setEntry(createContext("wf1", "ex1", {}, NOW), "k", "v", { ttl: 100, propagate: true }, NOW);
    const bag = toBaggage(ctx, NOW + 200);
    expect(bag["k"]).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getContextStats
// ─────────────────────────────────────────────────────────────────────────────

describe("getContextStats", () => {
  it("computes stats", () => {
    let ctx = createContext("wf1", "ex1", {}, NOW);
    ctx = setEntry(ctx, "a", 1, { scope: "global", propagate: true }, NOW);
    ctx = setEntry(ctx, "b", 2, { scope: "node", propagate: false }, NOW);
    ctx = setEntry(ctx, "c", 3, { scope: "workflow", propagate: true, ttl: 100 }, NOW);
    const stats = getContextStats(ctx, NOW + 200);
    expect(stats.totalEntries).toBe(3);
    expect(stats.byScope.global).toBe(1);
    expect(stats.byScope.node).toBe(1);
    expect(stats.byScope.workflow).toBe(1);
    expect(stats.propagatedCount).toBe(2);
    expect(stats.expiredCount).toBe(1);
    expect(stats.entryKeys).toContain("a");
  });
});
