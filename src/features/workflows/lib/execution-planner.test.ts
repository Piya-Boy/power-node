import { describe, it, expect } from "vitest";
import {
  buildAdjacencyList,
  buildReverseAdjacency,
  getInDegrees,
  getRootNodes,
  getLeafNodes,
  getDirectDependencies,
  getDirectDependents,
  detectCycles,
  hasCycles,
  topologicalSort,
  computeCriticalPath,
  getParallelGroups,
  buildExecutionPlan,
  validateGraph,
  getReachableNodes,
  getAncestors,
  extractSubgraph,
  computePlanStats,
  type WorkflowGraph,
  type PlanNode,
} from "./execution-planner";

// ─────────────────────────────────────────────────────────────────────────────
// Test graphs
// ─────────────────────────────────────────────────────────────────────────────

function node(id: string, durationMs?: number, cost?: number): PlanNode {
  return { id, type: "test", estimatedDurationMs: durationMs, estimatedCost: cost };
}

// Linear: A → B → C
const LINEAR: WorkflowGraph = {
  nodes: [node("A", 100), node("B", 200), node("C", 150)],
  edges: [{ from: "A", to: "B" }, { from: "B", to: "C" }],
};

// Fork: A → B, A → C, B → D, C → D
const FORK: WorkflowGraph = {
  nodes: [node("A", 50), node("B", 100), node("C", 80), node("D", 60)],
  edges: [
    { from: "A", to: "B" },
    { from: "A", to: "C" },
    { from: "B", to: "D" },
    { from: "C", to: "D" },
  ],
};

// Diamond + extra: A → B, A → C, B → D, C → D, D → E
const DIAMOND: WorkflowGraph = {
  nodes: [node("A", 10), node("B", 100), node("C", 20), node("D", 30), node("E", 50)],
  edges: [
    { from: "A", to: "B" },
    { from: "A", to: "C" },
    { from: "B", to: "D" },
    { from: "C", to: "D" },
    { from: "D", to: "E" },
  ],
};

// Cyclic: A → B → C → A
const CYCLIC: WorkflowGraph = {
  nodes: [node("A"), node("B"), node("C")],
  edges: [{ from: "A", to: "B" }, { from: "B", to: "C" }, { from: "C", to: "A" }],
};

// Single node
const SINGLE: WorkflowGraph = {
  nodes: [node("X", 500)],
  edges: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Graph Helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("buildAdjacencyList", () => {
  it("builds correct adjacency for linear graph", () => {
    const adj = buildAdjacencyList(LINEAR);
    expect(adj.get("A")).toEqual(["B"]);
    expect(adj.get("B")).toEqual(["C"]);
    expect(adj.get("C")).toEqual([]);
  });

  it("builds for fork graph", () => {
    const adj = buildAdjacencyList(FORK);
    expect(adj.get("A")).toContain("B");
    expect(adj.get("A")).toContain("C");
  });
});

describe("buildReverseAdjacency", () => {
  it("reverses edges", () => {
    const radj = buildReverseAdjacency(LINEAR);
    expect(radj.get("B")).toEqual(["A"]);
    expect(radj.get("A")).toEqual([]);
  });
});

describe("getInDegrees", () => {
  it("computes in-degrees for linear", () => {
    const deg = getInDegrees(LINEAR);
    expect(deg.get("A")).toBe(0);
    expect(deg.get("B")).toBe(1);
    expect(deg.get("C")).toBe(1);
  });

  it("join node has in-degree 2 in fork", () => {
    expect(getInDegrees(FORK).get("D")).toBe(2);
  });
});

describe("getRootNodes", () => {
  it("linear graph: only A is root", () => {
    expect(getRootNodes(LINEAR)).toEqual(["A"]);
  });

  it("single node is root", () => {
    expect(getRootNodes(SINGLE)).toEqual(["X"]);
  });
});

describe("getLeafNodes", () => {
  it("C is leaf in linear graph", () => {
    expect(getLeafNodes(LINEAR)).toEqual(["C"]);
  });

  it("D is leaf in fork graph", () => {
    expect(getLeafNodes(FORK)).toEqual(["D"]);
  });
});

describe("getDirectDependencies / getDirectDependents", () => {
  it("getDirectDependencies for B in linear", () => {
    expect(getDirectDependencies(LINEAR, "B")).toEqual(["A"]);
  });

  it("getDirectDependents for A in linear", () => {
    expect(getDirectDependents(LINEAR, "A")).toEqual(["B"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cycle Detection
// ─────────────────────────────────────────────────────────────────────────────

describe("detectCycles", () => {
  it("no cycles in DAG", () => {
    expect(detectCycles(LINEAR)).toHaveLength(0);
    expect(detectCycles(FORK)).toHaveLength(0);
  });

  it("detects cycle in cyclic graph", () => {
    expect(detectCycles(CYCLIC).length).toBeGreaterThan(0);
  });
});

describe("hasCycles", () => {
  it("false for DAG", () => expect(hasCycles(LINEAR)).toBe(false));
  it("true for cyclic graph", () => expect(hasCycles(CYCLIC)).toBe(true));
});

// ─────────────────────────────────────────────────────────────────────────────
// Topological Sort
// ─────────────────────────────────────────────────────────────────────────────

describe("topologicalSort", () => {
  it("produces valid order for linear graph", () => {
    const { order, hasCycle } = topologicalSort(LINEAR);
    expect(hasCycle).toBe(false);
    expect(order.indexOf("A")).toBeLessThan(order.indexOf("B"));
    expect(order.indexOf("B")).toBeLessThan(order.indexOf("C"));
  });

  it("B and C are at same level in fork graph", () => {
    const { levels } = topologicalSort(FORK);
    const bcLevel = levels.find((l) => l.includes("B") && l.includes("C"));
    expect(bcLevel).toBeDefined();
  });

  it("detects cycle", () => {
    const { hasCycle } = topologicalSort(CYCLIC);
    expect(hasCycle).toBe(true);
  });

  it("single node", () => {
    const { order } = topologicalSort(SINGLE);
    expect(order).toEqual(["X"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Critical Path
// ─────────────────────────────────────────────────────────────────────────────

describe("computeCriticalPath", () => {
  it("returns full path for linear graph", () => {
    const path = computeCriticalPath(LINEAR);
    // A(100) + B(200) + C(150) = 450
    expect(path).toContain("A");
    expect(path).toContain("C");
    expect(path.indexOf("A")).toBeLessThan(path.indexOf("C"));
  });

  it("returns path through longer branch in diamond", () => {
    // A(10) → B(100) → D(30) → E(50) = 190 vs A(10) → C(20) → D(30) → E(50) = 110
    // Critical: A → B → D → E
    const path = computeCriticalPath(DIAMOND);
    expect(path).toContain("B");
  });

  it("returns empty for cyclic graph", () => {
    expect(computeCriticalPath(CYCLIC)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Parallel Groups
// ─────────────────────────────────────────────────────────────────────────────

describe("getParallelGroups", () => {
  it("no parallel groups in linear graph", () => {
    expect(getParallelGroups(LINEAR)).toHaveLength(0);
  });

  it("fork graph has parallel group B,C", () => {
    const groups = getParallelGroups(FORK);
    expect(groups.some((g) => g.includes("B") && g.includes("C"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildExecutionPlan
// ─────────────────────────────────────────────────────────────────────────────

describe("buildExecutionPlan", () => {
  it("builds plan for linear graph", () => {
    const plan = buildExecutionPlan(LINEAR);
    expect(plan.orderedNodeIds).toHaveLength(3);
    expect(plan.steps.every((s) => s.kind === "sequential")).toBe(true);
  });

  it("marks parallel step in fork graph", () => {
    const plan = buildExecutionPlan(FORK);
    expect(plan.steps.some((s) => s.kind === "parallel")).toBe(true);
  });

  it("returns error warning for cyclic graph", () => {
    const plan = buildExecutionPlan(CYCLIC);
    expect(plan.warnings.some((w) => w.includes("cycle"))).toBe(true);
    expect(plan.steps).toHaveLength(0);
  });

  it("computes estimatedTotalMs from critical path", () => {
    const plan = buildExecutionPlan(LINEAR);
    // Critical path: A(100) + B(200) + C(150) = 450
    expect(plan.estimatedTotalMs).toBe(450);
  });

  it("computes estimatedTotalCost as sum of all nodes", () => {
    const graph: WorkflowGraph = {
      nodes: [node("A", 100, 5), node("B", 100, 10)],
      edges: [{ from: "A", to: "B" }],
    };
    const plan = buildExecutionPlan(graph);
    expect(plan.estimatedTotalCost).toBe(15);
  });

  it("warns about nodes with no duration", () => {
    const graph: WorkflowGraph = {
      nodes: [{ id: "A", type: "test" }, { id: "B", type: "test" }],
      edges: [{ from: "A", to: "B" }],
    };
    const plan = buildExecutionPlan(graph);
    expect(plan.warnings.some((w) => w.includes("no estimated duration"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateGraph
// ─────────────────────────────────────────────────────────────────────────────

describe("validateGraph", () => {
  it("passes valid DAG", () => {
    expect(validateGraph(LINEAR).valid).toBe(true);
    expect(validateGraph(FORK).valid).toBe(true);
  });

  it("errors on cycle", () => {
    const result = validateGraph(CYCLIC);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("cycle"))).toBe(true);
  });

  it("errors on duplicate node IDs", () => {
    const graph: WorkflowGraph = {
      nodes: [node("A"), node("A")],
      edges: [],
    };
    expect(validateGraph(graph).valid).toBe(false);
  });

  it("errors on unknown edge nodes", () => {
    const graph: WorkflowGraph = {
      nodes: [node("A")],
      edges: [{ from: "A", to: "UNKNOWN" }],
    };
    expect(validateGraph(graph).valid).toBe(false);
  });

  it("errors on self-loop", () => {
    const graph: WorkflowGraph = {
      nodes: [node("A")],
      edges: [{ from: "A", to: "A" }],
    };
    expect(validateGraph(graph).valid).toBe(false);
  });

  it("warns about multiple isolated nodes", () => {
    const graph: WorkflowGraph = {
      nodes: [node("A"), node("B"), node("C")],
      edges: [],
    };
    expect(validateGraph(graph).warnings.some((w) => w.includes("isolated"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reachability / Ancestors / Subgraph
// ─────────────────────────────────────────────────────────────────────────────

describe("getReachableNodes", () => {
  it("gets all descendants", () => {
    const reachable = getReachableNodes(DIAMOND, "A");
    expect(reachable).toContain("B");
    expect(reachable).toContain("D");
    expect(reachable).toContain("E");
    expect(reachable).not.toContain("A");
  });

  it("leaf node reaches nothing", () => {
    expect(getReachableNodes(LINEAR, "C")).toHaveLength(0);
  });
});

describe("getAncestors", () => {
  it("gets all ancestors of E in diamond", () => {
    const ancestors = getAncestors(DIAMOND, "E");
    expect(ancestors).toContain("A");
    expect(ancestors).toContain("D");
    expect(ancestors).not.toContain("E");
  });

  it("root node has no ancestors", () => {
    expect(getAncestors(LINEAR, "A")).toHaveLength(0);
  });
});

describe("extractSubgraph", () => {
  it("extracts nodes and edges", () => {
    const sub = extractSubgraph(DIAMOND, ["A", "B", "D"]);
    expect(sub.nodes.map((n) => n.id).sort()).toEqual(["A", "B", "D"]);
    expect(sub.edges.some((e) => e.from === "A" && e.to === "B")).toBe(true);
  });

  it("excludes edges to excluded nodes", () => {
    const sub = extractSubgraph(DIAMOND, ["A", "B"]);
    expect(sub.edges.every((e) => e.to !== "D")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computePlanStats
// ─────────────────────────────────────────────────────────────────────────────

describe("computePlanStats", () => {
  it("computes stats for fork graph plan", () => {
    const plan = buildExecutionPlan(FORK);
    const stats = computePlanStats(plan);
    expect(stats.totalNodes).toBe(4);
    expect(stats.parallelSteps).toBeGreaterThan(0);
    expect(stats.maxParallelism).toBeGreaterThan(1);
  });

  it("computes stats for linear graph", () => {
    const stats = computePlanStats(buildExecutionPlan(LINEAR));
    expect(stats.parallelSteps).toBe(0);
    expect(stats.maxParallelism).toBe(1);
  });
});
