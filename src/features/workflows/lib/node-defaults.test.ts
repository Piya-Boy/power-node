import { describe, it, expect } from "vitest";
import { NodeType } from "@/generated/prisma";
import { nodeDefaults, getNodeDefaults, hasDefaults } from "./node-defaults";

describe("Node Defaults", () => {
  it("should have defaults for all non-initial NodeType values", () => {
    const allTypes = Object.values(NodeType).filter(
      (t) => t !== NodeType.INITIAL && t !== NodeType.SPLIT && t !== NodeType.SUB_WORKFLOW &&
             t !== NodeType.COMPRESS
    );
    for (const type of allTypes) {
      expect(nodeDefaults[type], `Missing defaults for ${type}`).toBeDefined();
    }
  });

  it("should have variableName in most node defaults", () => {
    const typesWithoutVariableName = [NodeType.STICKY_NOTE, NodeType.STOP_ERROR, NodeType.INITIAL];
    for (const [type, defaults] of Object.entries(nodeDefaults)) {
      if (typesWithoutVariableName.includes(type as NodeType)) continue;
      expect(defaults.variableName, `${type} should have variableName`).toBeDefined();
    }
  });

  it("should have sensible model for OpenAI", () => {
    expect(nodeDefaults[NodeType.OPENAI]?.model).toBeTruthy();
  });

  it("should have default cron for SCHEDULE_TRIGGER", () => {
    expect(nodeDefaults[NodeType.SCHEDULE_TRIGGER]?.cron).toBeTruthy();
  });

  describe("getNodeDefaults", () => {
    it("should return defaults for known type", () => {
      const defaults = getNodeDefaults(NodeType.HTTP_REQUEST);
      expect(defaults.method).toBe("GET");
    });

    it("should apply overrides", () => {
      const defaults = getNodeDefaults(NodeType.HTTP_REQUEST, { method: "POST" });
      expect(defaults.method).toBe("POST");
    });

    it("should return empty object for unknown type", () => {
      expect(getNodeDefaults("UNKNOWN")).toEqual({});
    });

    it("should not mutate original defaults", () => {
      getNodeDefaults(NodeType.HTTP_REQUEST, { method: "POST" });
      expect(nodeDefaults[NodeType.HTTP_REQUEST]?.method).toBe("GET");
    });
  });

  describe("hasDefaults", () => {
    it("should return true for types with defaults", () => {
      expect(hasDefaults(NodeType.OPENAI)).toBe(true);
      expect(hasDefaults(NodeType.TELEGRAM)).toBe(true);
    });

    it("should return false for unknown types", () => {
      expect(hasDefaults("UNKNOWN")).toBe(false);
    });
  });
});
