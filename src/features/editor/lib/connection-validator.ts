/**
 * Phase 60 — Node Connection Validator
 * Pure utilities for validating node connections, detecting cycles,
 * checking port compatibility, and enforcing topology constraints.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PortDataType =
  | "any"
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "binary"
  | "null";

export type PortDirection = "input" | "output";

export interface PortDefinition {
  id: string;
  name: string;
  direction: PortDirection;
  dataType: PortDataType;
  required?: boolean;
  multiple?: boolean;  // can accept multiple connections
  description?: string;
}

export interface NodeDefinition {
  id: string;
  type: string;
  ports: PortDefinition[];
  maxIncomingConnections?: number;
  maxOutgoingConnections?: number;
  isTrigger?: boolean;      // trigger nodes have no input edges
  isTerminal?: boolean;     // terminal nodes have no output edges
}

export interface Connection {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

export interface ConnectionValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface GraphValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  cycles: string[][];         // each inner array is a cycle path
  unreachableNodes: string[];
  disconnectedNodes: string[];
  missingRequiredInputs: Array<{ nodeId: string; portId: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Port Compatibility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if two port data types are compatible for a connection.
 * "any" is compatible with everything.
 */
export function areTypesCompatible(sourceType: PortDataType, targetType: PortDataType): boolean {
  if (sourceType === "any" || targetType === "any") return true;
  return sourceType === targetType;
}

/**
 * Find a port definition by id within a node definition.
 */
export function findPort(node: NodeDefinition, portId: string): PortDefinition | null {
  return node.ports.find((p) => p.id === portId) ?? null;
}

/**
 * Get all output ports of a node.
 */
export function getOutputPorts(node: NodeDefinition): PortDefinition[] {
  return node.ports.filter((p) => p.direction === "output");
}

/**
 * Get all input ports of a node.
 */
export function getInputPorts(node: NodeDefinition): PortDefinition[] {
  return node.ports.filter((p) => p.direction === "input");
}

// ─────────────────────────────────────────────────────────────────────────────
// Single Connection Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a single connection between two nodes.
 */
export function validateConnection(params: {
  connection: Connection;
  sourceNode: NodeDefinition;
  targetNode: NodeDefinition;
  existingConnections: Connection[];
}): ConnectionValidationResult {
  const { connection, sourceNode, targetNode, existingConnections } = params;
  const errors: string[] = [];
  const warnings: string[] = [];

  // Self-loop check
  if (connection.sourceNodeId === connection.targetNodeId) {
    errors.push("Cannot connect a node to itself");
    return { valid: false, errors, warnings };
  }

  // Find ports
  const sourcePort = findPort(sourceNode, connection.sourcePortId);
  const targetPort = findPort(targetNode, connection.targetPortId);

  if (!sourcePort) {
    errors.push(`Source port "${connection.sourcePortId}" not found on node "${sourceNode.id}"`);
  }
  if (!targetPort) {
    errors.push(`Target port "${connection.targetPortId}" not found on node "${targetNode.id}"`);
  }
  if (errors.length > 0) return { valid: false, errors, warnings };

  // Direction check
  if (sourcePort!.direction !== "output") {
    errors.push(`Source port "${sourcePort!.id}" must be an output port`);
  }
  if (targetPort!.direction !== "input") {
    errors.push(`Target port "${targetPort!.id}" must be an input port`);
  }
  if (errors.length > 0) return { valid: false, errors, warnings };

  // Type compatibility
  if (!areTypesCompatible(sourcePort!.dataType, targetPort!.dataType)) {
    errors.push(
      `Type mismatch: source outputs "${sourcePort!.dataType}" but target expects "${targetPort!.dataType}"`
    );
  }

  // Duplicate connection
  const isDuplicate = existingConnections.some(
    (c) =>
      c.id !== connection.id &&
      c.sourceNodeId === connection.sourceNodeId &&
      c.sourcePortId === connection.sourcePortId &&
      c.targetNodeId === connection.targetNodeId &&
      c.targetPortId === connection.targetPortId
  );
  if (isDuplicate) {
    errors.push("This connection already exists");
  }

  // Multiple connections to non-multiple port
  if (!targetPort!.multiple) {
    const existingToPort = existingConnections.filter(
      (c) => c.id !== connection.id &&
             c.targetNodeId === connection.targetNodeId &&
             c.targetPortId === connection.targetPortId
    );
    if (existingToPort.length > 0) {
      errors.push(`Port "${targetPort!.id}" does not accept multiple connections`);
    }
  }

  // Trigger node should not have incoming connections
  if (targetNode.isTrigger) {
    errors.push(`Trigger nodes cannot have incoming connections`);
  }

  // Terminal node should not have outgoing connections
  if (sourceNode.isTerminal) {
    errors.push(`Terminal nodes cannot have outgoing connections`);
  }

  // Max connections check
  if (sourceNode.maxOutgoingConnections !== undefined) {
    const outgoing = existingConnections.filter(
      (c) => c.id !== connection.id && c.sourceNodeId === connection.sourceNodeId
    );
    if (outgoing.length >= sourceNode.maxOutgoingConnections) {
      errors.push(`Node "${sourceNode.id}" has reached its maximum outgoing connections (${sourceNode.maxOutgoingConnections})`);
    }
  }
  if (targetNode.maxIncomingConnections !== undefined) {
    const incoming = existingConnections.filter(
      (c) => c.id !== connection.id && c.targetNodeId === connection.targetNodeId
    );
    if (incoming.length >= targetNode.maxIncomingConnections) {
      errors.push(`Node "${targetNode.id}" has reached its maximum incoming connections (${targetNode.maxIncomingConnections})`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Graph Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate an entire workflow graph: cycles, unreachable nodes, missing inputs.
 */
export function validateGraph(params: {
  nodes: NodeDefinition[];
  connections: Connection[];
}): GraphValidationResult {
  const { nodes, connections } = params;
  const errors: string[] = [];
  const warnings: string[] = [];

  const nodeIds = new Set(nodes.map((n) => n.id));
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Validate all connection endpoints reference existing nodes
  for (const conn of connections) {
    if (!nodeIds.has(conn.sourceNodeId)) {
      errors.push(`Connection "${conn.id}" references unknown source node "${conn.sourceNodeId}"`);
    }
    if (!nodeIds.has(conn.targetNodeId)) {
      errors.push(`Connection "${conn.id}" references unknown target node "${conn.targetNodeId}"`);
    }
  }

  // Build adjacency
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const id of nodeIds) {
    outgoing.set(id, []);
    incoming.set(id, []);
  }
  for (const conn of connections) {
    outgoing.get(conn.sourceNodeId)?.push(conn.targetNodeId);
    incoming.get(conn.targetNodeId)?.push(conn.sourceNodeId);
  }

  // Cycle detection (DFS)
  const cycles = detectCycles(nodes.map((n) => n.id), outgoing);
  if (cycles.length > 0) {
    errors.push(`Graph contains ${cycles.length} cycle(s)`);
  }

  // Find trigger nodes (roots)
  const triggerNodes = nodes.filter((n) => n.isTrigger || (incoming.get(n.id)?.length ?? 0) === 0);

  // Unreachable nodes (not reachable from any trigger)
  const reachable = new Set<string>();
  for (const root of triggerNodes) {
    dfsVisit(root.id, outgoing, reachable);
  }
  const unreachableNodes = nodes
    .filter((n) => !reachable.has(n.id) && !n.isTrigger && (incoming.get(n.id)?.length ?? 0) > 0)
    .map((n) => n.id);

  if (unreachableNodes.length > 0) {
    warnings.push(`${unreachableNodes.length} node(s) are unreachable from trigger`);
  }

  // Disconnected nodes (no connections at all)
  const disconnectedNodes = nodes
    .filter(
      (n) =>
        !n.isTrigger &&
        (incoming.get(n.id)?.length ?? 0) === 0 &&
        (outgoing.get(n.id)?.length ?? 0) === 0
    )
    .map((n) => n.id);

  if (disconnectedNodes.length > 0) {
    warnings.push(`${disconnectedNodes.length} node(s) have no connections`);
  }

  // Check required input ports
  const missingRequiredInputs: Array<{ nodeId: string; portId: string }> = [];
  for (const node of nodes) {
    const requiredInputs = node.ports.filter((p) => p.direction === "input" && p.required);
    for (const port of requiredInputs) {
      const hasConnection = connections.some(
        (c) => c.targetNodeId === node.id && c.targetPortId === port.id
      );
      if (!hasConnection) {
        missingRequiredInputs.push({ nodeId: node.id, portId: port.id });
      }
    }
  }

  if (missingRequiredInputs.length > 0) {
    errors.push(`${missingRequiredInputs.length} required input port(s) have no connection`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    cycles,
    unreachableNodes,
    disconnectedNodes,
    missingRequiredInputs,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Topology Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Topological sort of nodes (Kahn's algorithm).
 * Returns sorted node ids, or null if a cycle exists.
 */
export function topologicalSort(
  nodeIds: string[],
  connections: Connection[]
): string[] | null {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }
  for (const conn of connections) {
    adj.get(conn.sourceNodeId)?.push(conn.targetNodeId);
    inDegree.set(conn.targetNodeId, (inDegree.get(conn.targetNodeId) ?? 0) + 1);
  }

  const queue: string[] = nodeIds.filter((id) => (inDegree.get(id) ?? 0) === 0);
  const sorted: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const neighbor of adj.get(node) ?? []) {
      const deg = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, deg);
      if (deg === 0) queue.push(neighbor);
    }
  }

  return sorted.length === nodeIds.length ? sorted : null;
}

/**
 * Get all upstream nodes (ancestors) of a given node.
 */
export function getUpstreamNodes(nodeId: string, connections: Connection[]): string[] {
  const reverseAdj = new Map<string, string[]>();
  for (const conn of connections) {
    const arr = reverseAdj.get(conn.targetNodeId) ?? [];
    arr.push(conn.sourceNodeId);
    reverseAdj.set(conn.targetNodeId, arr);
  }
  const visited = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    if (current !== nodeId) visited.add(current);
    for (const parent of reverseAdj.get(current) ?? []) {
      if (!visited.has(parent)) queue.push(parent);
    }
  }
  return [...visited];
}

/**
 * Get all downstream nodes (descendants) of a given node.
 */
export function getDownstreamNodes(nodeId: string, connections: Connection[]): string[] {
  const adj = new Map<string, string[]>();
  for (const conn of connections) {
    const arr = adj.get(conn.sourceNodeId) ?? [];
    arr.push(conn.targetNodeId);
    adj.set(conn.sourceNodeId, arr);
  }
  const visited = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    if (current !== nodeId) visited.add(current);
    for (const child of adj.get(current) ?? []) {
      if (!visited.has(child)) queue.push(child);
    }
  }
  return [...visited];
}

/**
 * Check if removing a node would disconnect the graph.
 */
export function wouldDisconnectGraph(
  removeNodeId: string,
  nodes: NodeDefinition[],
  connections: Connection[]
): boolean {
  const remainingNodeIds = nodes.filter((n) => n.id !== removeNodeId).map((n) => n.id);
  const remainingConnections = connections.filter(
    (c) => c.sourceNodeId !== removeNodeId && c.targetNodeId !== removeNodeId
  );
  if (remainingNodeIds.length <= 1) return false;

  // Check if remaining graph is still connected
  const adj = new Map<string, string[]>();
  for (const id of remainingNodeIds) adj.set(id, []);
  for (const conn of remainingConnections) {
    adj.get(conn.sourceNodeId)?.push(conn.targetNodeId);
    adj.get(conn.targetNodeId)?.push(conn.sourceNodeId); // undirected for connectivity
  }

  const visited = new Set<string>();
  dfsVisit(remainingNodeIds[0], adj, visited);
  return visited.size !== remainingNodeIds.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function detectCycles(nodeIds: string[], adj: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): void {
    visited.add(node);
    inStack.add(node);
    path.push(node);
    for (const neighbor of adj.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (inStack.has(neighbor)) {
        // Found a cycle
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), neighbor]);
        }
      }
    }
    path.pop();
    inStack.delete(node);
  }

  for (const id of nodeIds) {
    if (!visited.has(id)) dfs(id);
  }
  return cycles;
}

function dfsVisit(start: string, adj: Map<string, string[]>, visited: Set<string>): void {
  if (visited.has(start)) return;
  visited.add(start);
  for (const neighbor of adj.get(start) ?? []) {
    dfsVisit(neighbor, adj, visited);
  }
}
