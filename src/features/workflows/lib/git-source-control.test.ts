import { describe, it, expect, beforeEach } from "vitest";
import {
  createGitConfig,
  validateGitConfig,
  buildGitPath,
  extractWorkflowsFromTree,
  serializeWorkflow,
  parseWorkflowFromGit,
  buildCommitMessage,
  createSyncRecord,
  detectConflict,
  resolveConflict,
  computeSyncStatus,
  getPendingSyncWorkflows,
  computeGitSyncSummary,
  buildGitAuthHeaders,
  buildAuthenticatedCloneUrl,
  describeSyncRecord,
  resetSyncIdSeq,
  type WorkflowGitState,
} from "./git-source-control";

beforeEach(() => resetSyncIdSeq());

// ─── createGitConfig ──────────────────────────────────────────────────────────

describe("createGitConfig", () => {
  it("creates config with defaults", () => {
    const c = createGitConfig("https://github.com/org/repo.git", "main");
    expect(c.repoUrl).toBe("https://github.com/org/repo.git");
    expect(c.branch).toBe("main");
    expect(c.authorName).toBe("PowerNode");
    expect(c.authorEmail).toBe("powernode@noreply.local");
    expect(c.basePath).toBe("workflows");
  });

  it("accepts optional overrides", () => {
    const c = createGitConfig("https://example.com/repo.git", "develop", {
      token: "tok_123",
      authorName: "Bot",
      authorEmail: "bot@example.com",
      basePath: "automation",
    });
    expect(c.token).toBe("tok_123");
    expect(c.authorName).toBe("Bot");
    expect(c.basePath).toBe("automation");
  });
});

// ─── validateGitConfig ────────────────────────────────────────────────────────

describe("validateGitConfig", () => {
  it("valid HTTPS config passes", () => {
    const c = createGitConfig("https://github.com/a/b.git", "main", { token: "t" });
    const r = validateGitConfig(c);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("valid SSH config passes", () => {
    const c = createGitConfig("git@github.com:org/repo.git", "main");
    const r = validateGitConfig(c);
    expect(r.valid).toBe(true);
  });

  it("missing repoUrl fails", () => {
    const c = createGitConfig("", "main");
    const r = validateGitConfig(c);
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("repoUrl is required");
  });

  it("invalid repoUrl fails", () => {
    const c = createGitConfig("not-a-url", "main");
    const r = validateGitConfig(c);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("valid HTTPS or SSH"))).toBe(true);
  });

  it("missing branch fails", () => {
    const c = createGitConfig("https://example.com/r.git", "");
    const r = validateGitConfig(c);
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("branch is required");
  });

  it("warns when no token", () => {
    const c = createGitConfig("https://example.com/r.git", "main");
    const r = validateGitConfig(c);
    expect(r.warnings.some((w) => w.includes("No token"))).toBe(true);
  });

  it("invalid email fails", () => {
    const c = createGitConfig("https://example.com/r.git", "main", {
      authorEmail: "not-an-email",
    });
    const r = validateGitConfig(c);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("authorEmail"))).toBe(true);
  });

  it("absolute basePath fails", () => {
    const c = createGitConfig("https://example.com/r.git", "main", { basePath: "/abs/path" });
    const r = validateGitConfig(c);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("basePath"))).toBe(true);
  });
});

// ─── buildGitPath ─────────────────────────────────────────────────────────────

describe("buildGitPath", () => {
  it("builds a path with slug and id", () => {
    const path = buildGitPath("abc123", "My Workflow", "workflows");
    expect(path).toBe("workflows/my-workflow-abc123.json");
  });

  it("uses default basePath", () => {
    const path = buildGitPath("id1", "Test");
    expect(path.startsWith("workflows/")).toBe(true);
  });

  it("sanitizes special chars in name", () => {
    const path = buildGitPath("id2", "Hello World & Stuff!!!");
    expect(path).toContain("hello-world-stuff");
  });
});

// ─── extractWorkflowsFromTree ─────────────────────────────────────────────────

describe("extractWorkflowsFromTree", () => {
  it("extracts workflows from path list", () => {
    const paths = [
      "workflows/my-flow-wf_abc.json",
      "workflows/other-flow-wf_def.json",
      "README.md",
      "workflows/subfolder/deep.json",
    ];
    const refs = extractWorkflowsFromTree(paths);
    expect(refs).toHaveLength(3);
    expect(refs.map((r) => r.path)).toContain("workflows/my-flow-wf_abc.json");
  });

  it("returns empty array for no matches", () => {
    expect(extractWorkflowsFromTree(["README.md", "src/main.ts"])).toHaveLength(0);
  });
});

// ─── serializeWorkflow ────────────────────────────────────────────────────────

describe("serializeWorkflow", () => {
  it("produces deterministic JSON", () => {
    const wf = { name: "Test", nodes: [], id: "abc" };
    const json = serializeWorkflow(wf);
    expect(JSON.parse(json)).toEqual(wf);
    // should be 2-space indented
    expect(json).toContain("\n");
  });
});

// ─── parseWorkflowFromGit ─────────────────────────────────────────────────────

describe("parseWorkflowFromGit", () => {
  it("parses valid JSON object", () => {
    const json = '{"id":"abc","name":"Test"}';
    const parsed = parseWorkflowFromGit(json);
    expect(parsed).toEqual({ id: "abc", name: "Test" });
  });

  it("returns null for invalid JSON", () => {
    expect(parseWorkflowFromGit("not json")).toBeNull();
  });

  it("returns null for JSON array", () => {
    expect(parseWorkflowFromGit("[1,2,3]")).toBeNull();
  });

  it("returns null for JSON primitive", () => {
    expect(parseWorkflowFromGit('"string"')).toBeNull();
  });
});

// ─── buildCommitMessage ───────────────────────────────────────────────────────

describe("buildCommitMessage", () => {
  it("builds create message", () => {
    const msg = buildCommitMessage("create", "My Workflow");
    expect(msg).toContain("feat(workflow):");
    expect(msg).toContain("My Workflow");
  });

  it("builds update message with version", () => {
    const msg = buildCommitMessage("update", "Flow", { version: 3 });
    expect(msg).toContain("v3");
  });

  it("builds delete message", () => {
    expect(buildCommitMessage("delete", "Flow")).toContain("delete");
  });

  it("includes tag when provided", () => {
    const msg = buildCommitMessage("update", "Flow", { tag: "prod" });
    expect(msg).toContain("[prod]");
  });
});

// ─── createSyncRecord ─────────────────────────────────────────────────────────

describe("createSyncRecord", () => {
  it("creates a sync record with defaults", () => {
    const r = createSyncRecord("wf_1", "push");
    expect(r.workflowId).toBe("wf_1");
    expect(r.operation).toBe("push");
    expect(r.status).toBe("success");
    expect(r.id).toMatch(/^sync_/);
    expect(r.syncedAt).toBeInstanceOf(Date);
  });

  it("accepts commit hash and message", () => {
    const r = createSyncRecord("wf_2", "pull", {
      commitHash: "abc1234",
      commitMessage: "chore: update flow",
    });
    expect(r.commitHash).toBe("abc1234");
    expect(r.commitMessage).toBe("chore: update flow");
  });

  it("can create failed records", () => {
    const r = createSyncRecord("wf_3", "push", {
      status: "failed",
      error: "Authentication failed",
    });
    expect(r.status).toBe("failed");
    expect(r.error).toBe("Authentication failed");
  });
});

// ─── detectConflict ───────────────────────────────────────────────────────────

describe("detectConflict", () => {
  it("no conflict when versions match", () => {
    const result = detectConflict({ name: "Flow" }, { name: "Flow" }, "v1", "v1");
    expect(result.hasConflict).toBe(false);
  });

  it("detects conflicting fields", () => {
    const local = { name: "Flow A", nodes: [] };
    const remote = { name: "Flow B", nodes: [1] };
    const result = detectConflict(local, remote, "v1", "v2");
    expect(result.hasConflict).toBe(true);
    expect(result.conflictingFields).toContain("name");
    expect(result.conflictingFields).toContain("nodes");
  });

  it("detects added fields as conflict", () => {
    const local = { name: "Flow" };
    const remote = { name: "Flow", description: "New!" };
    const result = detectConflict(local, remote, "v1", "v2");
    expect(result.hasConflict).toBe(true);
    expect(result.conflictingFields).toContain("description");
  });
});

// ─── resolveConflict ──────────────────────────────────────────────────────────

describe("resolveConflict", () => {
  it("sets strategy on conflict", () => {
    const local = { name: "A" };
    const remote = { name: "B" };
    const conflict = detectConflict(local, remote, "v1", "v2");
    const resolved = resolveConflict(conflict, "ours");
    expect(resolved.strategy).toBe("ours");
  });
});

// ─── computeSyncStatus ────────────────────────────────────────────────────────

describe("computeSyncStatus", () => {
  it("synced when checksums match", () => {
    expect(computeSyncStatus("abc", "abc", false, false)).toBe("synced");
  });

  it("untracked when no remote", () => {
    expect(computeSyncStatus("abc", null, false, false)).toBe("untracked");
  });

  it("ahead when only local changes", () => {
    expect(computeSyncStatus("abc", "def", true, false)).toBe("ahead");
  });

  it("behind when only remote changes", () => {
    expect(computeSyncStatus("abc", "def", false, true)).toBe("behind");
  });

  it("conflict when both changed", () => {
    expect(computeSyncStatus("abc", "def", true, true)).toBe("conflict");
  });
});

// ─── getPendingSyncWorkflows ──────────────────────────────────────────────────

describe("getPendingSyncWorkflows", () => {
  it("filters out synced workflows", () => {
    const states: WorkflowGitState[] = [
      { workflowId: "w1", localChecksum: "a", remoteChecksum: "a", syncStatus: "synced" },
      { workflowId: "w2", localChecksum: "b", remoteChecksum: "c", syncStatus: "ahead" },
    ];
    const pending = getPendingSyncWorkflows(states);
    expect(pending).toHaveLength(1);
    expect(pending[0].workflowId).toBe("w2");
  });
});

// ─── computeGitSyncSummary ────────────────────────────────────────────────────

describe("computeGitSyncSummary", () => {
  it("counts statuses correctly", () => {
    const states: WorkflowGitState[] = [
      { workflowId: "w1", localChecksum: "a", remoteChecksum: "a", syncStatus: "synced" },
      { workflowId: "w2", localChecksum: "b", remoteChecksum: "c", syncStatus: "ahead" },
      { workflowId: "w3", localChecksum: "d", remoteChecksum: null, syncStatus: "untracked" },
      { workflowId: "w4", localChecksum: "e", remoteChecksum: "f", syncStatus: "conflict" },
    ];
    const summary = computeGitSyncSummary(states);
    expect(summary.totalWorkflows).toBe(4);
    expect(summary.synced).toBe(1);
    expect(summary.ahead).toBe(1);
    expect(summary.untracked).toBe(1);
    expect(summary.conflict).toBe(1);
  });
});

// ─── buildGitAuthHeaders ──────────────────────────────────────────────────────

describe("buildGitAuthHeaders", () => {
  it("returns empty object when no token", () => {
    const c = createGitConfig("https://example.com/r.git", "main");
    expect(buildGitAuthHeaders(c)).toEqual({});
  });

  it("returns Authorization header when token present", () => {
    const c = createGitConfig("https://example.com/r.git", "main", { token: "my-token" });
    expect(buildGitAuthHeaders(c)).toEqual({ Authorization: "Bearer my-token" });
  });
});

// ─── buildAuthenticatedCloneUrl ───────────────────────────────────────────────

describe("buildAuthenticatedCloneUrl", () => {
  it("embeds token in HTTPS URL", () => {
    const c = createGitConfig("https://github.com/org/repo.git", "main", { token: "tok" });
    const url = buildAuthenticatedCloneUrl(c);
    expect(url).toContain("tok");
    expect(url.startsWith("https://")).toBe(true);
  });

  it("leaves SSH URL unchanged", () => {
    const c = createGitConfig("git@github.com:org/repo.git", "main", { token: "tok" });
    expect(buildAuthenticatedCloneUrl(c)).toBe("git@github.com:org/repo.git");
  });

  it("returns original URL when no token", () => {
    const c = createGitConfig("https://example.com/r.git", "main");
    expect(buildAuthenticatedCloneUrl(c)).toBe("https://example.com/r.git");
  });
});

// ─── describeSyncRecord ───────────────────────────────────────────────────────

describe("describeSyncRecord", () => {
  it("describes a successful push", () => {
    const r = createSyncRecord("wf_1", "push", { commitHash: "abc1234567" });
    const desc = describeSyncRecord(r);
    expect(desc).toContain("SUCCESS");
    expect(desc).toContain("push");
    expect(desc).toContain("wf_1");
    expect(desc).toContain("abc1234");
  });

  it("includes error in description", () => {
    const r = createSyncRecord("wf_2", "push", { status: "failed", error: "401 Unauthorized" });
    expect(describeSyncRecord(r)).toContain("401 Unauthorized");
  });
});
