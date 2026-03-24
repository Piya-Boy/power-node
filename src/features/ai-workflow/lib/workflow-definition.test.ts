import { describe, expect, it } from "vitest";
import { NodeType } from "@/generated/prisma";
import {
  normalizeWorkflowDefinition,
  triggerNodeTypes,
} from "./workflow-definition";

describe("workflow-definition helpers", () => {
  it("includes all supported trigger types", () => {
    expect(triggerNodeTypes).toContain(NodeType.EMAIL_TRIGGER);
    expect(triggerNodeTypes).toContain(NodeType.ERROR_TRIGGER);
  });

  it("preserves existing node ids when the AI reuses them", () => {
    const normalized = normalizeWorkflowDefinition(
      {
        nodes: [
          {
            id: "existing-node",
            type: NodeType.MANUAL_TRIGGER,
            name: "Start",
            position: { x: 100, y: 200 },
            data: {},
          },
        ],
        connections: [],
        summary: "Workflow",
      },
      [
        {
          id: "existing-node",
          type: NodeType.MANUAL_TRIGGER,
          name: "Start",
          position: { x: 100, y: 200 },
          data: {},
        },
      ],
    );

    expect(normalized.nodes[0]?.id).toBe("existing-node");
  });

  it("drops invalid node types and bad connections", () => {
    const normalized = normalizeWorkflowDefinition({
      nodes: [
        {
          id: "node_1",
          type: NodeType.MANUAL_TRIGGER,
          name: "Start",
          position: { x: 100, y: 200 },
          data: {},
        },
        {
          id: "node_2",
          type: "BAD_TYPE",
          name: "Bad",
          position: { x: 350, y: 200 },
          data: {},
        },
      ],
      connections: [
        {
          fromNodeId: "node_1",
          toNodeId: "node_2",
          fromOutput: "main",
          toInput: "main",
        },
      ],
      summary: "Workflow",
    });

    expect(normalized.nodes).toHaveLength(1);
    expect(normalized.connections).toHaveLength(0);
  });
});
