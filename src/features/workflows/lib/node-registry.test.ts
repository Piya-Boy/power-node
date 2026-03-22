import { describe, it, expect } from "vitest";
import {
  createRegistry,
  validateDefinition,
  isValidDefinition,
  registerNode,
  unregisterNode,
  registerMany,
  getNode,
  hasNode,
  getNodesByCategory,
  getNodesByTag,
  getActiveNodes,
  getDeprecatedNodes,
  getExperimentalNodes,
  searchNodes,
  compareVersions,
  isNewerVersion,
  deprecateNode,
  validateNodeConfig,
  computeRegistryStats,
  listNodeTypes,
  groupByCategory,
  type NodeDefinition,
  type NodeRegistry,
} from "./node-registry";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDef(overrides: Partial<NodeDefinition> = {}): NodeDefinition {
  return {
    type: "http_request",
    version: "1.0.0",
    label: "HTTP Request",
    description: "Make an HTTP request",
    category: "action",
    tags: ["http", "network"],
    inputs: [{ key: "in", label: "Input" }],
    outputs: [{ key: "out", label: "Output" }],
    fields: [
      { key: "url", label: "URL", type: "string", required: true },
      { key: "method", label: "Method", type: "select", required: true, options: [
        { label: "GET", value: "get" },
        { label: "POST", value: "post" },
      ]},
    ],
    ...overrides,
  };
}

function makeRegistry(): NodeRegistry {
  const defs: NodeDefinition[] = [
    makeDef({ type: "http_request", category: "action", tags: ["http"] }),
    makeDef({ type: "if_condition", label: "IF Condition", description: "Branch on condition", category: "logic", tags: ["logic"] }),
    makeDef({ type: "webhook_trigger", label: "Webhook", description: "Listen for webhooks", category: "trigger", tags: ["trigger", "http"] }),
    makeDef({ type: "ai_generate", label: "AI Generate", description: "Generate text with AI", category: "ai", tags: ["ai", "llm"], experimental: true }),
    makeDef({ type: "old_node", label: "Old Node", description: "Legacy node", category: "utility", tags: [], deprecated: true }),
  ];
  return createRegistry(defs);
}

// ─────────────────────────────────────────────────────────────────────────────
// createRegistry
// ─────────────────────────────────────────────────────────────────────────────

describe("createRegistry", () => {
  it("creates empty registry", () => {
    expect(createRegistry().definitions).toHaveLength(0);
  });

  it("creates registry with initial definitions", () => {
    const registry = createRegistry([makeDef()]);
    expect(registry.definitions).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateDefinition
// ─────────────────────────────────────────────────────────────────────────────

describe("validateDefinition", () => {
  it("passes valid definition", () => {
    expect(validateDefinition(makeDef())).toHaveLength(0);
  });

  it("errors on invalid type", () => {
    const errors = validateDefinition(makeDef({ type: "Invalid Type" }));
    expect(errors.some((e) => e.includes("type"))).toBe(true);
  });

  it("errors on invalid version", () => {
    const errors = validateDefinition(makeDef({ version: "v1" }));
    expect(errors.some((e) => e.includes("version"))).toBe(true);
  });

  it("errors on missing label", () => {
    const errors = validateDefinition(makeDef({ label: "" }));
    expect(errors.some((e) => e.includes("label"))).toBe(true);
  });

  it("errors on duplicate field keys", () => {
    const errors = validateDefinition(makeDef({
      fields: [
        { key: "url", label: "URL", type: "string" },
        { key: "url", label: "URL2", type: "string" },
      ],
    }));
    expect(errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("errors on select field without options", () => {
    const errors = validateDefinition(makeDef({
      fields: [{ key: "mode", label: "Mode", type: "select" }],
    }));
    expect(errors.some((e) => e.includes("options"))).toBe(true);
  });
});

describe("isValidDefinition", () => {
  it("true for valid", () => expect(isValidDefinition(makeDef())).toBe(true));
  it("false for invalid", () => expect(isValidDefinition(makeDef({ label: "" }))).toBe(false));
});

// ─────────────────────────────────────────────────────────────────────────────
// registerNode / unregisterNode
// ─────────────────────────────────────────────────────────────────────────────

describe("registerNode", () => {
  it("registers a valid node", () => {
    const { registry, result } = registerNode(createRegistry(), makeDef());
    expect(result.success).toBe(true);
    expect(registry.definitions).toHaveLength(1);
  });

  it("fails for invalid definition", () => {
    const { registry, result } = registerNode(createRegistry(), makeDef({ label: "" }));
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(registry.definitions).toHaveLength(0);
  });

  it("replaces existing definition with same type", () => {
    let registry = createRegistry([makeDef()]);
    const updated = makeDef({ label: "Updated" });
    ({ registry } = registerNode(registry, updated));
    expect(registry.definitions).toHaveLength(1);
    expect(registry.definitions[0].label).toBe("Updated");
  });

  it("does not mutate original registry", () => {
    const original = createRegistry();
    registerNode(original, makeDef());
    expect(original.definitions).toHaveLength(0);
  });
});

describe("unregisterNode", () => {
  it("removes a node by type", () => {
    const registry = createRegistry([makeDef()]);
    expect(unregisterNode(registry, "http_request").definitions).toHaveLength(0);
  });

  it("no-op for unknown type", () => {
    const registry = createRegistry([makeDef()]);
    expect(unregisterNode(registry, "unknown").definitions).toHaveLength(1);
  });
});

describe("registerMany", () => {
  it("registers multiple nodes", () => {
    const defs = [
      makeDef({ type: "n1", label: "N1", description: "Node 1" }),
      makeDef({ type: "n2", label: "N2", description: "Node 2" }),
    ];
    const { registry, results } = registerMany(createRegistry(), defs);
    expect(registry.definitions).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it("reports failures without stopping", () => {
    const defs = [
      makeDef({ type: "n1", label: "N1", description: "valid" }),
      makeDef({ label: "" }), // invalid
    ];
    const { results } = registerMany(createRegistry(), defs);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lookup
// ─────────────────────────────────────────────────────────────────────────────

describe("getNode", () => {
  it("returns node by type", () => {
    const registry = makeRegistry();
    expect(getNode(registry, "http_request")?.label).toBe("HTTP Request");
  });

  it("returns undefined for unknown", () => {
    expect(getNode(makeRegistry(), "unknown")).toBeUndefined();
  });
});

describe("hasNode", () => {
  it("returns true for known type", () => expect(hasNode(makeRegistry(), "http_request")).toBe(true));
  it("returns false for unknown", () => expect(hasNode(makeRegistry(), "unknown")).toBe(false));
});

describe("getNodesByCategory", () => {
  it("filters by category", () => {
    expect(getNodesByCategory(makeRegistry(), "action")).toHaveLength(1);
    expect(getNodesByCategory(makeRegistry(), "logic")).toHaveLength(1);
  });
});

describe("getNodesByTag", () => {
  it("filters by tag", () => {
    expect(getNodesByTag(makeRegistry(), "http")).toHaveLength(2);
  });
});

describe("getActiveNodes / getDeprecatedNodes / getExperimentalNodes", () => {
  it("getActiveNodes excludes deprecated", () => {
    const active = getActiveNodes(makeRegistry());
    expect(active.some((d) => d.deprecated)).toBe(false);
  });

  it("getDeprecatedNodes", () => {
    expect(getDeprecatedNodes(makeRegistry())).toHaveLength(1);
  });

  it("getExperimentalNodes", () => {
    expect(getExperimentalNodes(makeRegistry())).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// searchNodes
// ─────────────────────────────────────────────────────────────────────────────

describe("searchNodes", () => {
  it("returns all active non-experimental by default", () => {
    const results = searchNodes(makeRegistry());
    expect(results.every((d) => !d.deprecated)).toBe(true);
    expect(results.every((d) => !d.experimental)).toBe(true);
  });

  it("includes deprecated when requested", () => {
    const results = searchNodes(makeRegistry(), { includeDeprecated: true });
    expect(results.some((d) => d.deprecated)).toBe(true);
  });

  it("includes experimental when requested", () => {
    const results = searchNodes(makeRegistry(), { includeExperimental: true });
    expect(results.some((d) => d.experimental)).toBe(true);
  });

  it("filters by category", () => {
    const results = searchNodes(makeRegistry(), { category: "action" });
    expect(results.every((d) => d.category === "action")).toBe(true);
  });

  it("filters by tags", () => {
    const results = searchNodes(makeRegistry(), { tags: ["http"] });
    expect(results).toHaveLength(2);
  });

  it("filters by query (label)", () => {
    const results = searchNodes(makeRegistry(), { query: "webhook" });
    expect(results.some((d) => d.type === "webhook_trigger")).toBe(true);
  });

  it("query matches tags", () => {
    const results = searchNodes(makeRegistry(), { query: "logic" });
    expect(results.some((d) => d.type === "if_condition")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Versioning
// ─────────────────────────────────────────────────────────────────────────────

describe("compareVersions", () => {
  it("returns 0 for equal", () => expect(compareVersions("1.2.3", "1.2.3")).toBe(0));
  it("major takes precedence", () => expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0));
  it("minor comparison", () => expect(compareVersions("1.2.0", "1.1.9")).toBeGreaterThan(0));
  it("patch comparison", () => expect(compareVersions("1.0.1", "1.0.0")).toBeGreaterThan(0));
  it("newer < older returns negative", () => expect(compareVersions("1.0.0", "2.0.0")).toBeLessThan(0));
});

describe("isNewerVersion", () => {
  it("true when candidate is newer", () => expect(isNewerVersion("2.0.0", "1.0.0")).toBe(true));
  it("false when same", () => expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false));
  it("false when older", () => expect(isNewerVersion("0.9.0", "1.0.0")).toBe(false));
});

describe("deprecateNode", () => {
  it("marks node as deprecated", () => {
    const registry = deprecateNode(makeRegistry(), "http_request", "Use http_v2 instead", "http_v2");
    const def = getNode(registry, "http_request");
    expect(def?.deprecated).toBe(true);
    expect(def?.deprecationMessage).toBe("Use http_v2 instead");
    expect(def?.replacedBy).toBe("http_v2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateNodeConfig
// ─────────────────────────────────────────────────────────────────────────────

describe("validateNodeConfig", () => {
  const def = makeDef({
    fields: [
      { key: "url", label: "URL", type: "string", required: true, validation: { minLength: 5 } },
      { key: "method", label: "Method", type: "select", required: true, options: [
        { label: "GET", value: "get" },
        { label: "POST", value: "post" },
      ]},
      { key: "timeout", label: "Timeout", type: "number", min: 0, max: 60000 },
    ],
  });

  it("passes valid config", () => {
    const result = validateNodeConfig(def, { url: "https://example.com", method: "get" });
    expect(result.valid).toBe(true);
  });

  it("errors on missing required field", () => {
    const result = validateNodeConfig(def, { method: "get" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("url"))).toBe(true);
  });

  it("errors on invalid select value", () => {
    const result = validateNodeConfig(def, { url: "https://example.com", method: "delete" });
    expect(result.errors.some((e) => e.includes("method"))).toBe(true);
  });

  it("errors on number out of range", () => {
    const result = validateNodeConfig(def, { url: "https://example.com", method: "get", timeout: 99999 });
    expect(result.errors.some((e) => e.includes("timeout"))).toBe(true);
  });

  it("errors on string too short", () => {
    const result = validateNodeConfig(def, { url: "hi", method: "get" });
    expect(result.errors.some((e) => e.includes("url"))).toBe(true);
  });

  it("warns about unknown fields", () => {
    const result = validateNodeConfig(def, { url: "https://example.com", method: "get", unknown_field: true });
    expect(result.warnings.some((w) => w.includes("unknown_field"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stats & Summary
// ─────────────────────────────────────────────────────────────────────────────

describe("computeRegistryStats", () => {
  it("counts totals", () => {
    const stats = computeRegistryStats(makeRegistry());
    expect(stats.total).toBe(5);
    expect(stats.deprecated).toBe(1);
    expect(stats.experimental).toBe(1);
  });

  it("counts by category", () => {
    const stats = computeRegistryStats(makeRegistry());
    expect(stats.byCategory.action).toBe(1);
    expect(stats.byCategory.logic).toBe(1);
  });

  it("computes average fields", () => {
    const stats = computeRegistryStats(makeRegistry());
    expect(stats.avgFieldsPerNode).toBeGreaterThan(0);
  });

  it("returns 0 avg for empty registry", () => {
    expect(computeRegistryStats(createRegistry()).avgFieldsPerNode).toBe(0);
  });
});

describe("listNodeTypes", () => {
  it("returns sorted list of type strings", () => {
    const types = listNodeTypes(makeRegistry());
    expect(types).toContain("http_request");
    expect(types).toEqual([...types].sort());
  });
});

describe("groupByCategory", () => {
  it("groups definitions by category", () => {
    const grouped = groupByCategory(makeRegistry());
    expect(grouped.action).toHaveLength(1);
    expect(grouped.trigger).toHaveLength(1);
    expect(grouped.ai).toHaveLength(1);
  });
});
