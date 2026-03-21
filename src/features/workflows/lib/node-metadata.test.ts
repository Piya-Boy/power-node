import { describe, it, expect } from "vitest";
import { NodeType } from "@/generated/prisma";
import {
  nodeMetadataMap,
  getNodeMetadata,
  getNodesByCategory,
  searchNodes,
} from "./node-metadata";

describe("Node Metadata", () => {
  it("should have metadata for all NodeType values", () => {
    const allTypes = Object.values(NodeType);
    for (const type of allTypes) {
      expect(nodeMetadataMap[type], `Missing metadata for ${type}`).toBeDefined();
    }
  });

  it("should have matching type field", () => {
    for (const [key, meta] of Object.entries(nodeMetadataMap)) {
      expect(meta.type).toBe(key);
    }
  });

  it("should have non-empty labels and descriptions", () => {
    for (const meta of Object.values(nodeMetadataMap)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
    }
  });

  it("should have valid categories", () => {
    const validCategories = ["trigger", "execution", "logic", "data", "utility", "integration", "ai"];
    for (const meta of Object.values(nodeMetadataMap)) {
      expect(validCategories).toContain(meta.category);
    }
  });

  it("trigger nodes should have 0 inputs", () => {
    const triggers = Object.values(nodeMetadataMap).filter((m) => m.category === "trigger");
    for (const t of triggers) {
      expect(t.inputs, `${t.type} should have 0 inputs`).toBe(0);
    }
  });

  describe("getNodeMetadata", () => {
    it("should return metadata for known type", () => {
      const meta = getNodeMetadata(NodeType.HTTP_REQUEST);
      expect(meta).toBeDefined();
      expect(meta?.label).toBe("HTTP Request");
    });

    it("should return undefined for unknown type", () => {
      expect(getNodeMetadata("UNKNOWN")).toBeUndefined();
    });
  });

  describe("getNodesByCategory", () => {
    it("should return trigger nodes", () => {
      const triggers = getNodesByCategory("trigger");
      expect(triggers.length).toBeGreaterThan(0);
      expect(triggers.every((m) => m.category === "trigger")).toBe(true);
    });

    it("should return AI nodes", () => {
      const ai = getNodesByCategory("ai");
      expect(ai.length).toBeGreaterThan(0);
      expect(ai.every((m) => m.category === "ai")).toBe(true);
    });

    it("should return integration nodes", () => {
      const integrations = getNodesByCategory("integration");
      expect(integrations.length).toBeGreaterThan(0);
    });
  });

  describe("searchNodes", () => {
    it("should find by label", () => {
      const results = searchNodes("HTTP");
      expect(results.some((m) => m.type === NodeType.HTTP_REQUEST)).toBe(true);
    });

    it("should find by description", () => {
      const results = searchNodes("webhook");
      expect(results.length).toBeGreaterThan(0);
    });

    it("should be case insensitive", () => {
      const results = searchNodes("openai");
      expect(results.some((m) => m.type === NodeType.OPENAI)).toBe(true);
    });

    it("should return all for empty query", () => {
      const all = searchNodes("");
      expect(all.length).toBe(Object.keys(nodeMetadataMap).length);
    });

    it("should find Telegram", () => {
      const results = searchNodes("telegram");
      expect(results.some((m) => m.type === NodeType.TELEGRAM)).toBe(true);
    });
  });
});
