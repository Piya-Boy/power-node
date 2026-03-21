import { describe, it, expect } from "vitest";
import { workflowTemplates, getTemplateById, getTemplatesByCategory } from "./templates";
import { validateImport } from "./export-import";

describe("Workflow Templates", () => {
  it("should have at least 5 templates", () => {
    expect(workflowTemplates.length).toBeGreaterThanOrEqual(5);
  });

  it("should have unique IDs", () => {
    const ids = workflowTemplates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should all have valid workflow export format", () => {
    for (const template of workflowTemplates) {
      const result = validateImport(template.workflow);
      expect(result.valid, `Template "${template.name}" failed validation: ${result.errors.join(", ")}`).toBe(true);
    }
  });

  it("should all have required fields", () => {
    for (const template of workflowTemplates) {
      expect(template.id).toBeTruthy();
      expect(template.name).toBeTruthy();
      expect(template.description).toBeTruthy();
      expect(template.category).toBeTruthy();
      expect(template.icon).toBeTruthy();
    }
  });

  describe("getTemplateById", () => {
    it("should find existing template", () => {
      const template = getTemplateById("webhook-to-slack");
      expect(template).toBeDefined();
      expect(template?.name).toBe("Webhook to Slack");
    });

    it("should return undefined for non-existent template", () => {
      expect(getTemplateById("non-existent")).toBeUndefined();
    });
  });

  describe("getTemplatesByCategory", () => {
    it("should filter by automation category", () => {
      const templates = getTemplatesByCategory("automation");
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every((t) => t.category === "automation")).toBe(true);
    });

    it("should filter by ai category", () => {
      const templates = getTemplatesByCategory("ai");
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every((t) => t.category === "ai")).toBe(true);
    });

    it("should return empty for non-existent category", () => {
      const templates = getTemplatesByCategory("nonexistent" as any);
      expect(templates).toHaveLength(0);
    });
  });
});
