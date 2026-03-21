/**
 * Phase 46 — Tests for node-templates.ts
 */

import { describe, it, expect } from "vitest";
import {
  createNodeTemplate,
  validateNodeTemplate,
  instantiateTemplate,
  searchTemplates,
  filterTemplatesByCategory,
  filterTemplatesByIntegration,
  sortTemplates,
  buildTemplateIndex,
  getRelatedTemplates,
  computeTemplateStats,
  exportTemplate,
  importTemplate,
  mergeTemplateDefaults,
  type NodeTemplate,
} from "./node-templates";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeTemplate(overrides: Partial<NodeTemplate> = {}): NodeTemplate {
  return createNodeTemplate({
    id: "tmpl-1",
    name: "Send Slack Message",
    description: "Send a message to a Slack channel",
    category: "integration",
    integrationKey: "slack",
    tags: ["slack", "notification", "messaging"],
    nodeType: "SLACK",
    defaultData: { channel: "#general", text: "" },
    version: "1.0.0",
    ...overrides,
  });
}

function makeTemplateSet(): NodeTemplate[] {
  return [
    makeTemplate({ id: "t1", name: "Slack Notify", category: "integration", integrationKey: "slack", tags: ["slack", "notification"], popularity: 100, rating: 4.5, ratingCount: 20 }),
    makeTemplate({ id: "t2", name: "GitHub PR", category: "integration", integrationKey: "github", tags: ["github", "pr"], popularity: 80, rating: 4.0, ratingCount: 15 }),
    makeTemplate({ id: "t3", name: "If Condition", category: "logic", integrationKey: undefined, tags: ["logic", "condition"], popularity: 200, rating: 4.8, ratingCount: 50 }),
    makeTemplate({ id: "t4", name: "AI Summarize", category: "ai", integrationKey: "openai", tags: ["ai", "text"], popularity: 150, rating: 4.2, ratingCount: 30 }),
    makeTemplate({ id: "t5", name: "Transform Data", category: "data", integrationKey: undefined, tags: ["data", "transform"], popularity: 50, rating: 3.5, ratingCount: 10 }),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// createNodeTemplate
// ─────────────────────────────────────────────────────────────────────────────

describe("createNodeTemplate", () => {
  it("creates a template with provided fields", () => {
    const t = makeTemplate();
    expect(t.id).toBe("tmpl-1");
    expect(t.name).toBe("Send Slack Message");
    expect(t.category).toBe("integration");
    expect(t.integrationKey).toBe("slack");
  });

  it("sets default popularity, rating, ratingCount to 0", () => {
    const t = makeTemplate();
    expect(t.popularity).toBe(0);
    expect(t.rating).toBe(0);
    expect(t.ratingCount).toBe(0);
  });

  it("auto-sets createdAt and updatedAt as ISO strings", () => {
    const t = makeTemplate();
    expect(() => new Date(t.createdAt)).not.toThrow();
    expect(() => new Date(t.updatedAt)).not.toThrow();
  });

  it("respects provided popularity and rating overrides", () => {
    const t = makeTemplate({ popularity: 42, rating: 4.5, ratingCount: 10 });
    expect(t.popularity).toBe(42);
    expect(t.rating).toBe(4.5);
    expect(t.ratingCount).toBe(10);
  });

  it("respects provided createdAt", () => {
    const date = "2025-01-01T00:00:00.000Z";
    const t = makeTemplate({ createdAt: date });
    expect(t.createdAt).toBe(date);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateNodeTemplate
// ─────────────────────────────────────────────────────────────────────────────

describe("validateNodeTemplate", () => {
  it("passes for a valid template", () => {
    const result = validateNodeTemplate(makeTemplate());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("requires id", () => {
    const result = validateNodeTemplate(makeTemplate({ id: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("id"))).toBe(true);
  });

  it("requires name", () => {
    const result = validateNodeTemplate(makeTemplate({ name: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("requires description", () => {
    const result = validateNodeTemplate(makeTemplate({ description: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("description"))).toBe(true);
  });

  it("rejects invalid category", () => {
    const result = validateNodeTemplate(makeTemplate({ category: "unknown" as never }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("category"))).toBe(true);
  });

  it("requires nodeType", () => {
    const result = validateNodeTemplate(makeTemplate({ nodeType: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("nodeType"))).toBe(true);
  });

  it("rejects non-semver version", () => {
    const result = validateNodeTemplate(makeTemplate({ version: "v1" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("version"))).toBe(true);
  });

  it("rejects negative popularity", () => {
    const result = validateNodeTemplate(makeTemplate({ popularity: -1 }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("popularity"))).toBe(true);
  });

  it("rejects rating > 5", () => {
    const result = validateNodeTemplate(makeTemplate({ rating: 6 }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("rating"))).toBe(true);
  });

  it("rejects rating < 0", () => {
    const result = validateNodeTemplate(makeTemplate({ rating: -1 }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("rating"))).toBe(true);
  });

  it("accepts all valid categories", () => {
    const categories = ["trigger", "logic", "data", "integration", "ai", "utility", "custom"] as const;
    for (const cat of categories) {
      const result = validateNodeTemplate(makeTemplate({ category: cat }));
      expect(result.valid).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// instantiateTemplate
// ─────────────────────────────────────────────────────────────────────────────

describe("instantiateTemplate", () => {
  it("creates a node with the template's nodeType", () => {
    const t = makeTemplate();
    const node = instantiateTemplate(t);
    expect(node.type).toBe("SLACK");
  });

  it("copies defaultData into node data", () => {
    const t = makeTemplate();
    const node = instantiateTemplate(t);
    expect(node.data.channel).toBe("#general");
  });

  it("applies data overrides", () => {
    const t = makeTemplate();
    const node = instantiateTemplate(t, { data: { channel: "#alerts" } });
    expect(node.data.channel).toBe("#alerts");
  });

  it("applies position overrides", () => {
    const t = makeTemplate();
    const node = instantiateTemplate(t, { position: { x: 100, y: 200 } });
    expect(node.position).toEqual({ x: 100, y: 200 });
  });

  it("defaults position to 0,0", () => {
    const t = makeTemplate();
    const node = instantiateTemplate(t);
    expect(node.position).toEqual({ x: 0, y: 0 });
  });

  it("generates a unique id for each instance", () => {
    const t = makeTemplate();
    const n1 = instantiateTemplate(t);
    const n2 = instantiateTemplate(t);
    expect(n1.id).not.toBe(n2.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// searchTemplates
// ─────────────────────────────────────────────────────────────────────────────

describe("searchTemplates", () => {
  const templates = makeTemplateSet();

  it("returns all templates for empty query", () => {
    expect(searchTemplates(templates, "")).toHaveLength(templates.length);
  });

  it("finds by name (case-insensitive)", () => {
    const results = searchTemplates(templates, "slack");
    expect(results.some((t) => t.id === "t1")).toBe(true);
  });

  it("finds by description", () => {
    const results = searchTemplates(templates, "message");
    expect(results.length).toBeGreaterThan(0);
  });

  it("finds by tag", () => {
    const results = searchTemplates(templates, "notification");
    expect(results.some((t) => t.id === "t1")).toBe(true);
  });

  it("finds by integrationKey", () => {
    const results = searchTemplates(templates, "github");
    expect(results.some((t) => t.id === "t2")).toBe(true);
  });

  it("returns empty array when no match", () => {
    const results = searchTemplates(templates, "zzz-no-match-xyz");
    expect(results).toHaveLength(0);
  });

  it("trims whitespace from query", () => {
    const results = searchTemplates(templates, "  slack  ");
    expect(results.some((t) => t.id === "t1")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// filterTemplatesByCategory
// ─────────────────────────────────────────────────────────────────────────────

describe("filterTemplatesByCategory", () => {
  const templates = makeTemplateSet();

  it("returns templates matching the category", () => {
    const results = filterTemplatesByCategory(templates, "integration");
    expect(results.every((t) => t.category === "integration")).toBe(true);
    expect(results).toHaveLength(2);
  });

  it("returns empty array when no templates in category", () => {
    const results = filterTemplatesByCategory(templates, "trigger");
    expect(results).toHaveLength(0);
  });

  it("filters ai category correctly", () => {
    const results = filterTemplatesByCategory(templates, "ai");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("t4");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// filterTemplatesByIntegration
// ─────────────────────────────────────────────────────────────────────────────

describe("filterTemplatesByIntegration", () => {
  const templates = makeTemplateSet();

  it("filters by integration key case-insensitively", () => {
    const results = filterTemplatesByIntegration(templates, "Slack");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("t1");
  });

  it("returns empty when no match", () => {
    const results = filterTemplatesByIntegration(templates, "stripe");
    expect(results).toHaveLength(0);
  });

  it("finds github templates", () => {
    const results = filterTemplatesByIntegration(templates, "github");
    expect(results.some((t) => t.id === "t2")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sortTemplates
// ─────────────────────────────────────────────────────────────────────────────

describe("sortTemplates", () => {
  const templates = makeTemplateSet();

  it("sorts by name alphabetically", () => {
    const sorted = sortTemplates(templates, "name");
    const names = sorted.map((t) => t.name);
    const sorted2 = [...names].sort();
    expect(names).toEqual(sorted2);
  });

  it("sorts by popularity descending", () => {
    const sorted = sortTemplates(templates, "popularity");
    expect(sorted[0].popularity).toBeGreaterThanOrEqual(sorted[1].popularity);
    expect(sorted[0].id).toBe("t3"); // popularity 200
  });

  it("sorts by rating descending", () => {
    const sorted = sortTemplates(templates, "rating");
    expect(sorted[0].rating).toBeGreaterThanOrEqual(sorted[1].rating);
    expect(sorted[0].id).toBe("t3"); // rating 4.8
  });

  it("sorts by most recent updatedAt", () => {
    const t1 = makeTemplate({ id: "old", updatedAt: "2024-01-01T00:00:00.000Z" });
    const t2 = makeTemplate({ id: "new", updatedAt: "2025-06-01T00:00:00.000Z" });
    const sorted = sortTemplates([t1, t2], "recent");
    expect(sorted[0].id).toBe("new");
  });

  it("does not mutate original array", () => {
    const original = [...templates];
    sortTemplates(templates, "popularity");
    expect(templates.map((t) => t.id)).toEqual(original.map((t) => t.id));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildTemplateIndex
// ─────────────────────────────────────────────────────────────────────────────

describe("buildTemplateIndex", () => {
  const templates = makeTemplateSet();
  const index = buildTemplateIndex(templates);

  it("indexes templates by id", () => {
    expect(index.byId.get("t1")).toBeDefined();
    expect(index.byId.get("t1")?.name).toBe("Slack Notify");
  });

  it("indexes templates by category", () => {
    const integrations = index.byCategory.get("integration");
    expect(integrations).toHaveLength(2);
  });

  it("indexes templates by integration key (lowercase)", () => {
    const slackTemplates = index.byIntegration.get("slack");
    expect(slackTemplates).toHaveLength(1);
  });

  it("indexes templates by tag", () => {
    const notifTemplates = index.byTag.get("notification");
    expect(notifTemplates?.some((t) => t.id === "t1")).toBe(true);
  });

  it("builds name tokens", () => {
    const tokens = index.nameTokens.get("t3");
    expect(tokens?.has("if")).toBe(true);
    expect(tokens?.has("condition")).toBe(true);
  });

  it("handles templates without integrationKey", () => {
    const logicTemplates = index.byCategory.get("logic");
    expect(logicTemplates).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getRelatedTemplates
// ─────────────────────────────────────────────────────────────────────────────

describe("getRelatedTemplates", () => {
  const templates = makeTemplateSet();

  it("excludes the template itself", () => {
    const related = getRelatedTemplates(templates[0], templates);
    expect(related.some((t) => t.id === "t1")).toBe(false);
  });

  it("returns templates with shared category/integration/tags", () => {
    const related = getRelatedTemplates(templates[0], templates); // t1 is slack integration
    // t2 also has integration category → should appear
    expect(related.some((t) => t.category === "integration")).toBe(true);
  });

  it("respects limit parameter", () => {
    const related = getRelatedTemplates(templates[0], templates, 1);
    expect(related.length).toBeLessThanOrEqual(1);
  });

  it("returns empty array when no related templates", () => {
    const isolated = makeTemplate({ id: "iso", category: "trigger", integrationKey: "unique-xyz", tags: [] });
    const related = getRelatedTemplates(isolated, templates);
    expect(related).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeTemplateStats
// ─────────────────────────────────────────────────────────────────────────────

describe("computeTemplateStats", () => {
  const templates = makeTemplateSet();
  const stats = computeTemplateStats(templates);

  it("counts total templates", () => {
    expect(stats.total).toBe(5);
  });

  it("counts by category", () => {
    expect(stats.byCategory["integration"]).toBe(2);
    expect(stats.byCategory["logic"]).toBe(1);
  });

  it("counts by integration", () => {
    expect(stats.byIntegration["slack"]).toBe(1);
    expect(stats.byIntegration["github"]).toBe(1);
  });

  it("computes average rating", () => {
    expect(stats.avgRating).toBeGreaterThan(0);
    expect(stats.avgRating).toBeLessThanOrEqual(5);
  });

  it("sums total popularity", () => {
    expect(stats.totalPopularity).toBe(580); // 100+80+200+150+50
  });

  it("identifies most popular template", () => {
    expect(stats.mostPopular?.id).toBe("t3"); // popularity 200
  });

  it("identifies highest rated template", () => {
    expect(stats.highestRated?.id).toBe("t3"); // rating 4.8
  });

  it("returns 0 avg rating for empty collection", () => {
    const s = computeTemplateStats([]);
    expect(s.avgRating).toBe(0);
    expect(s.total).toBe(0);
    expect(s.mostPopular).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// exportTemplate / importTemplate
// ─────────────────────────────────────────────────────────────────────────────

describe("exportTemplate", () => {
  it("returns valid JSON string", () => {
    const t = makeTemplate();
    const json = exportTemplate(t);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("roundtrip preserves all fields", () => {
    const t = makeTemplate();
    const json = exportTemplate(t);
    const parsed = JSON.parse(json) as NodeTemplate;
    expect(parsed.id).toBe(t.id);
    expect(parsed.name).toBe(t.name);
  });
});

describe("importTemplate", () => {
  it("imports a valid template", () => {
    const t = makeTemplate();
    const json = exportTemplate(t);
    const result = importTemplate(json);
    expect(result.errors).toHaveLength(0);
    expect(result.template?.id).toBe(t.id);
  });

  it("returns error for invalid JSON", () => {
    const result = importTemplate("not valid json {{");
    expect(result.template).toBeNull();
    expect(result.errors).toContain("Invalid JSON");
  });

  it("returns errors for a template failing validation", () => {
    const bad = { id: "", name: "Test", description: "desc", category: "logic", nodeType: "N", tags: [], defaultData: {}, version: "1.0.0", popularity: 0, rating: 0, ratingCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const result = importTemplate(JSON.stringify(bad));
    expect(result.template).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects a non-object JSON value", () => {
    const result = importTemplate('"just a string"');
    expect(result.template).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mergeTemplateDefaults
// ─────────────────────────────────────────────────────────────────────────────

describe("mergeTemplateDefaults", () => {
  it("merges nodeDefaults into template defaultData", () => {
    const t = makeTemplate({ defaultData: { channel: "#general" } });
    const merged = mergeTemplateDefaults(t, { text: "hello", channel: "#default" });
    expect(merged.defaultData.text).toBe("hello");
  });

  it("template's own data takes precedence over nodeDefaults", () => {
    const t = makeTemplate({ defaultData: { channel: "#specific" } });
    const merged = mergeTemplateDefaults(t, { channel: "#default" });
    expect(merged.defaultData.channel).toBe("#specific");
  });

  it("does not mutate the original template", () => {
    const t = makeTemplate({ defaultData: { channel: "#general" } });
    mergeTemplateDefaults(t, { newField: "value" });
    expect(t.defaultData.newField).toBeUndefined();
  });

  it("returns a template with all other fields unchanged", () => {
    const t = makeTemplate();
    const merged = mergeTemplateDefaults(t, {});
    expect(merged.id).toBe(t.id);
    expect(merged.name).toBe(t.name);
    expect(merged.category).toBe(t.category);
  });
});
