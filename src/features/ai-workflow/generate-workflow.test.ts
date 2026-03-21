import { describe, expect, it } from "vitest";
import { NodeType } from "@/generated/prisma";
import type { GenerateWorkflowOptions } from "./generate-workflow";

// Test the workflow validation and ID remapping logic
type GeneratedNode = {
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

type GeneratedConnection = {
  fromNodeId: string;
  toNodeId: string;
  fromOutput: string;
  toInput: string;
};

type GeneratedWorkflow = {
  nodes: GeneratedNode[];
  connections: GeneratedConnection[];
  summary: string;
};

function validateWorkflow(workflow: GeneratedWorkflow): string[] {
  const errors: string[] = [];

  if (workflow.nodes.length === 0) {
    errors.push("Workflow must have at least one node");
  }

  // Check for trigger node
  const triggerTypes = [
    NodeType.MANUAL_TRIGGER,
    NodeType.WEBHOOK_TRIGGER,
    NodeType.SCHEDULE_TRIGGER,
    NodeType.CHAT_TRIGGER,
    NodeType.GOOGLE_FORM_TRIGGER,
    NodeType.STRIPE_TRIGGER,
  ] as string[];

  const hasTrigger = workflow.nodes.some((n) => triggerTypes.includes(n.type));
  if (!hasTrigger) {
    errors.push("Workflow must have at least one trigger node");
  }

  // Check for duplicate IDs
  const ids = new Set<string>();
  for (const node of workflow.nodes) {
    if (ids.has(node.id)) {
      errors.push(`Duplicate node ID: ${node.id}`);
    }
    ids.add(node.id);
  }

  // Check connections reference valid nodes
  for (const conn of workflow.connections) {
    if (!ids.has(conn.fromNodeId)) {
      errors.push(
        `Connection references unknown source node: ${conn.fromNodeId}`,
      );
    }
    if (!ids.has(conn.toNodeId)) {
      errors.push(
        `Connection references unknown target node: ${conn.toNodeId}`,
      );
    }
  }

  // Check for valid node types
  const validTypes = new Set(Object.values(NodeType) as string[]);
  for (const node of workflow.nodes) {
    if (!validTypes.has(node.type)) {
      errors.push(`Invalid node type: ${node.type}`);
    }
  }

  return errors;
}

function remapIds(
  workflow: GeneratedWorkflow,
  idGenerator: () => string,
): GeneratedWorkflow {
  const idMap = new Map<string, string>();

  const nodes = workflow.nodes.map((node) => {
    const newId = idGenerator();
    idMap.set(node.id, newId);
    return { ...node, id: newId };
  });

  const connections = workflow.connections.map((conn) => ({
    ...conn,
    fromNodeId: idMap.get(conn.fromNodeId) || conn.fromNodeId,
    toNodeId: idMap.get(conn.toNodeId) || conn.toNodeId,
  }));

  return { nodes, connections, summary: workflow.summary };
}

describe("generateWorkflowFromPrompt options", () => {
  it("accepts optional modelId for OpenAI models", () => {
    const full: GenerateWorkflowOptions = { modelId: "gpt-4o" };
    const mini: GenerateWorkflowOptions = { modelId: "gpt-4o-mini" };
    expect(full.modelId).toBe("gpt-4o");
    expect(mini.modelId).toBe("gpt-4o-mini");
  });
});

describe("AI Workflow Generator", () => {
  it("should validate workflow has nodes", () => {
    const errors = validateWorkflow({
      nodes: [],
      connections: [],
      summary: "Empty workflow",
    });
    expect(errors).toContain("Workflow must have at least one node");
  });

  it("should validate workflow has a trigger", () => {
    const errors = validateWorkflow({
      nodes: [
        {
          id: "1",
          type: NodeType.HTTP_REQUEST,
          name: "Request",
          position: { x: 0, y: 0 },
          data: {},
        },
      ],
      connections: [],
      summary: "No trigger",
    });
    expect(errors).toContain("Workflow must have at least one trigger node");
  });

  it("should pass validation for valid workflow", () => {
    const errors = validateWorkflow({
      nodes: [
        {
          id: "1",
          type: NodeType.MANUAL_TRIGGER,
          name: "Start",
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: "2",
          type: NodeType.HTTP_REQUEST,
          name: "Request",
          position: { x: 250, y: 0 },
          data: {},
        },
      ],
      connections: [
        { fromNodeId: "1", toNodeId: "2", fromOutput: "main", toInput: "main" },
      ],
      summary: "Simple workflow",
    });
    expect(errors).toHaveLength(0);
  });

  it("should detect duplicate IDs", () => {
    const errors = validateWorkflow({
      nodes: [
        {
          id: "1",
          type: NodeType.MANUAL_TRIGGER,
          name: "Start",
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: "1",
          type: NodeType.HTTP_REQUEST,
          name: "Request",
          position: { x: 250, y: 0 },
          data: {},
        },
      ],
      connections: [],
      summary: "Dupe IDs",
    });
    expect(errors).toContain("Duplicate node ID: 1");
  });

  it("should detect invalid connection references", () => {
    const errors = validateWorkflow({
      nodes: [
        {
          id: "1",
          type: NodeType.MANUAL_TRIGGER,
          name: "Start",
          position: { x: 0, y: 0 },
          data: {},
        },
      ],
      connections: [
        {
          fromNodeId: "1",
          toNodeId: "99",
          fromOutput: "main",
          toInput: "main",
        },
      ],
      summary: "Bad connection",
    });
    expect(errors).toContain("Connection references unknown target node: 99");
  });

  it("should detect invalid node types", () => {
    const errors = validateWorkflow({
      nodes: [
        {
          id: "1",
          type: "INVALID_TYPE",
          name: "Bad",
          position: { x: 0, y: 0 },
          data: {},
        },
      ],
      connections: [],
      summary: "Bad type",
    });
    expect(errors).toContain("Invalid node type: INVALID_TYPE");
  });

  it("should remap IDs correctly", () => {
    let counter = 0;
    const workflow: GeneratedWorkflow = {
      nodes: [
        {
          id: "old_1",
          type: NodeType.MANUAL_TRIGGER,
          name: "Start",
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: "old_2",
          type: NodeType.HTTP_REQUEST,
          name: "Request",
          position: { x: 250, y: 0 },
          data: {},
        },
      ],
      connections: [
        {
          fromNodeId: "old_1",
          toNodeId: "old_2",
          fromOutput: "main",
          toInput: "main",
        },
      ],
      summary: "Test",
    };

    const remapped = remapIds(workflow, () => `new_${++counter}`);

    expect(remapped.nodes[0].id).toBe("new_1");
    expect(remapped.nodes[1].id).toBe("new_2");
    expect(remapped.connections[0].fromNodeId).toBe("new_1");
    expect(remapped.connections[0].toNodeId).toBe("new_2");
  });

  it("should accept all trigger types as valid", () => {
    const triggerTypes = [
      NodeType.MANUAL_TRIGGER,
      NodeType.WEBHOOK_TRIGGER,
      NodeType.SCHEDULE_TRIGGER,
      NodeType.CHAT_TRIGGER,
    ];

    for (const triggerType of triggerTypes) {
      const errors = validateWorkflow({
        nodes: [
          {
            id: "1",
            type: triggerType,
            name: "Trigger",
            position: { x: 0, y: 0 },
            data: {},
          },
        ],
        connections: [],
        summary: `Workflow with ${triggerType}`,
      });
      expect(errors, `Should accept trigger type: ${triggerType}`).toHaveLength(
        0,
      );
    }
  });
});
