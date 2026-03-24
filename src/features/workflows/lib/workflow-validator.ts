import { NodeType } from "@/generated/prisma";

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  nodeId?: string;
  type:
    | "missing_trigger"
    | "orphan_node"
    | "cycle"
    | "missing_credential"
    | "invalid_config"
    | "duplicate_connection";
  message: string;
}

export interface ValidationWarning {
  nodeId?: string;
  type:
    | "unused_output"
    | "no_error_handling"
    | "complex_workflow"
    | "missing_name";
  message: string;
}

const TRIGGER_TYPES: string[] = [
  NodeType.MANUAL_TRIGGER,
  NodeType.WEBHOOK_TRIGGER,
  NodeType.SCHEDULE_TRIGGER,
  NodeType.CHAT_TRIGGER,
  NodeType.GOOGLE_FORM_TRIGGER,
  NodeType.STRIPE_TRIGGER,
  NodeType.EMAIL_TRIGGER,
  NodeType.ERROR_TRIGGER,
];

const CREDENTIAL_REQUIRED_TYPES: string[] = [
  NodeType.OPENAI,
  NodeType.ANTHROPIC,
  NodeType.GEMINI,
  NodeType.TELEGRAM,
  NodeType.NOTION,
  NodeType.GITHUB,
  NodeType.GOOGLE_SHEETS,
  NodeType.GOOGLE_CALENDAR,
  NodeType.GOOGLE_DRIVE,
  NodeType.GMAIL,
  NodeType.POSTGRESQL_QUERY,
  NodeType.MYSQL_QUERY,
  NodeType.EMAIL_SMTP,
  NodeType.OLLAMA,
];

interface WorkflowNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
  credentialId?: string | null;
}

interface WorkflowConnection {
  fromNodeId: string;
  toNodeId: string;
}

export function validateWorkflow(
  nodes: WorkflowNode[],
  connections: WorkflowConnection[],
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Filter out non-functional nodes
  const functionalNodes = nodes.filter(
    (n) => n.type !== NodeType.INITIAL && n.type !== NodeType.STICKY_NOTE,
  );

  // 1. Check for trigger
  const hasTrigger = functionalNodes.some((n) =>
    TRIGGER_TYPES.includes(n.type),
  );
  if (!hasTrigger && functionalNodes.length > 0) {
    errors.push({
      type: "missing_trigger",
      message: "Workflow must have at least one trigger node",
    });
  }

  // 2. Check for orphan nodes (not connected to anything)
  const connectedNodeIds = new Set<string>();
  for (const conn of connections) {
    connectedNodeIds.add(conn.fromNodeId);
    connectedNodeIds.add(conn.toNodeId);
  }

  for (const node of functionalNodes) {
    if (!connectedNodeIds.has(node.id) && !TRIGGER_TYPES.includes(node.type)) {
      // Trigger nodes without connections are OK (single-node workflows)
      if (functionalNodes.length > 1) {
        warnings.push({
          nodeId: node.id,
          type: "unused_output",
          message: `Node "${node.type}" is not connected to any other node`,
        });
      }
    }
  }

  // 3. Check for cycles (simple DFS)
  const cycleErrors = detectCycles(functionalNodes, connections);
  errors.push(...cycleErrors);

  // 4. Check for duplicate connections
  const connSet = new Set<string>();
  for (const conn of connections) {
    const key = `${conn.fromNodeId}->${conn.toNodeId}`;
    if (connSet.has(key)) {
      errors.push({
        type: "duplicate_connection",
        message: `Duplicate connection from ${conn.fromNodeId} to ${conn.toNodeId}`,
      });
    }
    connSet.add(key);
  }

  // 5. Check credential requirements
  for (const node of functionalNodes) {
    if (CREDENTIAL_REQUIRED_TYPES.includes(node.type) && !node.credentialId) {
      warnings.push({
        nodeId: node.id,
        type: "no_error_handling",
        message: `Node "${node.type}" may need credentials to execute`,
      });
    }
  }

  // 6. Complexity warning
  if (functionalNodes.length > 50) {
    warnings.push({
      type: "complex_workflow",
      message: `Workflow has ${functionalNodes.length} nodes. Consider splitting into sub-workflows.`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function detectCycles(
  nodes: WorkflowNode[],
  connections: WorkflowConnection[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const conn of connections) {
    const edges = adjacency.get(conn.fromNodeId);
    if (edges) edges.push(conn.toNodeId);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    inStack.add(nodeId);

    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (inStack.has(neighbor)) {
        errors.push({
          nodeId: neighbor,
          type: "cycle",
          message: `Cycle detected involving node ${neighbor}`,
        });
        return true;
      }
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      }
    }

    inStack.delete(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }

  return errors;
}

export function getNodeValidationRules(nodeType: string): {
  requiredFields: string[];
  optionalFields: string[];
} {
  switch (nodeType) {
    case NodeType.HTTP_REQUEST:
      return {
        requiredFields: ["endpoint", "method"],
        optionalFields: ["body", "headers", "variableName"],
      };
    case NodeType.OPENAI:
    case NodeType.ANTHROPIC:
    case NodeType.GEMINI:
      return {
        requiredFields: ["userPrompt"],
        optionalFields: ["systemPrompt", "variableName", "model"],
      };
    case NodeType.IF_CONDITION:
      return {
        requiredFields: ["field", "operator", "value"],
        optionalFields: ["variableName"],
      };
    case NodeType.CODE:
      return {
        requiredFields: ["code"],
        optionalFields: ["language", "variableName"],
      };
    case NodeType.TELEGRAM:
      return {
        requiredFields: ["chatId", "message"],
        optionalFields: ["variableName"],
      };
    case NodeType.EMAIL_SMTP:
      return {
        requiredFields: ["to", "subject", "body"],
        optionalFields: ["variableName"],
      };
    case NodeType.DISCORD:
      return {
        requiredFields: ["webhookUrl", "content"],
        optionalFields: ["variableName"],
      };
    case NodeType.SLACK:
      return {
        requiredFields: ["webhookUrl", "text"],
        optionalFields: ["variableName"],
      };
    case NodeType.SCHEDULE_TRIGGER:
      return { requiredFields: ["cron"], optionalFields: ["variableName"] };
    case NodeType.EMAIL_TRIGGER:
      return {
        requiredFields: ["credentialId", "mailbox"],
        optionalFields: [
          "variableName",
          "from",
          "subject",
          "unseenOnly",
          "markAsSeen",
          "maxMessages",
        ],
      };
    case NodeType.ERROR_TRIGGER:
      return {
        requiredFields: [],
        optionalFields: ["variableName", "sourceWorkflowId", "messageIncludes"],
      };
    default:
      return { requiredFields: [], optionalFields: ["variableName"] };
  }
}

export function validateNodeData(
  nodeType: string,
  data: Record<string, unknown>,
): string[] {
  const rules = getNodeValidationRules(nodeType);
  const errors: string[] = [];

  for (const field of rules.requiredFields) {
    const value = data[field];
    if (value === undefined || value === null || value === "") {
      errors.push(`Missing required field: ${field}`);
    }
  }

  return errors;
}
