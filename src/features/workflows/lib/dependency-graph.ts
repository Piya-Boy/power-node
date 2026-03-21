/**
 * Phase 30 — Advanced UX: Workflow Dependency Graph
 * Visualize and analyze which workflows call other workflows (sub-workflow chains).
 */

export interface WorkflowNode {
  workflowId: string;
  workflowName: string;
  /** IDs of workflows that this workflow calls (via SUB_WORKFLOW nodes) */
  callsWorkflows: string[];
}

export interface DependencyEdge {
  from: string; // caller workflowId
  to: string;   // callee workflowId
}

export interface DependencyGraph {
  nodes: WorkflowNode[];
  edges: DependencyEdge[];
}

export interface DependencyAnalysis {
  /** Workflows that are not called by anyone */
  roots: string[];
  /** Workflows that don't call anyone */
  leaves: string[];
  /** Workflows involved in a circular dependency */
  cycles: string[][];
  /** Max depth of the dependency chain */
  maxDepth: number;
  /** Topological order (empty if cycles exist) */
  topologicalOrder: string[];
}

/**
 * Build a dependency graph from a list of workflow nodes.
 */
export function buildDependencyGraph(workflows: WorkflowNode[]): DependencyGraph {
  const edges: DependencyEdge[] = [];
  for (const wf of workflows) {
    for (const callee of wf.callsWorkflows) {
      edges.push({ from: wf.workflowId, to: callee });
    }
  }
  return { nodes: workflows, edges };
}

/**
 * Get all workflows that directly call a given workflow.
 */
export function getCallers(graph: DependencyGraph, workflowId: string): string[] {
  return graph.edges
    .filter((e) => e.to === workflowId)
    .map((e) => e.from);
}

/**
 * Get all workflows directly called by a given workflow.
 */
export function getCallees(graph: DependencyGraph, workflowId: string): string[] {
  return graph.edges
    .filter((e) => e.from === workflowId)
    .map((e) => e.to);
}

/**
 * Get all transitive dependencies (all workflows reachable from a given one).
 */
export function getTransitiveDependencies(
  graph: DependencyGraph,
  workflowId: string,
  visited = new Set<string>()
): string[] {
  if (visited.has(workflowId)) return [];
  visited.add(workflowId);
  const direct = getCallees(graph, workflowId);
  const result = [...direct];
  for (const dep of direct) {
    result.push(...getTransitiveDependencies(graph, dep, visited));
  }
  return [...new Set(result)];
}

/**
 * Detect cycles in the dependency graph using DFS.
 * Returns arrays of workflow IDs forming cycles.
 */
export function detectCycles(graph: DependencyGraph): string[][] {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];
  const cycles: string[][] = [];

  const dfs = (nodeId: string): void => {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    for (const neighbor of getCallees(graph, nodeId)) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle — extract the cycle from the path
        const cycleStart = path.indexOf(neighbor);
        cycles.push([...path.slice(cycleStart)]);
      }
    }

    path.pop();
    recursionStack.delete(nodeId);
  };

  for (const node of graph.nodes) {
    if (!visited.has(node.workflowId)) {
      dfs(node.workflowId);
    }
  }

  return cycles;
}

/**
 * Perform topological sort (Kahn's algorithm).
 * Returns sorted order or empty array if cycles exist.
 */
export function topologicalSort(graph: DependencyGraph): string[] {
  const inDegree = new Map<string, number>();
  for (const node of graph.nodes) {
    if (!inDegree.has(node.workflowId)) inDegree.set(node.workflowId, 0);
  }
  for (const edge of graph.edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const queue = [...inDegree.entries()]
    .filter(([, deg]) => deg === 0)
    .map(([id]) => id);

  const result: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    for (const neighbor of getCallees(graph, current)) {
      const newDeg = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  // If result has all nodes, no cycles
  return result.length === graph.nodes.length ? result : [];
}

/**
 * Compute the maximum depth of the dependency chain.
 */
export function computeMaxDepth(
  graph: DependencyGraph,
  workflowId: string,
  visited = new Set<string>()
): number {
  if (visited.has(workflowId)) return 0; // cycle guard
  visited.add(workflowId);
  const callees = getCallees(graph, workflowId);
  if (callees.length === 0) return 0;
  const depths = callees.map((c) => computeMaxDepth(graph, c, new Set(visited)));
  return 1 + Math.max(...depths);
}

/**
 * Analyze the full dependency graph.
 */
export function analyzeDependencyGraph(graph: DependencyGraph): DependencyAnalysis {
  const allIds = new Set(graph.nodes.map((n) => n.workflowId));
  const calledIds = new Set(graph.edges.map((e) => e.to));
  const callerIds = new Set(graph.edges.map((e) => e.from));

  const roots = [...allIds].filter((id) => !calledIds.has(id));
  const leaves = [...allIds].filter((id) => !callerIds.has(id));

  const cycles = detectCycles(graph);
  const topologicalOrder = topologicalSort(graph);

  const maxDepth = roots.reduce((max, rootId) => {
    return Math.max(max, computeMaxDepth(graph, rootId));
  }, 0);

  return { roots, leaves, cycles, maxDepth, topologicalOrder };
}

/**
 * Find workflows that are safe to delete (not depended upon by anyone).
 */
export function getSafeToDelete(graph: DependencyGraph): string[] {
  const calledIds = new Set(graph.edges.map((e) => e.to));
  return graph.nodes
    .filter((n) => !calledIds.has(n.workflowId))
    .map((n) => n.workflowId);
}
