import { describe, it, expect } from "vitest";
import { exportWorkflow, validateImport, type WorkflowExport } from "./export-import";

describe("Export/Import Workflows", () => {
  describe("exportWorkflow", () => {
    it("should export a basic workflow", () => {
      const result = exportWorkflow(
        { name: "Test Workflow", description: "A test", tags: ["test"] },
        [
          { id: "n1", type: "MANUAL_TRIGGER", name: "Start", position: { x: 0, y: 0 }, data: {} },
          { id: "n2", type: "HTTP_REQUEST", name: "Request", position: { x: 250, y: 0 }, data: { url: "https://example.com" } },
        ],
        [{ fromNodeId: "n1", toNodeId: "n2", fromOutput: "main", toInput: "main" }],
      );

      expect(result.version).toBe("1.0.0");
      expect(result.exportedAt).toBeTruthy();
      expect(result.workflow.name).toBe("Test Workflow");
      expect(result.workflow.description).toBe("A test");
      expect(result.workflow.tags).toEqual(["test"]);
      expect(result.nodes).toHaveLength(2);
      expect(result.connections).toHaveLength(1);
    });

    it("should handle null description", () => {
      const result = exportWorkflow(
        { name: "Test", description: null, tags: [] },
        [],
        [],
      );
      expect(result.workflow.description).toBeUndefined();
    });

    it("should preserve node data", () => {
      const result = exportWorkflow(
        { name: "Test", tags: [] },
        [{ id: "n1", type: "CODE", name: "Code", position: { x: 0, y: 0 }, data: { code: "return 42;" } }],
        [],
      );
      expect(result.nodes[0].data).toEqual({ code: "return 42;" });
    });

    it("should handle empty data as empty object", () => {
      const result = exportWorkflow(
        { name: "Test", tags: [] },
        [{ id: "n1", type: "CODE", name: "Code", position: { x: 0, y: 0 }, data: null }],
        [],
      );
      expect(result.nodes[0].data).toEqual({});
    });

    it("should export valid ISO date", () => {
      const result = exportWorkflow({ name: "Test", tags: [] }, [], []);
      const date = new Date(result.exportedAt);
      expect(date.toISOString()).toBe(result.exportedAt);
    });
  });

  describe("validateImport", () => {
    const validExport: WorkflowExport = {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      workflow: { name: "Test", tags: [] },
      nodes: [
        { id: "n1", type: "MANUAL_TRIGGER", name: "Start", position: { x: 0, y: 0 }, data: {} },
        { id: "n2", type: "HTTP_REQUEST", name: "Req", position: { x: 250, y: 0 }, data: {} },
      ],
      connections: [
        { fromNodeId: "n1", toNodeId: "n2", fromOutput: "main", toInput: "main" },
      ],
    };

    it("should accept valid export data", () => {
      const result = validateImport(validExport);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.workflow).toBeDefined();
    });

    it("should reject null input", () => {
      const result = validateImport(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid format: expected JSON object");
    });

    it("should reject non-object input", () => {
      const result = validateImport("not an object");
      expect(result.valid).toBe(false);
    });

    it("should reject missing version", () => {
      const { version, ...noVersion } = validExport;
      const result = validateImport(noVersion);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing or invalid version field");
    });

    it("should reject missing workflow field", () => {
      const { workflow, ...noWorkflow } = validExport;
      const result = validateImport(noWorkflow);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing workflow field");
    });

    it("should reject missing nodes array", () => {
      const { nodes, ...noNodes } = validExport;
      const result = validateImport(noNodes);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing or invalid nodes array");
    });

    it("should reject missing connections array", () => {
      const { connections, ...noConnections } = validExport;
      const result = validateImport(noConnections);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing or invalid connections array");
    });

    it("should detect nodes missing id", () => {
      const data = {
        ...validExport,
        nodes: [{ type: "MANUAL_TRIGGER", position: { x: 0, y: 0 } }],
        connections: [],
      };
      const result = validateImport(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Node 0: missing id");
    });

    it("should detect nodes missing type", () => {
      const data = {
        ...validExport,
        nodes: [{ id: "n1", position: { x: 0, y: 0 } }],
        connections: [],
      };
      const result = validateImport(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Node 0: missing type");
    });

    it("should detect nodes missing position", () => {
      const data = {
        ...validExport,
        nodes: [{ id: "n1", type: "MANUAL_TRIGGER" }],
        connections: [],
      };
      const result = validateImport(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Node 0: missing position");
    });

    it("should detect invalid connection source node", () => {
      const data = {
        ...validExport,
        nodes: [{ id: "n1", type: "MANUAL_TRIGGER", position: { x: 0, y: 0 } }],
        connections: [{ fromNodeId: "invalid", toNodeId: "n1", fromOutput: "main", toInput: "main" }],
      };
      const result = validateImport(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Connection 0: invalid source node invalid");
    });

    it("should detect invalid connection target node", () => {
      const data = {
        ...validExport,
        nodes: [{ id: "n1", type: "MANUAL_TRIGGER", position: { x: 0, y: 0 } }],
        connections: [{ fromNodeId: "n1", toNodeId: "missing", fromOutput: "main", toInput: "main" }],
      };
      const result = validateImport(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Connection 0: invalid target node missing");
    });

    it("should collect multiple errors", () => {
      const data = {
        version: "1.0.0",
        workflow: { name: "Test" },
        nodes: [
          { type: "MANUAL_TRIGGER", position: { x: 0, y: 0 } },
          { id: "n2", position: { x: 250, y: 0 } },
        ],
        connections: [],
      };
      const result = validateImport(data);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
