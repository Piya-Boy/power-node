/**
 * Phase 46 — Node Template Library
 * Pure utilities for creating, validating, searching, and managing reusable
 * node templates in the workflow editor.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type NodeCategory =
  | "trigger"
  | "logic"
  | "data"
  | "integration"
  | "ai"
  | "utility"
  | "custom";

export type SortBy = "name" | "popularity" | "recent" | "rating";

export interface NodeTemplate {
  id: string;
  name: string;
  description: string;
  category: NodeCategory;
  integrationKey?: string;     // e.g. "github", "slack", "notion"
  tags: string[];
  nodeType: string;            // maps to WorkflowNode.type
  defaultData: Record<string, unknown>;
  icon?: string;
  author?: string;
  version: string;
  createdAt: string;           // ISO 8601
  updatedAt: string;           // ISO 8601
  popularity: number;          // downloads/uses
  rating: number;              // 0-5
  ratingCount: number;
}

export interface WorkflowNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
  position: { x: number; y: number };
  [key: string]: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface TemplateIndex {
  byId: Map<string, NodeTemplate>;
  byCategory: Map<NodeCategory, NodeTemplate[]>;
  byIntegration: Map<string, NodeTemplate[]>;
  byTag: Map<string, NodeTemplate[]>;
  nameTokens: Map<string, Set<string>>;  // templateId → tokens
}

export interface TemplateStats {
  total: number;
  byCategory: Record<NodeCategory, number>;
  byIntegration: Record<string, number>;
  avgRating: number;
  totalPopularity: number;
  mostPopular: NodeTemplate | null;
  highestRated: NodeTemplate | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// createNodeTemplate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a reusable node template with sensible defaults.
 */
export function createNodeTemplate(
  params: Omit<NodeTemplate, "createdAt" | "updatedAt" | "popularity" | "rating" | "ratingCount"> &
    Partial<Pick<NodeTemplate, "createdAt" | "updatedAt" | "popularity" | "rating" | "ratingCount">>
): NodeTemplate {
  const now = new Date().toISOString();
  return {
    popularity: 0,
    rating: 0,
    ratingCount: 0,
    ...params,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// validateNodeTemplate
// ─────────────────────────────────────────────────────────────────────────────

const VALID_CATEGORIES: NodeCategory[] = [
  "trigger", "logic", "data", "integration", "ai", "utility", "custom",
];

/**
 * Validate that a template has all required fields with correct types/ranges.
 */
export function validateNodeTemplate(template: NodeTemplate): ValidationResult {
  const errors: string[] = [];

  if (!template.id || typeof template.id !== "string") {
    errors.push("template.id is required");
  }
  if (!template.name || typeof template.name !== "string") {
    errors.push("template.name is required");
  } else if (template.name.trim().length === 0) {
    errors.push("template.name must not be blank");
  }
  if (!template.description || typeof template.description !== "string") {
    errors.push("template.description is required");
  }
  if (!VALID_CATEGORIES.includes(template.category)) {
    errors.push(`template.category must be one of: ${VALID_CATEGORIES.join(", ")}`);
  }
  if (!template.nodeType || typeof template.nodeType !== "string") {
    errors.push("template.nodeType is required");
  }
  if (!Array.isArray(template.tags)) {
    errors.push("template.tags must be an array");
  }
  if (typeof template.defaultData !== "object" || template.defaultData === null) {
    errors.push("template.defaultData must be an object");
  }
  if (!template.version || !/^\d+\.\d+\.\d+$/.test(template.version)) {
    errors.push("template.version must be semver (e.g. 1.0.0)");
  }
  if (typeof template.popularity !== "number" || template.popularity < 0) {
    errors.push("template.popularity must be a non-negative number");
  }
  if (typeof template.rating !== "number" || template.rating < 0 || template.rating > 5) {
    errors.push("template.rating must be between 0 and 5");
  }
  if (typeof template.ratingCount !== "number" || template.ratingCount < 0) {
    errors.push("template.ratingCount must be a non-negative number");
  }

  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// instantiateTemplate
// ─────────────────────────────────────────────────────────────────────────────

let _instanceCounter = 0;

/**
 * Create a WorkflowNode instance from a template, optionally overriding data.
 */
export function instantiateTemplate(
  template: NodeTemplate,
  overrides?: Partial<{ data: Record<string, unknown>; position: { x: number; y: number } }>
): WorkflowNode {
  _instanceCounter += 1;
  const id = `${template.nodeType}-${_instanceCounter}`;
  return {
    id,
    type: template.nodeType,
    data: { ...template.defaultData, ...(overrides?.data ?? {}) },
    position: overrides?.position ?? { x: 0, y: 0 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// searchTemplates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search templates by name, description, or tags (case-insensitive substring).
 */
export function searchTemplates(
  templates: NodeTemplate[],
  query: string
): NodeTemplate[] {
  const q = query.toLowerCase().trim();
  if (!q) return [...templates];

  return templates.filter((t) => {
    const searchable = [
      t.name,
      t.description,
      ...t.tags,
      t.integrationKey ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return searchable.includes(q);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// filterTemplatesByCategory
// ─────────────────────────────────────────────────────────────────────────────

export function filterTemplatesByCategory(
  templates: NodeTemplate[],
  category: NodeCategory
): NodeTemplate[] {
  return templates.filter((t) => t.category === category);
}

// ─────────────────────────────────────────────────────────────────────────────
// filterTemplatesByIntegration
// ─────────────────────────────────────────────────────────────────────────────

export function filterTemplatesByIntegration(
  templates: NodeTemplate[],
  integrationKey: string
): NodeTemplate[] {
  const key = integrationKey.toLowerCase();
  return templates.filter((t) => t.integrationKey?.toLowerCase() === key);
}

// ─────────────────────────────────────────────────────────────────────────────
// sortTemplates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sort templates by name, popularity, most recent, or rating.
 */
export function sortTemplates(
  templates: NodeTemplate[],
  sortBy: SortBy
): NodeTemplate[] {
  const arr = [...templates];
  switch (sortBy) {
    case "name":
      return arr.sort((a, b) => a.name.localeCompare(b.name));
    case "popularity":
      return arr.sort((a, b) => b.popularity - a.popularity);
    case "recent":
      return arr.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    case "rating":
      return arr.sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount);
    default:
      return arr;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildTemplateIndex
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a multi-axis index over a template collection for fast lookups.
 */
export function buildTemplateIndex(templates: NodeTemplate[]): TemplateIndex {
  const byId = new Map<string, NodeTemplate>();
  const byCategory = new Map<NodeCategory, NodeTemplate[]>();
  const byIntegration = new Map<string, NodeTemplate[]>();
  const byTag = new Map<string, NodeTemplate[]>();
  const nameTokens = new Map<string, Set<string>>();

  for (const t of templates) {
    byId.set(t.id, t);

    // category
    if (!byCategory.has(t.category)) byCategory.set(t.category, []);
    byCategory.get(t.category)!.push(t);

    // integration
    if (t.integrationKey) {
      const key = t.integrationKey.toLowerCase();
      if (!byIntegration.has(key)) byIntegration.set(key, []);
      byIntegration.get(key)!.push(t);
    }

    // tags
    for (const tag of t.tags) {
      const tagLower = tag.toLowerCase();
      if (!byTag.has(tagLower)) byTag.set(tagLower, []);
      byTag.get(tagLower)!.push(t);
    }

    // name tokens
    const tokens = new Set(t.name.toLowerCase().split(/\s+/).filter(Boolean));
    nameTokens.set(t.id, tokens);
  }

  return { byId, byCategory, byIntegration, byTag, nameTokens };
}

// ─────────────────────────────────────────────────────────────────────────────
// getRelatedTemplates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find templates related to a given template (same category, shared tags,
 * or same integration). The template itself is excluded.
 */
export function getRelatedTemplates(
  template: NodeTemplate,
  allTemplates: NodeTemplate[],
  limit = 5
): NodeTemplate[] {
  const scores = new Map<string, number>();

  for (const t of allTemplates) {
    if (t.id === template.id) continue;
    let score = 0;

    if (t.category === template.category) score += 2;
    if (t.integrationKey && t.integrationKey === template.integrationKey) score += 3;

    const sharedTags = t.tags.filter((tag) => template.tags.includes(tag));
    score += sharedTags.length;

    if (score > 0) scores.set(t.id, score);
  }

  return allTemplates
    .filter((t) => scores.has(t.id))
    .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
    .slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// computeTemplateStats
// ─────────────────────────────────────────────────────────────────────────────

export function computeTemplateStats(templates: NodeTemplate[]): TemplateStats {
  const byCategory: Record<string, number> = {};
  const byIntegration: Record<string, number> = {};
  let totalRating = 0;
  let ratedCount = 0;
  let totalPopularity = 0;
  let mostPopular: NodeTemplate | null = null;
  let highestRated: NodeTemplate | null = null;

  for (const t of templates) {
    byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
    if (t.integrationKey) {
      byIntegration[t.integrationKey] = (byIntegration[t.integrationKey] ?? 0) + 1;
    }
    if (t.ratingCount > 0) {
      totalRating += t.rating * t.ratingCount;
      ratedCount += t.ratingCount;
    }
    totalPopularity += t.popularity;
    if (!mostPopular || t.popularity > mostPopular.popularity) mostPopular = t;
    if (!highestRated || t.rating > highestRated.rating) highestRated = t;
  }

  return {
    total: templates.length,
    byCategory: byCategory as Record<NodeCategory, number>,
    byIntegration,
    avgRating: ratedCount > 0 ? totalRating / ratedCount : 0,
    totalPopularity,
    mostPopular,
    highestRated,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// exportTemplate / importTemplate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serialize a template to a JSON string for export.
 */
export function exportTemplate(template: NodeTemplate): string {
  return JSON.stringify(template, null, 2);
}

/**
 * Deserialize and validate a template from a JSON string.
 */
export function importTemplate(json: string): {
  template: NodeTemplate | null;
  errors: string[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { template: null, errors: ["Invalid JSON"] };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { template: null, errors: ["JSON must be an object"] };
  }

  const candidate = parsed as NodeTemplate;
  const validation = validateNodeTemplate(candidate);
  if (!validation.valid) {
    return { template: null, errors: validation.errors };
  }

  return { template: candidate, errors: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// mergeTemplateDefaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merge per-node-type defaults into a template's defaultData.
 * The template's own data takes precedence over nodeDefaults.
 */
export function mergeTemplateDefaults(
  template: NodeTemplate,
  nodeDefaults: Record<string, unknown>
): NodeTemplate {
  return {
    ...template,
    defaultData: { ...nodeDefaults, ...template.defaultData },
  };
}
