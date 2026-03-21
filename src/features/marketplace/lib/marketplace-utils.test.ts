import { describe, it, expect } from "vitest";
import {
  searchMarketplace,
  sortTemplates,
  getTrendingTemplates,
  getFeaturedTemplates,
  getByCategory,
  getRelatedTemplates,
  getCategoryStats,
  requiresPremiumCredentials,
  formatTemplatePrice,
  getTopTags,
} from "./marketplace-utils";
import type { MarketplaceTemplate } from "./marketplace-types";

const makeTemplate = (id: string, overrides: Partial<MarketplaceTemplate> = {}): MarketplaceTemplate => ({
  id,
  name: `Template ${id}`,
  description: `Description for template ${id}`,
  category: "productivity",
  tags: ["automation", "api"],
  author: { id: "author-1", name: "Author One", verified: true },
  stats: { downloads: 100, stars: 20, views: 500 },
  nodeCount: 5,
  requiredCredentials: [],
  version: "1.0.0",
  publishedAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-15"),
  featured: false,
  price: "free",
  ...overrides,
});

const templates: MarketplaceTemplate[] = [
  makeTemplate("t1", { category: "productivity", stats: { downloads: 1000, stars: 50, views: 5000 }, featured: true, tags: ["slack", "automation"] }),
  makeTemplate("t2", { category: "ai", stats: { downloads: 500, stars: 30, views: 2000 }, price: 10, tags: ["openai", "ai"] }),
  makeTemplate("t3", { category: "productivity", stats: { downloads: 200, stars: 10, views: 800 }, tags: ["email", "automation"] }),
  makeTemplate("t4", { category: "data", stats: { downloads: 800, stars: 40, views: 3000 }, requiredCredentials: ["OPENAI"] }),
  makeTemplate("t5", { category: "ai", stats: { downloads: 300, stars: 15, views: 1000 }, publishedAt: new Date("2026-02-01"), tags: ["gemini", "ai"] }),
];

describe("searchMarketplace", () => {
  it("returns all templates with no filter", () => {
    const result = searchMarketplace(templates);
    expect(result.total).toBe(5);
  });

  it("filters by category", () => {
    const result = searchMarketplace(templates, { category: "ai" });
    expect(result.total).toBe(2);
    expect(result.templates.every((t) => t.category === "ai")).toBe(true);
  });

  it("filters by text query", () => {
    const result = searchMarketplace(templates, { query: "slack" });
    expect(result.templates.some((t) => t.tags.includes("slack"))).toBe(true);
  });

  it("filters free only", () => {
    const result = searchMarketplace(templates, { freeOnly: true });
    expect(result.templates.every((t) => t.price === "free" || t.price === 0)).toBe(true);
  });

  it("filters by featured", () => {
    const result = searchMarketplace(templates, { featured: true });
    expect(result.templates.every((t) => t.featured)).toBe(true);
  });

  it("filters by tags", () => {
    const result = searchMarketplace(templates, { tags: ["ai"] });
    expect(result.total).toBe(2);
  });

  it("paginates correctly", () => {
    const result = searchMarketplace(templates, { limit: 2, offset: 0 });
    expect(result.templates).toHaveLength(2);
    expect(result.hasMore).toBe(true);
  });

  it("returns hasMore=false on last page", () => {
    const result = searchMarketplace(templates, { limit: 3, offset: 3 });
    expect(result.templates).toHaveLength(2);
    expect(result.hasMore).toBe(false);
  });
});

describe("sortTemplates", () => {
  it("sorts by downloads descending", () => {
    const sorted = sortTemplates(templates, "downloads");
    expect(sorted[0].stats.downloads).toBeGreaterThanOrEqual(sorted[1].stats.downloads);
  });

  it("sorts by stars descending", () => {
    const sorted = sortTemplates(templates, "stars");
    expect(sorted[0].stats.stars).toBeGreaterThanOrEqual(sorted[1].stats.stars);
  });

  it("sorts by newest first", () => {
    const sorted = sortTemplates(templates, "newest");
    expect(sorted[0].publishedAt.getTime()).toBeGreaterThanOrEqual(sorted[1].publishedAt.getTime());
  });

  it("sorts by relevance (featured first)", () => {
    const sorted = sortTemplates(templates, "relevance");
    expect(sorted[0].featured).toBe(true);
  });
});

describe("getTrendingTemplates", () => {
  it("returns top N by downloads", () => {
    const trending = getTrendingTemplates(templates, 3);
    expect(trending).toHaveLength(3);
    expect(trending[0].stats.downloads).toBeGreaterThanOrEqual(trending[1].stats.downloads);
  });
});

describe("getFeaturedTemplates", () => {
  it("returns only featured templates", () => {
    const featured = getFeaturedTemplates(templates);
    expect(featured.every((t) => t.featured)).toBe(true);
    expect(featured).toHaveLength(1);
  });
});

describe("getByCategory", () => {
  it("returns templates in the given category", () => {
    const result = getByCategory(templates, "ai");
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.category === "ai")).toBe(true);
  });
});

describe("getRelatedTemplates", () => {
  it("returns templates in same category excluding self", () => {
    const related = getRelatedTemplates(templates, templates[0], 5);
    expect(related.every((t) => t.category === templates[0].category)).toBe(true);
    expect(related.find((t) => t.id === templates[0].id)).toBeUndefined();
  });

  it("respects limit", () => {
    expect(getRelatedTemplates(templates, templates[0], 1)).toHaveLength(1);
  });
});

describe("getCategoryStats", () => {
  it("counts templates per category", () => {
    const stats = getCategoryStats(templates);
    expect(stats.productivity).toBe(2);
    expect(stats.ai).toBe(2);
    expect(stats.data).toBe(1);
  });
});

describe("requiresPremiumCredentials", () => {
  it("returns true for templates with premium creds", () => {
    const t = makeTemplate("t", { requiredCredentials: ["OPENAI"] });
    expect(requiresPremiumCredentials(t)).toBe(true);
  });

  it("returns false for templates without premium creds", () => {
    const t = makeTemplate("t", { requiredCredentials: ["GITHUB_TOKEN"] });
    expect(requiresPremiumCredentials(t)).toBe(false);
  });

  it("returns false for empty credentials", () => {
    expect(requiresPremiumCredentials(makeTemplate("t"))).toBe(false);
  });
});

describe("formatTemplatePrice", () => {
  it("formats free templates", () => {
    expect(formatTemplatePrice(makeTemplate("t", { price: "free" }))).toBe("Free");
    expect(formatTemplatePrice(makeTemplate("t", { price: 0 }))).toBe("Free");
  });

  it("formats paid templates", () => {
    expect(formatTemplatePrice(makeTemplate("t", { price: 10 }))).toBe("10 credits");
  });
});

describe("getTopTags", () => {
  it("returns top tags by frequency", () => {
    const topTags = getTopTags(templates, 3);
    expect(topTags).toHaveLength(3);
    // "automation" appears in t1 and t3, "ai" appears in t2 and t5
    expect(topTags).toContain("automation");
    expect(topTags).toContain("ai");
  });

  it("is case-insensitive", () => {
    const ts = [
      makeTemplate("a", { tags: ["OPENAI"] }),
      makeTemplate("b", { tags: ["openai"] }),
    ];
    const topTags = getTopTags(ts, 5);
    expect(topTags).toContain("openai");
    expect(topTags).toHaveLength(1); // deduplicated by lowercase
  });
});
