export interface DebugExecutionNode {
  id: string;
  data?: unknown;
}

export interface DebugExecutionConnection {
  fromNodeId: string;
  toNodeId: string;
}

export interface DebugExecutionOptions {
  startNodeId?: string | null;
  pinnedData?: Record<string, unknown> | null;
}

export interface PreparedExecutionPlan<TNode extends DebugExecutionNode> {
  nodes: TNode[];
  initialContext: Record<string, unknown>;
  mockedNodeIds: string[];
}

function getVariableAliases(node: DebugExecutionNode): string[] {
  const aliases = new Set<string>();
  const data =
    node.data && typeof node.data === "object" && !Array.isArray(node.data)
      ? (node.data as Record<string, unknown>)
      : null;
  const variableName = data?.variableName;

  if (typeof variableName === "string" && variableName.trim().length > 0) {
    aliases.add(variableName.trim());
  }

  return Array.from(aliases);
}

export function buildPinnedExecutionContext<TNode extends DebugExecutionNode>(
  nodes: TNode[],
  pinnedData?: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!pinnedData) {
    return {};
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const context: Record<string, unknown> = {};

  for (const [nodeId, value] of Object.entries(pinnedData)) {
    const node = nodeMap.get(nodeId);
    if (!node) {
      continue;
    }

    context[nodeId] = value;

    for (const alias of getVariableAliases(node)) {
      context[alias] = value;
    }
  }

  return context;
}

export function getReachableNodeIds(
  connections: DebugExecutionConnection[],
  startNodeId?: string | null,
): Set<string> | null {
  if (!startNodeId) {
    return null;
  }

  const adjacency = new Map<string, string[]>();

  for (const connection of connections) {
    const siblings = adjacency.get(connection.fromNodeId) ?? [];
    siblings.push(connection.toNodeId);
    adjacency.set(connection.fromNodeId, siblings);
  }

  const reachable = new Set<string>([startNodeId]);
  const queue = [startNodeId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    for (const next of adjacency.get(current) ?? []) {
      if (reachable.has(next)) {
        continue;
      }

      reachable.add(next);
      queue.push(next);
    }
  }

  return reachable;
}

export function prepareExecutionPlan<TNode extends DebugExecutionNode>(
  sortedNodes: TNode[],
  connections: DebugExecutionConnection[],
  options?: DebugExecutionOptions,
): PreparedExecutionPlan<TNode> {
  const startNodeId = options?.startNodeId ?? null;
  const pinnedData = options?.pinnedData ?? {};

  if (startNodeId && !sortedNodes.some((node) => node.id === startNodeId)) {
    throw new Error(`Unknown debug start node: ${startNodeId}`);
  }

  const reachableNodeIds = getReachableNodeIds(connections, startNodeId);
  const mockedNodeIds = Object.keys(pinnedData).filter((nodeId) =>
    sortedNodes.some((node) => node.id === nodeId),
  );
  const mockedNodeIdSet = new Set(mockedNodeIds);

  const nodes = sortedNodes.filter((node) => {
    if (reachableNodeIds && !reachableNodeIds.has(node.id)) {
      return false;
    }

    if (node.id === startNodeId) {
      return true;
    }

    return !mockedNodeIdSet.has(node.id);
  });

  return {
    nodes,
    initialContext: buildPinnedExecutionContext(sortedNodes, pinnedData),
    mockedNodeIds,
  };
}
