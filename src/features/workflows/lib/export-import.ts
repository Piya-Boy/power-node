import { type NodeType } from "@/generated/prisma";

// Workflow export format
export interface WorkflowExport {
  version: string;
  exportedAt: string;
  workflow: {
    name: string;
    description?: string;
    tags: string[];
  };
  nodes: {
    id: string;
    type: string;
    name: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }[];
  connections: {
    fromNodeId: string;
    toNodeId: string;
    fromOutput: string;
    toInput: string;
  }[];
}

const EXPORT_VERSION = "1.0.0";

export function exportWorkflow(
  workflow: {
    name: string;
    description?: string | null;
    tags: string[];
  },
  nodes: {
    id: string;
    type: string;
    name: string;
    position: unknown;
    data: unknown;
  }[],
  connections: {
    fromNodeId: string;
    toNodeId: string;
    fromOutput: string;
    toInput: string;
  }[],
): WorkflowExport {
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    workflow: {
      name: workflow.name,
      description: workflow.description || undefined,
      tags: workflow.tags,
    },
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      name: n.name,
      position: n.position as { x: number; y: number },
      data: (n.data as Record<string, unknown>) || {},
    })),
    connections: connections.map((c) => ({
      fromNodeId: c.fromNodeId,
      toNodeId: c.toNodeId,
      fromOutput: c.fromOutput,
      toInput: c.toInput,
    })),
  };
}

export function validateImport(data: unknown): {
  valid: boolean;
  errors: string[];
  workflow?: WorkflowExport;
} {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Invalid format: expected JSON object"] };
  }

  const obj = data as Record<string, unknown>;

  if (!obj.version || typeof obj.version !== "string") {
    errors.push("Missing or invalid version field");
  }

  if (!obj.workflow || typeof obj.workflow !== "object") {
    errors.push("Missing workflow field");
  }

  if (!Array.isArray(obj.nodes)) {
    errors.push("Missing or invalid nodes array");
  }

  if (!Array.isArray(obj.connections)) {
    errors.push("Missing or invalid connections array");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Validate nodes
  const nodes = obj.nodes as unknown[];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i] as Record<string, unknown>;
    if (!node.id) errors.push(`Node ${i}: missing id`);
    if (!node.type) errors.push(`Node ${i}: missing type`);
    if (!node.position) errors.push(`Node ${i}: missing position`);
  }

  // Validate connections
  const nodeIds = new Set(
    (nodes as Record<string, unknown>[]).map((n) => n.id),
  );
  const connections = obj.connections as Record<string, unknown>[];
  for (let i = 0; i < connections.length; i++) {
    const conn = connections[i];
    if (!nodeIds.has(conn.fromNodeId)) {
      errors.push(`Connection ${i}: invalid source node ${conn.fromNodeId}`);
    }
    if (!nodeIds.has(conn.toNodeId)) {
      errors.push(`Connection ${i}: invalid target node ${conn.toNodeId}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    workflow: errors.length === 0 ? (data as WorkflowExport) : undefined,
  };
}
