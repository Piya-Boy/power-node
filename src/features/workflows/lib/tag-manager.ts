/**
 * Phase 70 — Workflow Tag Manager
 * Pure utilities for creating, validating, normalizing, and querying
 * tags across workflows — with categories, hierarchies, and bulk ops.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TagColor =
  | "red" | "orange" | "yellow" | "green" | "teal"
  | "blue" | "indigo" | "purple" | "pink" | "gray";

export interface Tag {
  id: string;
  name: string;                 // normalized (lowercase, trimmed)
  displayName: string;          // original casing
  color: TagColor;
  category?: string;            // e.g. "env", "team", "status"
  description?: string;
  createdAt: Date;
  workflowCount: number;        // how many workflows carry this tag
}

export interface TaggedWorkflow {
  workflowId: string;
  tags: string[];               // tag IDs
}

export interface TagFilter {
  names?: string[];             // normalized names to match
  categories?: string[];
  colors?: TagColor[];
  minWorkflowCount?: number;
  search?: string;              // substring match on name/description
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a tag name: lowercase, trim, collapse whitespace/special chars.
 */
export function normalizeTagName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_\-\.:]/g, "")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 64);
}

/**
 * Validate a tag name (before normalization).
 */
export function validateTagName(name: string): { valid: boolean; error?: string } {
  if (!name || !name.trim()) return { valid: false, error: "Tag name cannot be empty" };
  if (name.trim().length > 64) return { valid: false, error: "Tag name too long (max 64 chars)" };
  const normalized = normalizeTagName(name);
  if (!normalized) return { valid: false, error: "Tag name contains only invalid characters" };
  return { valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tag Creation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new tag object.
 */
export function createTag(
  id: string,
  displayName: string,
  color: TagColor = "gray",
  options: { category?: string; description?: string; createdAt?: Date } = {}
): Tag {
  return {
    id,
    name: normalizeTagName(displayName),
    displayName,
    color,
    category: options.category,
    description: options.description,
    createdAt: options.createdAt ?? new Date(),
    workflowCount: 0,
  };
}

/**
 * Update a tag's workflow count by scanning tagged workflows.
 */
export function computeWorkflowCount(tagId: string, workflows: TaggedWorkflow[]): number {
  return workflows.filter((w) => w.tags.includes(tagId)).length;
}

/**
 * Rebuild workflowCount for all tags.
 */
export function refreshTagCounts(tags: Tag[], workflows: TaggedWorkflow[]): Tag[] {
  return tags.map((t) => ({ ...t, workflowCount: computeWorkflowCount(t.id, workflows) }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tag Assignment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add tags to a workflow (no duplicates).
 */
export function addTagsToWorkflow(workflow: TaggedWorkflow, tagIds: string[]): TaggedWorkflow {
  const existing = new Set(workflow.tags);
  const added = tagIds.filter((id) => !existing.has(id));
  return { ...workflow, tags: [...workflow.tags, ...added] };
}

/**
 * Remove tags from a workflow.
 */
export function removeTagsFromWorkflow(workflow: TaggedWorkflow, tagIds: string[]): TaggedWorkflow {
  const toRemove = new Set(tagIds);
  return { ...workflow, tags: workflow.tags.filter((id) => !toRemove.has(id)) };
}

/**
 * Replace all tags on a workflow.
 */
export function setWorkflowTags(workflow: TaggedWorkflow, tagIds: string[]): TaggedWorkflow {
  return { ...workflow, tags: [...new Set(tagIds)] };
}

/**
 * Toggle a tag: add if absent, remove if present.
 */
export function toggleTag(workflow: TaggedWorkflow, tagId: string): TaggedWorkflow {
  if (workflow.tags.includes(tagId)) {
    return removeTagsFromWorkflow(workflow, [tagId]);
  }
  return addTagsToWorkflow(workflow, [tagId]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Querying
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find workflows that have ALL of the given tags (AND logic).
 */
export function findWorkflowsWithAllTags(
  workflows: TaggedWorkflow[],
  tagIds: string[]
): TaggedWorkflow[] {
  return workflows.filter((w) => tagIds.every((id) => w.tags.includes(id)));
}

/**
 * Find workflows that have ANY of the given tags (OR logic).
 */
export function findWorkflowsWithAnyTag(
  workflows: TaggedWorkflow[],
  tagIds: string[]
): TaggedWorkflow[] {
  return workflows.filter((w) => tagIds.some((id) => w.tags.includes(id)));
}

/**
 * Find workflows that have NONE of the given tags.
 */
export function findWorkflowsWithoutTags(
  workflows: TaggedWorkflow[],
  tagIds: string[]
): TaggedWorkflow[] {
  return workflows.filter((w) => !tagIds.some((id) => w.tags.includes(id)));
}

/**
 * Find workflows that have no tags at all.
 */
export function findUntaggedWorkflows(workflows: TaggedWorkflow[]): TaggedWorkflow[] {
  return workflows.filter((w) => w.tags.length === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tag Filtering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filter a list of tags by a TagFilter.
 */
export function filterTags(tags: Tag[], filter: TagFilter): Tag[] {
  return tags.filter((tag) => {
    if (filter.names && !filter.names.includes(tag.name)) return false;
    if (filter.categories && tag.category && !filter.categories.includes(tag.category)) return false;
    if (filter.colors && !filter.colors.includes(tag.color)) return false;
    if (filter.minWorkflowCount !== undefined && tag.workflowCount < filter.minWorkflowCount) return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      const inName = tag.name.includes(q) || tag.displayName.toLowerCase().includes(q);
      const inDesc = tag.description?.toLowerCase().includes(q) ?? false;
      if (!inName && !inDesc) return false;
    }
    return true;
  });
}

/**
 * Group tags by their category.
 */
export function groupByCategory(tags: Tag[]): Map<string, Tag[]> {
  const map = new Map<string, Tag[]>();
  for (const tag of tags) {
    const cat = tag.category ?? "uncategorized";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(tag);
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sorting
// ─────────────────────────────────────────────────────────────────────────────

export type TagSortField = "name" | "workflowCount" | "createdAt";

/**
 * Sort tags by a field.
 */
export function sortTags(
  tags: Tag[],
  field: TagSortField = "name",
  order: "asc" | "desc" = "asc"
): Tag[] {
  return [...tags].sort((a, b) => {
    let cmp = 0;
    if (field === "name") cmp = a.name.localeCompare(b.name);
    else if (field === "workflowCount") cmp = a.workflowCount - b.workflowCount;
    else if (field === "createdAt") cmp = a.createdAt.getTime() - b.createdAt.getTime();
    return order === "asc" ? cmp : -cmp;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hierarchy (parent:child naming convention)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract parent category from a hierarchical tag name (e.g. "env:prod" → "env").
 */
export function getTagParent(tagName: string): string | undefined {
  const idx = tagName.indexOf(":");
  return idx > 0 ? tagName.slice(0, idx) : undefined;
}

/**
 * Get all child tag names under a parent prefix.
 */
export function getChildTags(tags: Tag[], parent: string): Tag[] {
  const prefix = parent.endsWith(":") ? parent : parent + ":";
  return tags.filter((t) => t.name.startsWith(prefix));
}

/**
 * Build a flat list of all unique parent names from a tag set.
 */
export function getParentNames(tags: Tag[]): string[] {
  const parents = new Set<string>();
  for (const tag of tags) {
    const p = getTagParent(tag.name);
    if (p) parents.add(p);
  }
  return [...parents].sort();
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk Operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rename a tag across all workflows (update ID references).
 */
export function renameTag(tags: Tag[], tagId: string, newDisplayName: string): Tag[] {
  return tags.map((t) =>
    t.id === tagId
      ? { ...t, displayName: newDisplayName, name: normalizeTagName(newDisplayName) }
      : t
  );
}

/**
 * Delete a tag — removes from the tag list and from all workflows.
 */
export function deleteTag(
  tags: Tag[],
  workflows: TaggedWorkflow[],
  tagId: string
): { tags: Tag[]; workflows: TaggedWorkflow[] } {
  return {
    tags: tags.filter((t) => t.id !== tagId),
    workflows: workflows.map((w) => removeTagsFromWorkflow(w, [tagId])),
  };
}

/**
 * Merge tag B into tag A — reassign all workflows from B to A, then remove B.
 */
export function mergeTags(
  tags: Tag[],
  workflows: TaggedWorkflow[],
  sourceId: string,
  targetId: string
): { tags: Tag[]; workflows: TaggedWorkflow[] } {
  const updatedWorkflows = workflows.map((w) => {
    if (!w.tags.includes(sourceId)) return w;
    const without = w.tags.filter((id) => id !== sourceId);
    return addTagsToWorkflow({ ...w, tags: without }, [targetId]);
  });
  const { tags: remainingTags, workflows: finalWorkflows } = deleteTag(tags, updatedWorkflows, sourceId);
  return { tags: remainingTags, workflows: finalWorkflows };
}

// ─────────────────────────────────────────────────────────────────────────────
// Statistics
// ─────────────────────────────────────────────────────────────────────────────

export interface TagStats {
  totalTags: number;
  totalTaggedWorkflows: number;
  untaggedWorkflows: number;
  avgTagsPerWorkflow: number;
  mostUsedTags: Array<{ tag: Tag; count: number }>;
  unusedTags: Tag[];
  categoryBreakdown: Array<{ category: string; count: number }>;
}

/**
 * Compute summary statistics over a tag+workflow dataset.
 */
export function computeTagStats(tags: Tag[], workflows: TaggedWorkflow[]): TagStats {
  const totalTaggedWorkflows = workflows.filter((w) => w.tags.length > 0).length;
  const untaggedWorkflows = workflows.length - totalTaggedWorkflows;
  const totalTagCount = workflows.reduce((s, w) => s + w.tags.length, 0);
  const avgTagsPerWorkflow = workflows.length > 0
    ? Math.round((totalTagCount / workflows.length) * 10) / 10
    : 0;

  const mostUsedTags = [...tags]
    .filter((t) => t.workflowCount > 0)
    .sort((a, b) => b.workflowCount - a.workflowCount)
    .slice(0, 10)
    .map((t) => ({ tag: t, count: t.workflowCount }));

  const unusedTags = tags.filter((t) => t.workflowCount === 0);

  const catCounts = new Map<string, number>();
  for (const tag of tags) {
    const cat = tag.category ?? "uncategorized";
    catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
  }
  const categoryBreakdown = [...catCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalTags: tags.length,
    totalTaggedWorkflows,
    untaggedWorkflows,
    avgTagsPerWorkflow,
    mostUsedTags,
    unusedTags,
    categoryBreakdown,
  };
}
