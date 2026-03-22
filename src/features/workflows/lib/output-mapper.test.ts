import { describe, it, expect } from "vitest";
import {
  createOutput,
  getOutputByNode,
  getOutputByPort,
  mergeOutputData,
  applyFieldMap,
  applyMappingConfig,
  applyRoutingRules,
  firstMatchRouter,
  stripNullFields,
  renameOutputFields,
  namespaceOutput,
  flattenOutput,
  projectOutput,
  wrapOutput,
  unwrapOutput,
  fanOut,
  fanIn,
  diffOutputs,
  hasOutputChanged,
  type NodeOutput,
  type FieldMap,
  type RoutingRule,
} from "./output-mapper";

const NOW = 1_700_000_000_000;

// ─────────────────────────────────────────────────────────────────────────────
// NodeOutput Management
// ─────────────────────────────────────────────────────────────────────────────

describe("createOutput", () => {
  it("creates output with given fields", () => {
    const o = createOutput("n1", "out", { name: "Alice" }, NOW);
    expect(o.nodeId).toBe("n1");
    expect(o.portKey).toBe("out");
    expect(o.data.name).toBe("Alice");
    expect(o.timestamp).toBe(NOW);
  });
});

describe("getOutputByNode", () => {
  const outputs: NodeOutput[] = [
    createOutput("n1", "out", { a: 1 }, NOW),
    createOutput("n1", "error", { err: "x" }, NOW),
    createOutput("n2", "out", { b: 2 }, NOW),
  ];

  it("returns all outputs for a node", () => {
    expect(getOutputByNode(outputs, "n1")).toHaveLength(2);
  });

  it("returns empty for unknown node", () => {
    expect(getOutputByNode(outputs, "n9")).toHaveLength(0);
  });
});

describe("getOutputByPort", () => {
  const outputs: NodeOutput[] = [
    createOutput("n1", "out", { a: 1 }, NOW),
    createOutput("n1", "error", { err: "x" }, NOW),
  ];

  it("returns specific port output", () => {
    expect(getOutputByPort(outputs, "n1", "out")?.data.a).toBe(1);
  });

  it("returns undefined for unknown port", () => {
    expect(getOutputByPort(outputs, "n1", "unknown")).toBeUndefined();
  });
});

describe("mergeOutputData", () => {
  const o1 = createOutput("n1", "out", { a: 1, b: "old" }, NOW);
  const o2 = createOutput("n2", "out", { b: "new", c: 3 }, NOW);

  it("last_wins strategy", () => {
    const result = mergeOutputData([o1, o2], "last_wins");
    expect(result.b).toBe("new");
    expect(result.a).toBe(1);
  });

  it("first_wins strategy", () => {
    const result = mergeOutputData([o1, o2], "first_wins");
    expect(result.b).toBe("old");
  });

  it("merge strategy deep merges", () => {
    const a = createOutput("n1", "out", { config: { x: 1, y: 2 } }, NOW);
    const b = createOutput("n2", "out", { config: { y: 99, z: 3 } }, NOW);
    const result = mergeOutputData([a, b], "merge");
    expect((result.config as Record<string, unknown>).x).toBe(1);
    expect((result.config as Record<string, unknown>).y).toBe(99);
    expect((result.config as Record<string, unknown>).z).toBe(3);
  });

  it("returns empty for empty array", () => {
    expect(mergeOutputData([])).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Field Mapping
// ─────────────────────────────────────────────────────────────────────────────

describe("applyFieldMap", () => {
  const source = { name: "Alice", age: 30, address: { city: "Bangkok" } };

  it("maps simple field", () => {
    const map: FieldMap = { sourceNodeId: "n1", sourceField: "name", targetField: "user.name" };
    expect(applyFieldMap(source, map).value).toBe("Alice");
  });

  it("maps nested field", () => {
    const map: FieldMap = { sourceNodeId: "n1", sourceField: "address.city", targetField: "city" };
    expect(applyFieldMap(source, map).value).toBe("Bangkok");
  });

  it("uses default when missing", () => {
    const map: FieldMap = { sourceNodeId: "n1", sourceField: "missing", targetField: "out", defaultValue: "default" };
    expect(applyFieldMap(source, map).value).toBe("default");
  });

  it("returns error when required field missing", () => {
    const map: FieldMap = { sourceNodeId: "n1", sourceField: "missing", targetField: "out", required: true };
    expect(applyFieldMap(source, map).error).toBeDefined();
  });

  it("applies transform", () => {
    const map: FieldMap = {
      sourceNodeId: "n1", sourceField: "name", targetField: "upper",
      transform: (v) => String(v).toUpperCase(),
    };
    expect(applyFieldMap(source, map).value).toBe("ALICE");
  });
});

describe("applyMappingConfig", () => {
  const outputs: Record<string, NodeOutput> = {
    n1: createOutput("n1", "out", { name: "Bob", score: 95 }, NOW),
    n2: createOutput("n2", "out", { tag: "winner" }, NOW),
  };

  it("maps fields from multiple sources", () => {
    const result = applyMappingConfig(outputs, {
      targetNodeId: "n3",
      fieldMaps: [
        { sourceNodeId: "n1", sourceField: "name", targetField: "user.name" },
        { sourceNodeId: "n2", sourceField: "tag", targetField: "badge" },
      ],
    });
    expect(result.input).toMatchObject({ user: { name: "Bob" }, badge: "winner" });
    expect(result.applied).toContain("user.name");
    expect(result.errors).toHaveLength(0);
  });

  it("errors when source node missing", () => {
    const result = applyMappingConfig(outputs, {
      targetNodeId: "n3",
      fieldMaps: [
        { sourceNodeId: "MISSING", sourceField: "x", targetField: "x", required: true },
      ],
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("includeAll passes through unmapped fields", () => {
    const result = applyMappingConfig(outputs, {
      targetNodeId: "n3",
      fieldMaps: [],
      includeAll: true,
    });
    expect(result.input.name).toBe("Bob");
    expect(result.input.tag).toBe("winner");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Routing
// ─────────────────────────────────────────────────────────────────────────────

describe("applyRoutingRules", () => {
  const data = { status: "success", score: 90 };

  const rules: RoutingRule[] = [
    { id: "r1", condition: (d) => d.status === "success", targetNodeId: "n_success" },
    { id: "r2", condition: (d) => (d.score as number) >= 80, targetNodeId: "n_high_score" },
    { id: "r3", condition: (d) => d.status === "error", targetNodeId: "n_error" },
  ];

  it("matches all applicable rules", () => {
    const result = applyRoutingRules(data, rules);
    expect(result.matched).toHaveLength(2);
    expect(result.unmatched).toBe(false);
  });

  it("unmatched when no rules match", () => {
    const result = applyRoutingRules({ status: "pending" }, rules);
    expect(result.unmatched).toBe(true);
  });

  it("handles condition error gracefully", () => {
    const badRule: RoutingRule = {
      id: "bad", condition: () => { throw new Error("boom"); }, targetNodeId: "n1",
    };
    const result = applyRoutingRules(data, [badRule]);
    expect(result.unmatched).toBe(true);
  });
});

describe("firstMatchRouter", () => {
  const rules: RoutingRule[] = [
    { id: "r1", condition: (d) => d.type === "a", targetNodeId: "n_a" },
    { id: "r2", condition: (d) => d.type === "b", targetNodeId: "n_b" },
  ];

  it("returns first matching rule only", () => {
    const result = firstMatchRouter({ type: "a" }, rules);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].ruleId).toBe("r1");
  });

  it("unmatched when none match", () => {
    expect(firstMatchRouter({ type: "c" }, rules).unmatched).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Normalization
// ─────────────────────────────────────────────────────────────────────────────

describe("stripNullFields", () => {
  it("removes null and undefined", () => {
    const result = stripNullFields({ a: 1, b: null, c: undefined, d: "ok" });
    expect(result).toEqual({ a: 1, d: "ok" });
  });
});

describe("renameOutputFields", () => {
  it("renames specified fields", () => {
    const result = renameOutputFields({ firstName: "Alice", age: 30 }, { firstName: "name" });
    expect(result).toEqual({ name: "Alice", age: 30 });
  });
});

describe("namespaceOutput", () => {
  it("prefixes all keys", () => {
    const result = namespaceOutput({ a: 1, b: 2 }, "node1");
    expect(result).toEqual({ "node1.a": 1, "node1.b": 2 });
  });
});

describe("flattenOutput", () => {
  it("flattens nested object", () => {
    const result = flattenOutput({ a: { b: { c: 1 }, d: 2 }, e: 3 });
    expect(result).toEqual({ "a.b.c": 1, "a.d": 2, e: 3 });
  });
});

describe("projectOutput", () => {
  it("selects only specified fields", () => {
    const result = projectOutput({ a: 1, b: 2, c: 3 }, ["a", "c"]);
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it("handles dot-notation fields", () => {
    const result = projectOutput({ user: { name: "Alice", age: 30 } }, ["user.name"]);
    expect(result["user.name"]).toBe("Alice");
  });
});

describe("wrapOutput / unwrapOutput", () => {
  it("wraps output in key", () => {
    const wrapped = wrapOutput({ a: 1 }, "result");
    expect(wrapped.result).toEqual({ a: 1 });
  });

  it("unwraps output from key", () => {
    const wrapped = { result: { a: 1 } };
    expect(unwrapOutput(wrapped, "result")).toEqual({ a: 1 });
  });

  it("unwrap returns original if key not object", () => {
    expect(unwrapOutput({ x: "not_obj" }, "x")).toEqual({ x: "not_obj" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fan-out / Fan-in
// ─────────────────────────────────────────────────────────────────────────────

describe("fanOut", () => {
  it("splits array field into individual outputs", () => {
    const output = createOutput("n1", "out", { items: ["a", "b", "c"], source: "test" }, NOW);
    const parts = fanOut(output, "items");
    expect(parts).toHaveLength(3);
    expect(parts[0].data.items).toBe("a");
    expect(parts[0].data._index).toBe(0);
    expect(parts[0].data._total).toBe(3);
  });

  it("returns original when field is not array", () => {
    const output = createOutput("n1", "out", { name: "Alice" }, NOW);
    expect(fanOut(output, "items")).toHaveLength(1);
  });
});

describe("fanIn", () => {
  it("collects outputs into list", () => {
    const outputs = [
      createOutput("n1", "out", { x: 1 }, NOW),
      createOutput("n2", "out", { x: 2 }, NOW),
    ];
    const result = fanIn(outputs, "results");
    expect(result.data.results).toHaveLength(2);
    expect(result.data._count).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// diffOutputs
// ─────────────────────────────────────────────────────────────────────────────

describe("diffOutputs", () => {
  it("detects added fields", () => {
    const diff = diffOutputs({ a: 1 }, { a: 1, b: 2 });
    expect(diff.added).toEqual(["b"]);
    expect(diff.removed).toHaveLength(0);
  });

  it("detects removed fields", () => {
    const diff = diffOutputs({ a: 1, b: 2 }, { a: 1 });
    expect(diff.removed).toEqual(["b"]);
  });

  it("detects changed values", () => {
    const diff = diffOutputs({ a: 1 }, { a: 2 });
    expect(diff.changed).toEqual(["a"]);
  });

  it("no changes for identical", () => {
    const diff = diffOutputs({ a: 1 }, { a: 1 });
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });
});

describe("hasOutputChanged", () => {
  it("true when changed", () => expect(hasOutputChanged({ a: 1 }, { a: 2 })).toBe(true));
  it("false when identical", () => expect(hasOutputChanged({ a: 1 }, { a: 1 })).toBe(false));
});
