import { describe, it, expect } from "vitest";
import {
  normalizeTagName,
  validateTagName,
  createTag,
  computeWorkflowCount,
  refreshTagCounts,
  addTagsToWorkflow,
  removeTagsFromWorkflow,
  setWorkflowTags,
  toggleTag,
  findWorkflowsWithAllTags,
  findWorkflowsWithAnyTag,
  findWorkflowsWithoutTags,
  findUntaggedWorkflows,
  filterTags,
  groupByCategory,
  sortTags,
  getTagParent,
  getChildTags,
  getParentNames,
  renameTag,
  deleteTag,
  mergeTags,
  computeTagStats,
  type Tag,
  type TaggedWorkflow,
} from "./tag-manager";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeTag(id: string, displayName: string, overrides: Partial<Tag> = {}): Tag {
  return createTag(id, displayName, "blue", { createdAt: new Date("2025-06-01"), ...overrides });
}

function makeWorkflow(workflowId: string, tags: string[] = []): TaggedWorkflow {
  return { workflowId, tags };
}

// ─────────────────────────────────────────────────────────────────────────────
// normalizeTagName
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizeTagName", () => {
  it("lowercases", () => expect(normalizeTagName("Hello")).toBe("hello"));
  it("trims whitespace", () => expect(normalizeTagName("  foo  ")).toBe("foo"));
  it("replaces spaces with dashes", () => expect(normalizeTagName("hello world")).toBe("hello-world"));
  it("removes invalid characters", () => expect(normalizeTagName("foo!@#bar")).toBe("foobar"));
  it("allows underscores, dashes, dots", () => expect(normalizeTagName("env_prod.v2-test")).toBe("env_prod.v2-test"));
  it("strips leading/trailing dashes", () => expect(normalizeTagName("-foo-")).toBe("foo"));
  it("truncates to 64 chars", () => {
    const long = "a".repeat(70);
    expect(normalizeTagName(long).length).toBe(64);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateTagName
// ─────────────────────────────────────────────────────────────────────────────

describe("validateTagName", () => {
  it("accepts valid name", () => expect(validateTagName("production").valid).toBe(true));
  it("rejects empty name", () => {
    const r = validateTagName("");
    expect(r.valid).toBe(false);
    expect(r.error).toBeDefined();
  });
  it("rejects whitespace only", () => expect(validateTagName("   ").valid).toBe(false));
  it("rejects too long name", () => expect(validateTagName("a".repeat(65)).valid).toBe(false));
  it("rejects name with only invalid chars", () => expect(validateTagName("!!!").valid).toBe(false));
});

// ─────────────────────────────────────────────────────────────────────────────
// createTag
// ─────────────────────────────────────────────────────────────────────────────

describe("createTag", () => {
  it("creates tag with normalized name", () => {
    const tag = createTag("t1", "My Tag");
    expect(tag.name).toBe("my-tag");
    expect(tag.displayName).toBe("My Tag");
    expect(tag.workflowCount).toBe(0);
    expect(tag.color).toBe("gray");
  });

  it("sets category and description", () => {
    const tag = createTag("t1", "prod", "green", { category: "env", description: "Production env" });
    expect(tag.category).toBe("env");
    expect(tag.description).toBe("Production env");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeWorkflowCount / refreshTagCounts
// ─────────────────────────────────────────────────────────────────────────────

describe("computeWorkflowCount", () => {
  it("counts workflows with the tag", () => {
    const workflows = [
      makeWorkflow("wf1", ["t1", "t2"]),
      makeWorkflow("wf2", ["t1"]),
      makeWorkflow("wf3", ["t2"]),
    ];
    expect(computeWorkflowCount("t1", workflows)).toBe(2);
    expect(computeWorkflowCount("t2", workflows)).toBe(2);
    expect(computeWorkflowCount("t3", workflows)).toBe(0);
  });
});

describe("refreshTagCounts", () => {
  it("updates workflowCount for all tags", () => {
    const tags = [makeTag("t1", "A"), makeTag("t2", "B")];
    const workflows = [makeWorkflow("wf1", ["t1"]), makeWorkflow("wf2", ["t1", "t2"])];
    const refreshed = refreshTagCounts(tags, workflows);
    expect(refreshed.find((t) => t.id === "t1")?.workflowCount).toBe(2);
    expect(refreshed.find((t) => t.id === "t2")?.workflowCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// addTagsToWorkflow / removeTagsFromWorkflow / setWorkflowTags / toggleTag
// ─────────────────────────────────────────────────────────────────────────────

describe("addTagsToWorkflow", () => {
  it("adds tags", () => {
    const wf = makeWorkflow("wf1", ["t1"]);
    const updated = addTagsToWorkflow(wf, ["t2", "t3"]);
    expect(updated.tags).toEqual(["t1", "t2", "t3"]);
  });

  it("does not add duplicates", () => {
    const wf = makeWorkflow("wf1", ["t1"]);
    const updated = addTagsToWorkflow(wf, ["t1", "t2"]);
    expect(updated.tags).toEqual(["t1", "t2"]);
  });

  it("does not mutate original", () => {
    const wf = makeWorkflow("wf1", ["t1"]);
    addTagsToWorkflow(wf, ["t2"]);
    expect(wf.tags).toHaveLength(1);
  });
});

describe("removeTagsFromWorkflow", () => {
  it("removes specified tags", () => {
    const wf = makeWorkflow("wf1", ["t1", "t2", "t3"]);
    expect(removeTagsFromWorkflow(wf, ["t2"]).tags).toEqual(["t1", "t3"]);
  });

  it("ignores non-existent tags", () => {
    const wf = makeWorkflow("wf1", ["t1"]);
    expect(removeTagsFromWorkflow(wf, ["t99"]).tags).toEqual(["t1"]);
  });
});

describe("setWorkflowTags", () => {
  it("replaces all tags", () => {
    const wf = makeWorkflow("wf1", ["t1", "t2"]);
    expect(setWorkflowTags(wf, ["t3"]).tags).toEqual(["t3"]);
  });

  it("deduplicates", () => {
    const wf = makeWorkflow("wf1", []);
    expect(setWorkflowTags(wf, ["t1", "t1", "t2"]).tags).toHaveLength(2);
  });
});

describe("toggleTag", () => {
  it("adds when absent", () => {
    const wf = makeWorkflow("wf1", []);
    expect(toggleTag(wf, "t1").tags).toContain("t1");
  });

  it("removes when present", () => {
    const wf = makeWorkflow("wf1", ["t1"]);
    expect(toggleTag(wf, "t1").tags).not.toContain("t1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findWorkflowsWithAllTags / AnyTag / WithoutTags / findUntagged
// ─────────────────────────────────────────────────────────────────────────────

describe("findWorkflowsWithAllTags", () => {
  it("returns only workflows with ALL specified tags", () => {
    const wfs = [
      makeWorkflow("wf1", ["t1", "t2"]),
      makeWorkflow("wf2", ["t1"]),
      makeWorkflow("wf3", ["t2", "t3"]),
    ];
    const result = findWorkflowsWithAllTags(wfs, ["t1", "t2"]);
    expect(result).toHaveLength(1);
    expect(result[0].workflowId).toBe("wf1");
  });
});

describe("findWorkflowsWithAnyTag", () => {
  it("returns workflows with at least one tag", () => {
    const wfs = [
      makeWorkflow("wf1", ["t1"]),
      makeWorkflow("wf2", ["t2"]),
      makeWorkflow("wf3", ["t3"]),
    ];
    const result = findWorkflowsWithAnyTag(wfs, ["t1", "t2"]);
    expect(result).toHaveLength(2);
  });
});

describe("findWorkflowsWithoutTags", () => {
  it("excludes workflows with any of the given tags", () => {
    const wfs = [
      makeWorkflow("wf1", ["t1"]),
      makeWorkflow("wf2", ["t2"]),
      makeWorkflow("wf3", ["t3"]),
    ];
    const result = findWorkflowsWithoutTags(wfs, ["t1", "t2"]);
    expect(result).toHaveLength(1);
    expect(result[0].workflowId).toBe("wf3");
  });
});

describe("findUntaggedWorkflows", () => {
  it("returns workflows with no tags", () => {
    const wfs = [makeWorkflow("wf1", ["t1"]), makeWorkflow("wf2", [])];
    const result = findUntaggedWorkflows(wfs);
    expect(result).toHaveLength(1);
    expect(result[0].workflowId).toBe("wf2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// filterTags
// ─────────────────────────────────────────────────────────────────────────────

describe("filterTags", () => {
  const tags = [
    { ...makeTag("t1", "Production"), category: "env", color: "green" as const, workflowCount: 5 },
    { ...makeTag("t2", "Staging"), category: "env", color: "yellow" as const, workflowCount: 2 },
    { ...makeTag("t3", "Alpha Team"), category: "team", color: "blue" as const, workflowCount: 0 },
  ];

  it("filters by name", () => {
    const r = filterTags(tags, { names: ["production"] });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("t1");
  });

  it("filters by category", () => {
    const r = filterTags(tags, { categories: ["env"] });
    expect(r).toHaveLength(2);
  });

  it("filters by color", () => {
    const r = filterTags(tags, { colors: ["green"] });
    expect(r).toHaveLength(1);
  });

  it("filters by minWorkflowCount", () => {
    const r = filterTags(tags, { minWorkflowCount: 3 });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("t1");
  });

  it("filters by search substring", () => {
    const r = filterTags(tags, { search: "team" });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("t3");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// groupByCategory
// ─────────────────────────────────────────────────────────────────────────────

describe("groupByCategory", () => {
  it("groups tags by category", () => {
    const tags = [
      { ...makeTag("t1", "Prod"), category: "env" as const },
      { ...makeTag("t2", "Stage"), category: "env" as const },
      { ...makeTag("t3", "Backend") },
    ];
    const groups = groupByCategory(tags);
    expect(groups.get("env")).toHaveLength(2);
    expect(groups.get("uncategorized")).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sortTags
// ─────────────────────────────────────────────────────────────────────────────

describe("sortTags", () => {
  const tags = [
    { ...makeTag("t1", "Zebra"), workflowCount: 1 },
    { ...makeTag("t2", "Apple"), workflowCount: 5 },
    { ...makeTag("t3", "Mango"), workflowCount: 3 },
  ];

  it("sorts by name ascending", () => {
    const sorted = sortTags(tags, "name", "asc");
    expect(sorted[0].name).toBe("apple");
    expect(sorted[2].name).toBe("zebra");
  });

  it("sorts by name descending", () => {
    const sorted = sortTags(tags, "name", "desc");
    expect(sorted[0].name).toBe("zebra");
  });

  it("sorts by workflowCount descending", () => {
    const sorted = sortTags(tags, "workflowCount", "desc");
    expect(sorted[0].workflowCount).toBe(5);
    expect(sorted[2].workflowCount).toBe(1);
  });

  it("does not mutate input", () => {
    const copy = [...tags];
    sortTags(tags, "name");
    expect(tags[0].name).toBe(copy[0].name);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Hierarchy
// ─────────────────────────────────────────────────────────────────────────────

describe("getTagParent", () => {
  it("extracts parent from hierarchical name", () => {
    expect(getTagParent("env:prod")).toBe("env");
    expect(getTagParent("team:backend:api")).toBe("team");
  });

  it("returns undefined for flat name", () => {
    expect(getTagParent("production")).toBeUndefined();
  });
});

describe("getChildTags", () => {
  it("returns tags with parent prefix", () => {
    const tags = [
      makeTag("t1", "env:prod"),
      makeTag("t2", "env:staging"),
      makeTag("t3", "team:backend"),
    ];
    const children = getChildTags(tags, "env");
    expect(children).toHaveLength(2);
  });
});

describe("getParentNames", () => {
  it("returns unique parent names", () => {
    const tags = [
      makeTag("t1", "env:prod"),
      makeTag("t2", "env:staging"),
      makeTag("t3", "team:backend"),
      makeTag("t4", "standalone"),
    ];
    const parents = getParentNames(tags);
    expect(parents).toEqual(["env", "team"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// renameTag / deleteTag / mergeTags
// ─────────────────────────────────────────────────────────────────────────────

describe("renameTag", () => {
  it("renames the display name and re-normalizes", () => {
    const tags = [makeTag("t1", "Old Name")];
    const updated = renameTag(tags, "t1", "New Name");
    expect(updated[0].displayName).toBe("New Name");
    expect(updated[0].name).toBe("new-name");
  });

  it("leaves other tags unchanged", () => {
    const tags = [makeTag("t1", "A"), makeTag("t2", "B")];
    const updated = renameTag(tags, "t1", "C");
    expect(updated[1].name).toBe("b");
  });
});

describe("deleteTag", () => {
  it("removes tag from list and from all workflows", () => {
    const tags = [makeTag("t1", "A"), makeTag("t2", "B")];
    const workflows = [makeWorkflow("wf1", ["t1", "t2"]), makeWorkflow("wf2", ["t1"])];
    const { tags: newTags, workflows: newWfs } = deleteTag(tags, workflows, "t1");
    expect(newTags).toHaveLength(1);
    expect(newWfs.every((w) => !w.tags.includes("t1"))).toBe(true);
  });
});

describe("mergeTags", () => {
  it("reassigns workflows from source to target", () => {
    const tags = [makeTag("t1", "Old"), makeTag("t2", "New")];
    const workflows = [
      makeWorkflow("wf1", ["t1"]),
      makeWorkflow("wf2", ["t1", "t2"]),
      makeWorkflow("wf3", ["t2"]),
    ];
    const { tags: newTags, workflows: newWfs } = mergeTags(tags, workflows, "t1", "t2");
    expect(newTags).toHaveLength(1);
    expect(newTags[0].id).toBe("t2");
    expect(newWfs.every((w) => !w.tags.includes("t1"))).toBe(true);
    expect(newWfs.every((w) => w.tags.includes("t2"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeTagStats
// ─────────────────────────────────────────────────────────────────────────────

describe("computeTagStats", () => {
  it("handles empty dataset", () => {
    const stats = computeTagStats([], []);
    expect(stats.totalTags).toBe(0);
    expect(stats.avgTagsPerWorkflow).toBe(0);
  });

  it("computes basic stats", () => {
    const tags = [
      { ...makeTag("t1", "A"), workflowCount: 3 },
      { ...makeTag("t2", "B"), workflowCount: 0 },
    ];
    const workflows = [
      makeWorkflow("wf1", ["t1"]),
      makeWorkflow("wf2", ["t1"]),
      makeWorkflow("wf3", []),
    ];
    const stats = computeTagStats(tags, workflows);
    expect(stats.totalTags).toBe(2);
    expect(stats.totalTaggedWorkflows).toBe(2);
    expect(stats.untaggedWorkflows).toBe(1);
    expect(stats.unusedTags).toHaveLength(1);
    expect(stats.unusedTags[0].id).toBe("t2");
  });

  it("ranks most used tags", () => {
    const tags = [
      { ...makeTag("t1", "Pop"), workflowCount: 10 },
      { ...makeTag("t2", "Rare"), workflowCount: 1 },
    ];
    const stats = computeTagStats(tags, []);
    expect(stats.mostUsedTags[0].tag.id).toBe("t1");
  });

  it("builds category breakdown", () => {
    const tags = [
      { ...makeTag("t1", "A"), category: "env" as const },
      { ...makeTag("t2", "B"), category: "env" as const },
      { ...makeTag("t3", "C"), category: "team" as const },
    ];
    const stats = computeTagStats(tags, []);
    const envEntry = stats.categoryBreakdown.find((c) => c.category === "env");
    expect(envEntry?.count).toBe(2);
  });
});
