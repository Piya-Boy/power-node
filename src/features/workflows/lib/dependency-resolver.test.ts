import { describe, it, expect } from "vitest";
import {
  satisfiesVersion,
  findBestVersion,
  resolveDependencies,
  buildDependencyGraph,
  detectCircularDependencies,
  getExecutionOrder,
  getTransitiveDependencies,
  getReverseDependencies,
  createManifest,
  addDependency,
  removeDependency,
  validateManifest,
  summarizeDependencies,
  type WorkflowManifest,
  type Dependency,
} from "./dependency-resolver";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeDep(overrides: Partial<Dependency> = {}): Dependency {
  return {
    id: "dep1",
    type: "credential",
    name: "openai-key",
    version: "*",
    required: true,
    ...overrides,
  };
}

function makeManifest(overrides: Partial<WorkflowManifest> = {}): WorkflowManifest {
  return createManifest({
    id: "wf1",
    name: "My Workflow",
    version: "1.0.0",
    ...overrides,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// satisfiesVersion
// ─────────────────────────────────────────────────────────────────────────────

describe("satisfiesVersion", () => {
  it("accepts * (wildcard)", () => {
    expect(satisfiesVersion("*", "1.2.3")).toBe(true);
    expect(satisfiesVersion("latest", "2.0.0")).toBe(true);
  });

  it("matches exact version", () => {
    expect(satisfiesVersion("1.2.3", "1.2.3")).toBe(true);
    expect(satisfiesVersion("1.2.3", "1.2.4")).toBe(false);
  });

  it("handles ^ (compatible major)", () => {
    expect(satisfiesVersion("^1.2.0", "1.3.0")).toBe(true);
    expect(satisfiesVersion("^1.2.0", "1.1.0")).toBe(false); // older
    expect(satisfiesVersion("^1.2.0", "2.0.0")).toBe(false); // different major
  });

  it("handles ~ (patch compatible)", () => {
    expect(satisfiesVersion("~1.2.0", "1.2.5")).toBe(true);
    expect(satisfiesVersion("~1.2.0", "1.3.0")).toBe(false); // different minor
    expect(satisfiesVersion("~1.2.0", "1.2.0")).toBe(true);
  });

  it("handles >= (at least)", () => {
    expect(satisfiesVersion(">=1.2.0", "1.3.0")).toBe(true);
    expect(satisfiesVersion(">=1.2.0", "1.2.0")).toBe(true);
    expect(satisfiesVersion(">=1.2.0", "1.1.0")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findBestVersion
// ─────────────────────────────────────────────────────────────────────────────

describe("findBestVersion", () => {
  it("returns highest matching version", () => {
    const available = ["1.0.0", "1.1.0", "1.2.0", "2.0.0"];
    expect(findBestVersion("^1.0.0", available)).toBe("1.2.0");
  });

  it("returns null when no match", () => {
    expect(findBestVersion("^3.0.0", ["1.0.0", "2.0.0"])).toBeNull();
  });

  it("matches wildcard to highest", () => {
    expect(findBestVersion("*", ["1.0.0", "2.5.0", "1.9.0"])).toBe("2.5.0");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveDependencies
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveDependencies", () => {
  it("resolves all available dependencies", () => {
    const manifest = makeManifest({
      dependencies: [
        makeDep({ id: "d1", name: "openai-key", version: "*" }),
        makeDep({ id: "d2", name: "stripe-key", version: "^2.0.0" }),
      ],
    });
    const available = new Map([
      ["openai-key", ["1.0.0"]],
      ["stripe-key", ["2.0.0", "2.1.0"]],
    ]);
    const result = resolveDependencies(manifest, available);
    expect(result.allResolved).toBe(true);
    expect(result.resolved.filter((r) => r.status === "resolved")).toHaveLength(2);
    expect(result.resolved.find((r) => r.name === "stripe-key")?.resolvedVersion).toBe("2.1.0");
  });

  it("reports missing required dependency", () => {
    const manifest = makeManifest({
      dependencies: [makeDep({ name: "missing-cred", required: true })],
    });
    const result = resolveDependencies(manifest, new Map());
    expect(result.allResolved).toBe(false);
    expect(result.missing).toHaveLength(1);
    expect(result.errors.some((e) => e.includes("missing-cred"))).toBe(true);
  });

  it("does not fail on missing optional dependency", () => {
    const manifest = makeManifest({
      dependencies: [makeDep({ name: "optional-thing", required: false })],
    });
    const result = resolveDependencies(manifest, new Map());
    expect(result.allResolved).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("reports version mismatch for required dependency", () => {
    const manifest = makeManifest({
      dependencies: [makeDep({ name: "pkg", version: "^3.0.0", required: true })],
    });
    const available = new Map([["pkg", ["1.0.0", "2.0.0"]]]);
    const result = resolveDependencies(manifest, available);
    expect(result.allResolved).toBe(false);
    expect(result.missing[0].status).toBe("version-mismatch");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildDependencyGraph / detectCircularDependencies
// ─────────────────────────────────────────────────────────────────────────────

describe("buildDependencyGraph", () => {
  it("builds graph from manifests with sub-workflow deps", () => {
    const manifests = [
      createManifest({
        id: "wf1", name: "WF1", version: "1.0.0",
        dependencies: [{ id: "d1", type: "sub-workflow", name: "WF2", required: true, resolvedId: "wf2" }],
      }),
      createManifest({ id: "wf2", name: "WF2", version: "1.0.0" }),
    ];
    const graph = buildDependencyGraph(manifests);
    expect(graph.nodes.size).toBe(2);
    expect(graph.edges.get("wf1")).toContain("wf2");
    expect(graph.edges.get("wf2")).toHaveLength(0);
  });
});

describe("detectCircularDependencies", () => {
  it("returns empty for acyclic graph", () => {
    const manifests = [
      createManifest({
        id: "wf1", name: "WF1", version: "1.0.0",
        dependencies: [{ id: "d1", type: "sub-workflow", name: "WF2", required: true, resolvedId: "wf2" }],
      }),
      createManifest({ id: "wf2", name: "WF2", version: "1.0.0" }),
    ];
    const graph = buildDependencyGraph(manifests);
    expect(detectCircularDependencies(graph)).toHaveLength(0);
  });

  it("detects a cycle wf1 → wf2 → wf1", () => {
    const manifests = [
      createManifest({
        id: "wf1", name: "WF1", version: "1.0.0",
        dependencies: [{ id: "d1", type: "sub-workflow", name: "WF2", required: true, resolvedId: "wf2" }],
      }),
      createManifest({
        id: "wf2", name: "WF2", version: "1.0.0",
        dependencies: [{ id: "d2", type: "sub-workflow", name: "WF1", required: true, resolvedId: "wf1" }],
      }),
    ];
    const graph = buildDependencyGraph(manifests);
    const cycles = detectCircularDependencies(graph);
    expect(cycles.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getExecutionOrder
// ─────────────────────────────────────────────────────────────────────────────

describe("getExecutionOrder", () => {
  it("returns topological order", () => {
    const manifests = [
      createManifest({
        id: "wf1", name: "A", version: "1.0.0",
        dependencies: [{ id: "d1", type: "sub-workflow", name: "B", required: true, resolvedId: "wf2" }],
      }),
      createManifest({
        id: "wf2", name: "B", version: "1.0.0",
        dependencies: [{ id: "d2", type: "sub-workflow", name: "C", required: true, resolvedId: "wf3" }],
      }),
      createManifest({ id: "wf3", name: "C", version: "1.0.0" }),
    ];
    const graph = buildDependencyGraph(manifests);
    const order = getExecutionOrder(graph);
    expect(order).not.toBeNull();
    // wf3 must come before wf2, wf2 before wf1 (in dependency direction)
    // actually: wf1 depends on wf2 so wf2 has higher in-degree
    // Kahn: roots first = wf1 first, then wf2, then wf3
    // Wait: wf1→wf2 means wf2 has inDegree 1; wf2→wf3 means wf3 has inDegree 1
    // roots (inDegree 0) = wf1 → output: wf1, then wf2, then wf3
    expect(order!.indexOf("wf1")).toBeLessThan(order!.indexOf("wf2"));
    expect(order!.indexOf("wf2")).toBeLessThan(order!.indexOf("wf3"));
  });

  it("returns null when cycle exists", () => {
    const manifests = [
      createManifest({
        id: "wf1", name: "A", version: "1.0.0",
        dependencies: [{ id: "d1", type: "sub-workflow", name: "B", required: true, resolvedId: "wf2" }],
      }),
      createManifest({
        id: "wf2", name: "B", version: "1.0.0",
        dependencies: [{ id: "d2", type: "sub-workflow", name: "A", required: true, resolvedId: "wf1" }],
      }),
    ];
    const graph = buildDependencyGraph(manifests);
    expect(getExecutionOrder(graph)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getTransitiveDependencies / getReverseDependencies
// ─────────────────────────────────────────────────────────────────────────────

describe("getTransitiveDependencies", () => {
  const manifests = [
    createManifest({
      id: "wf1", name: "A", version: "1.0.0",
      dependencies: [{ id: "d1", type: "sub-workflow", name: "B", required: true, resolvedId: "wf2" }],
    }),
    createManifest({
      id: "wf2", name: "B", version: "1.0.0",
      dependencies: [{ id: "d2", type: "sub-workflow", name: "C", required: true, resolvedId: "wf3" }],
    }),
    createManifest({ id: "wf3", name: "C", version: "1.0.0" }),
  ];
  const graph = buildDependencyGraph(manifests);

  it("returns all transitive deps of wf1", () => {
    const deps = getTransitiveDependencies("wf1", graph);
    expect(deps.has("wf2")).toBe(true);
    expect(deps.has("wf3")).toBe(true);
    expect(deps.has("wf1")).toBe(false);
  });

  it("returns empty set for leaf node", () => {
    expect(getTransitiveDependencies("wf3", graph).size).toBe(0);
  });
});

describe("getReverseDependencies", () => {
  const manifests = [
    createManifest({
      id: "wf1", name: "A", version: "1.0.0",
      dependencies: [{ id: "d1", type: "sub-workflow", name: "C", required: true, resolvedId: "wf3" }],
    }),
    createManifest({
      id: "wf2", name: "B", version: "1.0.0",
      dependencies: [{ id: "d2", type: "sub-workflow", name: "C", required: true, resolvedId: "wf3" }],
    }),
    createManifest({ id: "wf3", name: "C", version: "1.0.0" }),
  ];
  const graph = buildDependencyGraph(manifests);

  it("returns all workflows that depend on wf3", () => {
    const revDeps = getReverseDependencies("wf3", graph);
    expect(revDeps).toContain("wf1");
    expect(revDeps).toContain("wf2");
  });

  it("returns empty for workflow with no dependents", () => {
    expect(getReverseDependencies("wf1", graph)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createManifest / addDependency / removeDependency / validateManifest
// ─────────────────────────────────────────────────────────────────────────────

describe("createManifest", () => {
  it("creates manifest with empty deps by default", () => {
    const m = createManifest({ id: "wf1", name: "Test", version: "1.0.0" });
    expect(m.dependencies).toHaveLength(0);
  });
});

describe("addDependency", () => {
  it("adds a new dependency", () => {
    const m = makeManifest();
    const updated = addDependency(m, makeDep({ id: "new" }));
    expect(updated.dependencies).toHaveLength(1);
  });

  it("does not add duplicate dependency", () => {
    const m = addDependency(makeManifest(), makeDep({ id: "dup" }));
    const again = addDependency(m, makeDep({ id: "dup" }));
    expect(again.dependencies).toHaveLength(1);
  });
});

describe("removeDependency", () => {
  it("removes dependency by id", () => {
    const m = addDependency(makeManifest(), makeDep({ id: "d1" }));
    const updated = removeDependency(m, "d1");
    expect(updated.dependencies).toHaveLength(0);
  });

  it("is a no-op for non-existent id", () => {
    const m = makeManifest();
    expect(removeDependency(m, "nonexistent").dependencies).toHaveLength(0);
  });
});

describe("validateManifest", () => {
  it("accepts valid manifest", () => {
    const result = validateManifest(makeManifest());
    expect(result.valid).toBe(true);
  });

  it("errors on missing id", () => {
    const result = validateManifest({ ...makeManifest(), id: "" });
    expect(result.errors).toContain("id is required");
  });

  it("errors on empty name", () => {
    const result = validateManifest({ ...makeManifest(), name: "  " });
    expect(result.errors).toContain("name is required");
  });

  it("errors on invalid version format", () => {
    const result = validateManifest({ ...makeManifest(), version: "not-semver" });
    expect(result.errors.some((e) => e.includes("invalid version format"))).toBe(true);
  });

  it("errors on duplicate dependency ids", () => {
    const m = {
      ...makeManifest(),
      dependencies: [makeDep({ id: "d1" }), makeDep({ id: "d1" })],
    };
    const result = validateManifest(m);
    expect(result.errors).toContain("dependency ids must be unique");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summarizeDependencies
// ─────────────────────────────────────────────────────────────────────────────

describe("summarizeDependencies", () => {
  it("counts by type", () => {
    const m = {
      ...makeManifest(),
      dependencies: [
        makeDep({ id: "d1", type: "credential" }),
        makeDep({ id: "d2", type: "sub-workflow" }),
        makeDep({ id: "d3", type: "credential" }),
        makeDep({ id: "d4", type: "node-package" }),
      ],
    };
    const summary = summarizeDependencies(m);
    expect(summary.credential).toBe(2);
    expect(summary["sub-workflow"]).toBe(1);
    expect(summary["node-package"]).toBe(1);
    expect(summary["env-variable"]).toBe(0);
  });
});
