import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { NodeType } from "@/generated/prisma";

export const availableNodeTypes = Object.values(NodeType).filter(
  (type) => type !== NodeType.INITIAL,
);

export const triggerNodeTypes = [
  NodeType.MANUAL_TRIGGER,
  NodeType.WEBHOOK_TRIGGER,
  NodeType.SCHEDULE_TRIGGER,
  NodeType.CHAT_TRIGGER,
  NodeType.GOOGLE_FORM_TRIGGER,
  NodeType.STRIPE_TRIGGER,
  NodeType.EMAIL_TRIGGER,
  NodeType.ERROR_TRIGGER,
] as const;

export const workflowNodeSchema = z.object({
  id: z.string().describe("Unique identifier for this node"),
  type: z.string().describe("The NodeType enum value"),
  name: z.string().describe("Human-readable name for this node"),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: z
    .record(z.string(), z.unknown())
    .describe("Configuration data for this node"),
});

export const workflowConnectionSchema = z.object({
  fromNodeId: z.string(),
  toNodeId: z.string(),
  fromOutput: z.string().default("main"),
  toInput: z.string().default("main"),
});

export const workflowSchema = z.object({
  nodes: z.array(workflowNodeSchema),
  connections: z.array(workflowConnectionSchema),
  summary: z.string().describe("Brief description of what this workflow does"),
});

export type WorkflowDefinition = z.infer<typeof workflowSchema>;
export type WorkflowDefinitionNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowDefinitionConnection = z.infer<
  typeof workflowConnectionSchema
>;

export function normalizeWorkflowDefinition(
  workflow: WorkflowDefinition,
  currentNodes: WorkflowDefinitionNode[] = [],
): WorkflowDefinition {
  const currentNodeIds = new Set(currentNodes.map((node) => node.id));
  const remappedIds = new Map<string, string>();
  const finalNodeIds = new Set<string>();
  const validNodeTypes = new Set<string>(availableNodeTypes);

  const nodes = workflow.nodes
    .filter((node) => validNodeTypes.has(node.type))
    .map((node) => {
      const originalId =
        typeof node.id === "string" && node.id.trim().length > 0
          ? node.id
          : createId();

      let id: string;

      if (currentNodeIds.has(originalId) && !finalNodeIds.has(originalId)) {
        id = originalId;
      } else {
        const existingId = remappedIds.get(originalId);
        id = existingId ?? createId();
      }

      remappedIds.set(originalId, id);
      finalNodeIds.add(id);

      return {
        ...node,
        id,
        name:
          typeof node.name === "string" && node.name.trim().length > 0
            ? node.name
            : node.type,
        data:
          typeof node.data === "object" &&
          node.data !== null &&
          !Array.isArray(node.data)
            ? node.data
            : {},
      };
    });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const connections = workflow.connections
    .map((connection) => {
      const fromNodeId =
        remappedIds.get(connection.fromNodeId) ?? connection.fromNodeId;
      const toNodeId =
        remappedIds.get(connection.toNodeId) ?? connection.toNodeId;

      return {
        ...connection,
        fromNodeId,
        toNodeId,
      };
    })
    .filter(
      (connection) =>
        nodeIds.has(connection.fromNodeId) && nodeIds.has(connection.toNodeId),
    );

  return {
    nodes,
    connections,
    summary: workflow.summary,
  };
}

export function formatWorkflowSnapshot(snapshot: {
  nodes: WorkflowDefinitionNode[];
  connections: WorkflowDefinitionConnection[];
}): string {
  return JSON.stringify(snapshot, null, 2);
}
