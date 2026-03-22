/**
 * Phase 83 — Workflow Execution Planner
 * Pure utilities for building execution plans from workflow graphs:
 * topological sorting, dependency analysis, parallelization,
 * execution cost estimation, and plan validation.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanNode {
  id: string;
  type: string;
  label?: string;
  estimatedDurationMs?: number;
  estimatedCost?: number;
  canFail?: boolean;     // node is optional — failure should not stop workflow
  retryable?: boolean;
}

export interface PlanEdge {
  from: string;
  to: string;
  conditional?: boolean;  // edge only traversed when condition passes
}

export interface WorkflowGraph {
  nodes: PlanNode[];
  edges: PlanEdge[];
}

export type ExecutionStepKind = "sequential" | "parallel" | "conditional";

export interface ExecutionStep {
  stepIndex: number;
  kind: ExecutionStepKind;
  nodeIds: string[];
}

export interface ExecutionPlan {
  steps: ExecutionStep[];
  orderedNodeIds: string[];
  criticalPath: string[];
  estimatedTotalMs: number;
  estimatedTotalCost: number;
  parallelGroups: string[][];
  warnings: string[];
}

export interface PlanValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  cycles: string[][];
}

// ─────────────────────────────────────────────────────────────────────────────
// Graph Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function buildAdjacencyList(graph: WorkflowGraph): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const node of graph.nodes) adj.set(node.id, []);
  for (const edge of graph.edges) {
    const list = adj.get(edge.from);
    if (list) list.push(edge.to);
  }
  return adj;
}

export function buildReverseAdjacency(graph: WorkflowGraph): Map<string, string[]> {
  const radj = new Map<string, string[]>();
  for (const node of graph.nodes) radj.set(node.id, []);
  for (const edge of graph.edges) {
    const list = radj.get(edge.to);
    if (list) list.push(edge.from);
  }
  return radj;
}

export function getInDegrees(graph: WorkflowGraph): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const node of graph.nodes) degrees.set(node.id, 0);
  for (const edge of graph.edges) {
    degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
  }
  return degrees;
}

export function getRootNodes(graph: WorkflowGraph): string[] {
  const inDegrees = getInDegrees(graph);
  return graph.nodes.filter((n) => (inDegrees.get(n.id) ?? 0) === 0).map((n) => n.id);
}

export function getLeafNodes(graph: WorkflowGraph): string[] {
  const adj = buildAdjacencyList(graph);
  return graph.nodes.filter((n) => (adj.get(n.id) ?? []).length === 0).map((n) => n.id);
}

export function getDirectDependencies(graph: WorkflowGraph, nodeId: string): string[] {
  return graph.edges.filter((e) => e.to === nodeId).map((e) => e.from);
}

export function getDirectDependents(graph: WorkflowGraph, nodeId: string): string[] {
  return graph.edges.filter((e) => e.from === nodeId).map((e) => e.to);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cycle Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect all cycles in a directed graph using DFS.
 * Returns arrays of node IDs forming cycles.
 */
export function detectCycles(graph: WorkflowGraph): string[][] {
  const adj = buildAdjacencyList(graph);
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(id: string, path: string[]): void {
    visited.add(id);
    inStack.add(id);
    path.push(id);

    for (const neighbor of (adj.get(id) ?? [])) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path]);
      } else if (inStack.has(neighbor)) {
        // Found a cycle — extract it
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          cycles.push(path.slice(cycleStart));
        }
      }
    }

    inStack.delete(id);
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id, []);
    }
  }

  return cycles;
}

export function hasCycles(graph: WorkflowGraph): boolean {
  return detectCycles(graph).length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Topological Sort (Kahn's algorithm)
// ─────────────────────────────────────────────────────────────────────────────

export interface TopoSortResult {
  order: string[];
  levels: string[][];   // nodes at same level can run in parallel
  hasCycle: boolean;
}

export function topologicalSort(graph: WorkflowGraph): TopoSortResult {
  const adj = buildAdjacencyList(graph);
  const inDegrees = getInDegrees(graph);

  const queue: string[] = [];
  const levels: string[][] = [];
  const order: string[] = [];

  // Initialize queue with all nodes having no dependencies
  for (const [id, deg] of inDegrees) {
    if (deg === 0) queue.push(id);
  }

  const remaining = new Map(inDegrees);

  while (queue.length > 0) {
    const currentLevel = [...queue];
    queue.length = 0;
    levels.push(currentLevel);

    for (const id of currentLevel) {
      order.push(id);
      for (const neighbor of (adj.get(id) ?? [])) {
        const newDeg = (remaining.get(neighbor) ?? 1) - 1;
        remaining.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }
  }

  const hasCycle = order.length !== graph.nodes.length;
  return { order, levels, hasCycle };
}

// ─────────────────────────────────────────────────────────────────────────────
// Critical Path Analysis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the critical path (longest path by duration) through the DAG.
 * Returns the sequence of node IDs on the critical path.
 */
export function computeCriticalPath(graph: WorkflowGraph): string[] {
  const { order, hasCycle } = topologicalSort(graph);
  if (hasCycle) return [];

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const adj = buildAdjacencyList(graph);

  const dist = new Map<string, number>();
  const prev = new Map<string, string>();

  for (const id of order) {
    const node = nodeMap.get(id);
    const d = node?.estimatedDurationMs ?? 0;
    if (!dist.has(id)) dist.set(id, d);

    for (const neighbor of (adj.get(id) ?? [])) {
      const neighborNode = nodeMap.get(neighbor);
      const neighborDuration = neighborNode?.estimatedDurationMs ?? 0;
      const newDist = (dist.get(id) ?? 0) + neighborDuration;
      if (newDist > (dist.get(neighbor) ?? 0)) {
        dist.set(neighbor, newDist);
        prev.set(neighbor, id);
      }
    }
  }

  // Find node with max distance
  let maxId: string | undefined;
  let maxDist = -1;
  for (const [id, d] of dist) {
    if (d > maxDist) { maxDist = d; maxId = id; }
  }
  if (!maxId) return order.length > 0 ? [order[0]] : [];

  // Backtrack
  const path: string[] = [];
  let cur: string | undefined = maxId;
  while (cur !== undefined) {
    path.unshift(cur);
    cur = prev.get(cur);
  }

  return path;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parallel Group Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Group nodes that can execute in parallel (same topological level).
 * Only groups with 2+ nodes are considered "parallel".
 */
export function getParallelGroups(graph: WorkflowGraph): string[][] {
  const { levels } = topologicalSort(graph);
  return levels.filter((level) => level.length > 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution Plan Builder
// ─────────────────────────────────────────────────────────────────────────────

export function buildExecutionPlan(graph: WorkflowGraph): ExecutionPlan {
  const warnings: string[] = [];
  const { order, levels, hasCycle } = topologicalSort(graph);

  if (hasCycle) {
    return {
      steps: [],
      orderedNodeIds: [],
      criticalPath: [],
      estimatedTotalMs: 0,
      estimatedTotalCost: 0,
      parallelGroups: [],
      warnings: ["Graph contains cycles — cannot build execution plan"],
    };
  }

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  const steps: ExecutionStep[] = levels.map((level, idx) => ({
    stepIndex: idx,
    kind: level.length > 1 ? "parallel" : "sequential",
    nodeIds: level,
  }));

  const criticalPath = computeCriticalPath(graph);

  // Estimate total time along critical path
  const estimatedTotalMs = criticalPath.reduce((sum, id) => {
    return sum + (nodeMap.get(id)?.estimatedDurationMs ?? 0);
  }, 0);

  const estimatedTotalCost = order.reduce((sum, id) => {
    return sum + (nodeMap.get(id)?.estimatedCost ?? 0);
  }, 0);

  const parallelGroups = getParallelGroups(graph);

  // Warn about nodes with no estimated duration
  const noEstimate = order.filter((id) => nodeMap.get(id)?.estimatedDurationMs === undefined);
  if (noEstimate.length > 0) {
    warnings.push(`${noEstimate.length} node(s) have no estimated duration`);
  }

  return {
    steps,
    orderedNodeIds: order,
    criticalPath,
    estimatedTotalMs,
    estimatedTotalCost,
    parallelGroups,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan Validation
// ─────────────────────────────────────────────────────────────────────────────

export function validateGraph(graph: WorkflowGraph): PlanValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for duplicate node IDs
  const ids = graph.nodes.map((n) => n.id);
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupIds.length > 0) errors.push(`Duplicate node IDs: ${dupIds.join(", ")}`);

  // Check edge references
  const idSet = new Set(ids);
  for (const edge of graph.edges) {
    if (!idSet.has(edge.from)) errors.push(`Edge references unknown node: ${edge.from}`);
    if (!idSet.has(edge.to)) errors.push(`Edge references unknown node: ${edge.to}`);
    if (edge.from === edge.to) errors.push(`Self-loop on node: ${edge.from}`);
  }

  // Detect cycles
  const cycles = detectCycles(graph);
  if (cycles.length > 0) {
    errors.push(`Graph contains ${cycles.length} cycle(s)`);
  }

  // Warn about isolated nodes (no edges)
  const connectedIds = new Set<string>();
  for (const edge of graph.edges) {
    connectedIds.add(edge.from);
    connectedIds.add(edge.to);
  }
  const isolated = graph.nodes.filter((n) => !connectedIds.has(n.id));
  if (isolated.length > 1) {
    warnings.push(`${isolated.length} isolated nodes (no connections)`);
  }

  // Warn about no root nodes (all nodes have dependencies)
  const roots = getRootNodes(graph);
  if (graph.nodes.length > 0 && roots.length === 0) {
    errors.push("No root nodes found (all nodes have incoming edges)");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    cycles,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Subgraph & Reachability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all node IDs reachable from a given starting node (BFS).
 */
export function getReachableNodes(graph: WorkflowGraph, startId: string): string[] {
  const adj = buildAdjacencyList(graph);
  const visited = new Set<string>();
  const queue = [startId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const neighbor of (adj.get(id) ?? [])) {
      queue.push(neighbor);
    }
  }

  visited.delete(startId);
  return [...visited];
}

/**
 * Get all ancestors of a node (nodes that can reach it).
 */
export function getAncestors(graph: WorkflowGraph, nodeId: string): string[] {
  const radj = buildReverseAdjacency(graph);
  const visited = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const parent of (radj.get(id) ?? [])) {
      if (!visited.has(parent)) {
        visited.add(parent);
        queue.push(parent);
      }
    }
  }

  return [...visited];
}

/**
 * Extract a subgraph containing only the specified nodes and edges between them.
 */
export function extractSubgraph(graph: WorkflowGraph, nodeIds: string[]): WorkflowGraph {
  const idSet = new Set(nodeIds);
  const nodes = graph.nodes.filter((n) => idSet.has(n.id));
  const edges = graph.edges.filter((e) => idSet.has(e.from) && idSet.has(e.to));
  return { nodes, edges };
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan Stats
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanStats {
  totalNodes: number;
  totalSteps: number;
  parallelSteps: number;
  sequentialSteps: number;
  criticalPathLength: number;
  estimatedTotalMs: number;
  estimatedTotalCost: number;
  maxParallelism: number;
}

export function computePlanStats(plan: ExecutionPlan): PlanStats {
  return {
    totalNodes: plan.orderedNodeIds.length,
    totalSteps: plan.steps.length,
    parallelSteps: plan.steps.filter((s) => s.kind === "parallel").length,
    sequentialSteps: plan.steps.filter((s) => s.kind === "sequential").length,
    criticalPathLength: plan.criticalPath.length,
    estimatedTotalMs: plan.estimatedTotalMs,
    estimatedTotalCost: plan.estimatedTotalCost,
    maxParallelism: plan.steps.reduce((max, s) => Math.max(max, s.nodeIds.length), 0),
  };
}
