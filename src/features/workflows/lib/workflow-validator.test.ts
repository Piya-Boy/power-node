import { describe, expect, it } from "vitest";
import { NodeType } from "@/generated/prisma";
import {
  getNodeValidationRules,
  validateNodeData,
  validateWorkflow,
} from "./workflow-validator";

describe("Workflow Validator", () => {
  describe("validateWorkflow", () => {
    it("should pass for valid workflow with trigger", () => {
      const result = validateWorkflow(
        [
          { id: "1", type: NodeType.MANUAL_TRIGGER },
          { id: "2", type: NodeType.HTTP_REQUEST },
        ],
        [{ fromNodeId: "1", toNodeId: "2" }],
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail when no trigger node", () => {
      const result = validateWorkflow(
        [{ id: "1", type: NodeType.HTTP_REQUEST }],
        [],
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === "missing_trigger")).toBe(
        true,
      );
    });

    it("should skip INITIAL and STICKY_NOTE nodes for trigger check", () => {
      const result = validateWorkflow(
        [
          { id: "1", type: NodeType.INITIAL },
          { id: "2", type: NodeType.STICKY_NOTE },
          { id: "3", type: NodeType.MANUAL_TRIGGER },
        ],
        [],
      );
      expect(result.valid).toBe(true);
    });

    it("should detect cycles", () => {
      const result = validateWorkflow(
        [
          { id: "1", type: NodeType.MANUAL_TRIGGER },
          { id: "2", type: NodeType.CODE },
          { id: "3", type: NodeType.CODE },
        ],
        [
          { fromNodeId: "1", toNodeId: "2" },
          { fromNodeId: "2", toNodeId: "3" },
          { fromNodeId: "3", toNodeId: "2" }, // cycle
        ],
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === "cycle")).toBe(true);
    });

    it("should detect duplicate connections", () => {
      const result = validateWorkflow(
        [
          { id: "1", type: NodeType.MANUAL_TRIGGER },
          { id: "2", type: NodeType.CODE },
        ],
        [
          { fromNodeId: "1", toNodeId: "2" },
          { fromNodeId: "1", toNodeId: "2" }, // duplicate
        ],
      );
      expect(result.errors.some((e) => e.type === "duplicate_connection")).toBe(
        true,
      );
    });

    it("should warn about disconnected nodes", () => {
      const result = validateWorkflow(
        [
          { id: "1", type: NodeType.MANUAL_TRIGGER },
          { id: "2", type: NodeType.HTTP_REQUEST },
          { id: "3", type: NodeType.CODE }, // disconnected
        ],
        [{ fromNodeId: "1", toNodeId: "2" }],
      );
      expect(result.warnings.some((w) => w.type === "unused_output")).toBe(
        true,
      );
    });

    it("should warn about credential requirements", () => {
      const result = validateWorkflow(
        [
          { id: "1", type: NodeType.MANUAL_TRIGGER },
          { id: "2", type: NodeType.OPENAI }, // no credentialId
        ],
        [{ fromNodeId: "1", toNodeId: "2" }],
      );
      expect(result.warnings.some((w) => w.nodeId === "2")).toBe(true);
    });

    it("should not warn about credentials when provided", () => {
      const result = validateWorkflow(
        [
          { id: "1", type: NodeType.MANUAL_TRIGGER },
          { id: "2", type: NodeType.OPENAI, credentialId: "cred_123" },
        ],
        [{ fromNodeId: "1", toNodeId: "2" }],
      );
      expect(result.warnings.filter((w) => w.nodeId === "2")).toHaveLength(0);
    });

    it("should warn about complex workflows", () => {
      const nodes: { id: string; type: NodeType }[] = [
        { id: "trigger", type: NodeType.MANUAL_TRIGGER },
      ];
      for (let i = 0; i < 55; i++) {
        nodes.push({ id: `n${i}`, type: NodeType.CODE });
      }
      const result = validateWorkflow(nodes, []);
      expect(result.warnings.some((w) => w.type === "complex_workflow")).toBe(
        true,
      );
    });

    it("should pass for empty workflow", () => {
      const result = validateWorkflow([], []);
      expect(result.valid).toBe(true);
    });

    it("should accept all trigger types", () => {
      const triggerTypes = [
        NodeType.MANUAL_TRIGGER,
        NodeType.WEBHOOK_TRIGGER,
        NodeType.SCHEDULE_TRIGGER,
        NodeType.CHAT_TRIGGER,
        NodeType.GOOGLE_FORM_TRIGGER,
        NodeType.STRIPE_TRIGGER,
        NodeType.EMAIL_TRIGGER,
        NodeType.ERROR_TRIGGER,
      ];

      for (const tt of triggerTypes) {
        const result = validateWorkflow([{ id: "1", type: tt }], []);
        expect(result.valid, `Should accept ${tt} as trigger`).toBe(true);
      }
    });
  });

  describe("validateNodeData", () => {
    it("should validate HTTP_REQUEST required fields", () => {
      const errors = validateNodeData(NodeType.HTTP_REQUEST, {});
      expect(errors).toContain("Missing required field: endpoint");
      expect(errors).toContain("Missing required field: method");
    });

    it("should pass valid HTTP_REQUEST data", () => {
      const errors = validateNodeData(NodeType.HTTP_REQUEST, {
        endpoint: "https://api.example.com",
        method: "GET",
      });
      expect(errors).toHaveLength(0);
    });

    it("should validate AI nodes need userPrompt", () => {
      const errors = validateNodeData(NodeType.OPENAI, {});
      expect(errors).toContain("Missing required field: userPrompt");
    });

    it("should validate IF_CONDITION required fields", () => {
      const errors = validateNodeData(NodeType.IF_CONDITION, {});
      expect(errors).toContain("Missing required field: field");
      expect(errors).toContain("Missing required field: operator");
      expect(errors).toContain("Missing required field: value");
    });

    it("should validate CODE requires code field", () => {
      const errors = validateNodeData(NodeType.CODE, {});
      expect(errors).toContain("Missing required field: code");
    });

    it("should validate EMAIL_SMTP required fields", () => {
      const errors = validateNodeData(NodeType.EMAIL_SMTP, {});
      expect(errors.length).toBe(3); // to, subject, body
    });

    it("should treat empty string as missing", () => {
      const errors = validateNodeData(NodeType.HTTP_REQUEST, {
        endpoint: "",
        method: "GET",
      });
      expect(errors).toContain("Missing required field: endpoint");
    });

    it("should return empty for unknown node types", () => {
      const errors = validateNodeData("UNKNOWN_TYPE", {});
      expect(errors).toHaveLength(0);
    });
  });

  describe("getNodeValidationRules", () => {
    it("should return rules for HTTP_REQUEST", () => {
      const rules = getNodeValidationRules(NodeType.HTTP_REQUEST);
      expect(rules.requiredFields).toContain("endpoint");
      expect(rules.requiredFields).toContain("method");
    });

    it("should return rules for TELEGRAM", () => {
      const rules = getNodeValidationRules(NodeType.TELEGRAM);
      expect(rules.requiredFields).toContain("chatId");
      expect(rules.requiredFields).toContain("message");
    });

    it("should return empty rules for unknown types", () => {
      const rules = getNodeValidationRules("UNKNOWN");
      expect(rules.requiredFields).toHaveLength(0);
    });

    it("should include variableName as optional for most types", () => {
      const rules = getNodeValidationRules(NodeType.CODE);
      expect(rules.optionalFields).toContain("variableName");
    });
  });
});
