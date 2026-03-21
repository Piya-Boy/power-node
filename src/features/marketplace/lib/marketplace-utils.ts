/**
 * Phase 28 — Ecosystem & Scale: Marketplace utilities
 */

import type {
  MarketplaceTemplate,
  MarketplaceSearchOptions,
  MarketplaceSearchResult,
  MarketplaceCategory,
} from "./marketplace-types";

/**
 * Search and filter marketplace templates.
 */
export function searchMarketplace(
  templates: MarketplaceTemplate[],
  options: MarketplaceSearchOptions = {}
): MarketplaceSearchResult {
  const {
    query,
    category,
    tags,
    freeOnly,
    featured,
    sortBy = "downloads",
    limit = 20,
    offset = 0,
  } = options;

  let results = [...templates];

  // Filter by category
  if (category) {
    results = results.filter((t) => t.category === category);
  }

  // Filter by tags (any tag must match)
  if (tags && tags.length > 0) {
    results = results.filter((t) =>
      tags.some((tag) => t.tags.map((tt) => tt.toLowerCase()).includes(tag.toLowerCase()))
    );
  }

  // Filter by free only
  if (freeOnly) {
    results = results.filter((t) => t.price === "free" || t.price === 0);
  }

  // Filter by featured
  if (featured !== undefined) {
    results = results.filter((t) => t.featured === featured);
  }

  // Text search
  if (query && query.trim()) {
    const q = query.toLowerCase();
    results = results.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }

  const total = results.length;

  // Sort
  results = sortTemplates(results, sortBy);

  // Paginate
  const paginated = results.slice(offset, offset + limit);

  return {
    templates: paginated,
    total,
    hasMore: offset + limit < total,
  };
}

/**
 * Sort templates by the given criterion.
 */
export function sortTemplates(
  templates: MarketplaceTemplate[],
  sortBy: "downloads" | "stars" | "newest" | "relevance"
): MarketplaceTemplate[] {
  const sorted = [...templates];
  switch (sortBy) {
    case "downloads":
      return sorted.sort((a, b) => b.stats.downloads - a.stats.downloads);
    case "stars":
      return sorted.sort((a, b) => b.stats.stars - a.stats.stars);
    case "newest":
      return sorted.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    case "relevance":
    default:
      // Relevance: featured first, then downloads
      return sorted.sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        return b.stats.downloads - a.stats.downloads;
      });
  }
}

/**
 * Get trending templates (high downloads in last 30 days simulated by stats).
 */
export function getTrendingTemplates(
  templates: MarketplaceTemplate[],
  limit = 5
): MarketplaceTemplate[] {
  return sortTemplates(templates, "downloads").slice(0, limit);
}

/**
 * Get featured templates.
 */
export function getFeaturedTemplates(
  templates: MarketplaceTemplate[]
): MarketplaceTemplate[] {
  return templates.filter((t) => t.featured);
}

/**
 * Get templates by category.
 */
export function getByCategory(
  templates: MarketplaceTemplate[],
  category: MarketplaceCategory
): MarketplaceTemplate[] {
  return templates.filter((t) => t.category === category);
}

/**
 * Get related templates (same category, excluding the given template).
 */
export function getRelatedTemplates(
  templates: MarketplaceTemplate[],
  template: MarketplaceTemplate,
  limit = 4
): MarketplaceTemplate[] {
  return templates
    .filter((t) => t.id !== template.id && t.category === template.category)
    .sort((a, b) => b.stats.downloads - a.stats.downloads)
    .slice(0, limit);
}

/**
 * Get category distribution stats.
 */
export function getCategoryStats(
  templates: MarketplaceTemplate[]
): Record<MarketplaceCategory, number> {
  const stats = {} as Record<MarketplaceCategory, number>;
  for (const t of templates) {
    stats[t.category] = (stats[t.category] ?? 0) + 1;
  }
  return stats;
}

/**
 * Check if a template requires premium credentials.
 */
export function requiresPremiumCredentials(template: MarketplaceTemplate): boolean {
  const premiumCredentials = ["OPENAI", "ANTHROPIC", "GEMINI"];
  return template.requiredCredentials.some((c) => premiumCredentials.includes(c));
}

/**
 * Format a template's price for display.
 */
export function formatTemplatePrice(template: MarketplaceTemplate): string {
  if (template.price === "free" || template.price === 0) return "Free";
  return `${template.price} credits`;
}

/**
 * Get top tags across all templates (sorted by frequency).
 */
export function getTopTags(templates: MarketplaceTemplate[], limit = 10): string[] {
  const tagCounts: Record<string, number> = {};
  for (const t of templates) {
    for (const tag of t.tags) {
      tagCounts[tag.toLowerCase()] = (tagCounts[tag.toLowerCase()] ?? 0) + 1;
    }
  }
  return Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}
