import { describe, it, expect } from "vitest";
import {
  buildDependencyGraph,
  getCallers,
  getCallees,
  getTransitiveDependencies,
  detectCycles,
  topologicalSort,
  computeMaxDepth,
  analyzeDependencyGraph,
  getSafeToDelete,
  type WorkflowNode,
} from "./dependency-graph";

const makeNode = (id: string, calls: string[] = []): WorkflowNode => ({
  workflowId: id,
  workflowName: `Workflow ${id}`,
  callsWorkflows: calls,
});

describe("buildDependencyGraph", () => {
  it("builds edges from workflow calls", () => {
    const nodes = [makeNode("A", ["B", "C"]), makeNode("B"), makeNode("C")];
    const graph = buildDependencyGraph(nodes);
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges.some((e) => e.from === "A" && e.to === "B")).toBe(true);
    expect(graph.edges.some((e) => e.from === "A" && e.to === "C")).toBe(true);
  });

  it("handles workflows with no calls", () => {
    const nodes = [makeNode("A"), makeNode("B")];
    const graph = buildDependencyGraph(nodes);
    expect(graph.edges).toHaveLength(0);
  });
});

describe("getCallers", () => {
  it("returns workflows that call the given workflow", () => {
    const graph = buildDependencyGraph([
      makeNode("A", ["B"]),
      makeNode("C", ["B"]),
      makeNode("B"),
    ]);
    const callers = getCallers(graph, "B");
    expect(callers).toContain("A");
    expect(callers).toContain("C");
  });

  it("returns empty for workflow with no callers", () => {
    const graph = buildDependencyGraph([makeNode("A", ["B"]), makeNode("B")]);
    expect(getCallers(graph, "A")).toHaveLength(0);
  });
});

describe("getCallees", () => {
  it("returns workflows called by the given workflow", () => {
    const graph = buildDependencyGraph([makeNode("A", ["B", "C"]), makeNode("B"), makeNode("C")]);
    expect(getCallees(graph, "A")).toEqual(expect.arrayContaining(["B", "C"]));
  });

  it("returns empty for leaf workflow", () => {
    const graph = buildDependencyGraph([makeNode("A", ["B"]), makeNode("B")]);
    expect(getCallees(graph, "B")).toHaveLength(0);
  });
});

describe("getTransitiveDependencies", () => {
  it("returns all reachable workflows", () => {
    // A -> B -> C
    const graph = buildDependencyGraph([makeNode("A", ["B"]), makeNode("B", ["C"]), makeNode("C")]);
    const deps = getTransitiveDependencies(graph, "A");
    expect(deps).toContain("B");
    expect(deps).toContain("C");
  });

  it("handles cycle guard", () => {
    // A -> B -> A (cycle)
    const graph = buildDependencyGraph([makeNode("A", ["B"]), makeNode("B", ["A"])]);
    // Should not throw and return without infinite loop
    const deps = getTransitiveDependencies(graph, "A");
    expect(deps).toContain("B");
  });

  it("returns empty for leaf", () => {
    const graph = buildDependencyGraph([makeNode("A"), makeNode("B")]);
    expect(getTransitiveDependencies(graph, "A")).toHaveLength(0);
  });
});

describe("detectCycles", () => {
  it("detects no cycles in a DAG", () => {
    const graph = buildDependencyGraph([makeNode("A", ["B"]), makeNode("B", ["C"]), makeNode("C")]);
    expect(detectCycles(graph)).toHaveLength(0);
  });

  it("detects simple cycle A -> B -> A", () => {
    const graph = buildDependencyGraph([makeNode("A", ["B"]), makeNode("B", ["A"])]);
    const cycles = detectCycles(graph);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it("detects self-cycle A -> A", () => {
    const graph = buildDependencyGraph([makeNode("A", ["A"])]);
    const cycles = detectCycles(graph);
    expect(cycles.length).toBeGreaterThan(0);
  });
});

describe("topologicalSort", () => {
  it("returns sorted order for a DAG", () => {
    // A -> B -> C
    const graph = buildDependencyGraph([makeNode("C"), makeNode("B", ["C"]), makeNode("A", ["B"])]);
    const order = topologicalSort(graph);
    expect(order).toHaveLength(3);
    expect(order.indexOf("A")).toBeLessThan(order.indexOf("B"));
    expect(order.indexOf("B")).toBeLessThan(order.indexOf("C"));
  });

  it("returns empty array when cycles exist", () => {
    const graph = buildDependencyGraph([makeNode("A", ["B"]), makeNode("B", ["A"])]);
    expect(topologicalSort(graph)).toHaveLength(0);
  });

  it("handles disconnected nodes", () => {
    const graph = buildDependencyGraph([makeNode("A"), makeNode("B"), makeNode("C")]);
    const order = topologicalSort(graph);
    expect(order).toHaveLength(3);
  });
});

describe("computeMaxDepth", () => {
  it("returns 0 for a leaf", () => {
    const graph = buildDependencyGraph([makeNode("A")]);
    expect(computeMaxDepth(graph, "A")).toBe(0);
  });

  it("computes depth for a chain", () => {
    // A -> B -> C -> D (depth 3 from A)
    const graph = buildDependencyGraph([makeNode("A", ["B"]), makeNode("B", ["C"]), makeNode("C", ["D"]), makeNode("D")]);
    expect(computeMaxDepth(graph, "A")).toBe(3);
  });

  it("handles branching", () => {
    // A -> B (depth 1), A -> C -> D (depth 2), max = 2
    const graph = buildDependencyGraph([makeNode("A", ["B", "C"]), makeNode("B"), makeNode("C", ["D"]), makeNode("D")]);
    expect(computeMaxDepth(graph, "A")).toBe(2);
  });
});

describe("analyzeDependencyGraph", () => {
  it("identifies roots and leaves", () => {
    // A -> B -> C
    const graph = buildDependencyGraph([makeNode("A", ["B"]), makeNode("B", ["C"]), makeNode("C")]);
    const analysis = analyzeDependencyGraph(graph);
    expect(analysis.roots).toContain("A");
    expect(analysis.leaves).toContain("C");
    expect(analysis.cycles).toHaveLength(0);
    expect(analysis.maxDepth).toBe(2);
    expect(analysis.topologicalOrder).toHaveLength(3);
  });

  it("reports cycles", () => {
    const graph = buildDependencyGraph([makeNode("A", ["B"]), makeNode("B", ["A"])]);
    const analysis = analyzeDependencyGraph(graph);
    expect(analysis.cycles.length).toBeGreaterThan(0);
    expect(analysis.topologicalOrder).toHaveLength(0);
  });
});

describe("getSafeToDelete", () => {
  it("returns workflows not depended upon by others", () => {
    const graph = buildDependencyGraph([makeNode("A", ["B"]), makeNode("B"), makeNode("C")]);
    const safe = getSafeToDelete(graph);
    expect(safe).toContain("A"); // no one calls A
    expect(safe).toContain("C"); // no one calls C
    expect(safe).not.toContain("B"); // A calls B
  });
});
