/**
 * Phase 95 — Source Control / Git Workflow Utilities
 * Utilities for push/pull workflows via Git-based source control.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type GitOperation = "push" | "pull" | "clone" | "diff" | "status";
export type SyncStatus = "synced" | "ahead" | "behind" | "conflict" | "untracked";
export type ConflictStrategy = "ours" | "theirs" | "manual";

export interface GitConfig {
  repoUrl: string;
  branch: string;
  token?: string;
  authorName?: string;
  authorEmail?: string;
  basePath?: string;
}

export interface GitValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SyncRecord {
  id: string;
  workflowId: string;
  operation: GitOperation;
  commitHash?: string;
  commitMessage?: string;
  syncedAt: Date;
  status: "success" | "failed" | "conflict";
  error?: string;
}

export interface WorkflowRef {
  workflowId: string;
  name: string;
  path: string;
  lastModified?: Date;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflictingFields: string[];
  localVersion: string;
  remoteVersion: string;
  strategy?: ConflictStrategy;
}

export interface WorkflowGitState {
  workflowId: string;
  localChecksum: string;
  remoteChecksum: string | null;
  syncStatus: SyncStatus;
  lastSyncAt?: Date;
}

export interface GitSyncSummary {
  totalWorkflows: number;
  synced: number;
  ahead: number;
  behind: number;
  conflict: number;
  untracked: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Create a Git configuration with sensible defaults.
 */
export function createGitConfig(
  repoUrl: string,
  branch: string,
  opts: { token?: string; authorName?: string; authorEmail?: string; basePath?: string } = {}
): GitConfig {
  return {
    repoUrl,
    branch,
    token: opts.token,
    authorName: opts.authorName ?? "PowerNode",
    authorEmail: opts.authorEmail ?? "powernode@noreply.local",
    basePath: opts.basePath ?? "workflows",
  };
}

/**
 * Validate a Git configuration.
 */
export function validateGitConfig(config: GitConfig): GitValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.repoUrl || config.repoUrl.trim().length === 0) {
    errors.push("repoUrl is required");
  } else if (!/^https?:\/\/.+|^git@.+/.test(config.repoUrl)) {
    errors.push("repoUrl must be a valid HTTPS or SSH git URL");
  }

  if (!config.branch || config.branch.trim().length === 0) {
    errors.push("branch is required");
  } else if (!/^[a-zA-Z0-9/_.-]+$/.test(config.branch)) {
    errors.push("branch name contains invalid characters");
  }

  if (!config.token) {
    warnings.push("No token provided — private repositories may not be accessible");
  }

  if (config.authorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.authorEmail)) {
    errors.push("authorEmail is not a valid email address");
  }

  if (config.basePath && config.basePath.startsWith("/")) {
    errors.push("basePath must be a relative path (no leading slash)");
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Path Utilities ───────────────────────────────────────────────────────────

/**
 * Build the file path for a workflow inside the repository.
 */
export function buildGitPath(
  workflowId: string,
  workflowName: string,
  basePath = "workflows"
): string {
  const slug = workflowName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${basePath}/${slug}-${workflowId.replace(/[^a-zA-Z0-9]/g, "_")}.json`;
}

/**
 * Extract workflow references from a flat list of repository file paths.
 */
export function extractWorkflowsFromTree(
  paths: string[],
  basePath = "workflows"
): WorkflowRef[] {
  const prefix = basePath.replace(/\/$/, "") + "/";
  return paths
    .filter((p) => p.startsWith(prefix) && p.endsWith(".json"))
    .map((path) => {
      const filename = path.slice(prefix.length).replace(/\.json$/, "");
      // filename format: <slug>-<workflowId>
      const lastDash = filename.lastIndexOf("-");
      const workflowId = lastDash >= 0 ? filename.slice(lastDash + 1) : filename;
      const name = lastDash >= 0 ? filename.slice(0, lastDash) : filename;
      return { workflowId, name, path };
    });
}

// ─── Serialization ────────────────────────────────────────────────────────────

/**
 * Serialize a workflow object to a canonical JSON string for storage.
 * Sorts keys for deterministic output.
 */
export function serializeWorkflow(workflow: Record<string, unknown>): string {
  return JSON.stringify(workflow, Object.keys(workflow).sort(), 2);
}

/**
 * Parse a workflow from a JSON string obtained from Git.
 * Returns null on parse failure instead of throwing.
 */
export function parseWorkflowFromGit(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Commit Helpers ───────────────────────────────────────────────────────────

/**
 * Build a descriptive commit message for a workflow operation.
 */
export function buildCommitMessage(
  operation: "create" | "update" | "delete" | "rename",
  workflowName: string,
  meta?: { version?: number; tag?: string }
): string {
  const prefix: Record<string, string> = {
    create: "feat(workflow):",
    update: "chore(workflow):",
    delete: "chore(workflow): delete",
    rename: "chore(workflow): rename",
  };
  const tag = meta?.tag ? ` [${meta.tag}]` : "";
  const version = meta?.version ? ` v${meta.version}` : "";
  return `${prefix[operation]} ${workflowName}${version}${tag}`.trim();
}

// ─── Sync Records ────────────────────────────────────────────────────────────

let _syncIdSeq = 1;
export function resetSyncIdSeq() { _syncIdSeq = 1; }

/**
 * Create a sync record for an operation.
 */
export function createSyncRecord(
  workflowId: string,
  operation: GitOperation,
  opts: { commitHash?: string; commitMessage?: string; status?: SyncRecord["status"]; error?: string } = {}
): SyncRecord {
  return {
    id: `sync_${_syncIdSeq++}`,
    workflowId,
    operation,
    commitHash: opts.commitHash,
    commitMessage: opts.commitMessage,
    syncedAt: new Date(),
    status: opts.status ?? "success",
    error: opts.error,
  };
}

// ─── Conflict Detection ───────────────────────────────────────────────────────

/**
 * Detect a conflict between a local and remote workflow version.
 * Returns conflicting field names based on shallow comparison.
 */
export function detectConflict(
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
  localVersion: string,
  remoteVersion: string
): ConflictResult {
  if (localVersion === remoteVersion) {
    return {
      hasConflict: false,
      conflictingFields: [],
      localVersion,
      remoteVersion,
    };
  }

  const conflictingFields: string[] = [];
  const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);

  for (const key of allKeys) {
    const localVal = JSON.stringify(local[key]);
    const remoteVal = JSON.stringify(remote[key]);
    if (localVal !== remoteVal) {
      conflictingFields.push(key);
    }
  }

  return {
    hasConflict: conflictingFields.length > 0,
    conflictingFields,
    localVersion,
    remoteVersion,
  };
}

/**
 * Resolve a conflict by choosing a strategy.
 */
export function resolveConflict(
  conflict: ConflictResult,
  strategy: ConflictStrategy
): ConflictResult {
  return { ...conflict, strategy };
}

// ─── Sync Status ──────────────────────────────────────────────────────────────

/**
 * Compute the sync status for a workflow given local and remote checksums.
 */
export function computeSyncStatus(
  localChecksum: string,
  remoteChecksum: string | null,
  hasLocalChanges: boolean,
  hasRemoteChanges: boolean
): SyncStatus {
  if (remoteChecksum === null) return "untracked";
  if (localChecksum === remoteChecksum) return "synced";
  if (hasLocalChanges && hasRemoteChanges) return "conflict";
  if (hasLocalChanges) return "ahead";
  return "behind";
}

/**
 * Get workflows needing sync (anything other than "synced").
 */
export function getPendingSyncWorkflows(states: WorkflowGitState[]): WorkflowGitState[] {
  return states.filter((s) => s.syncStatus !== "synced");
}

/**
 * Compute summary statistics across all workflow git states.
 */
export function computeGitSyncSummary(states: WorkflowGitState[]): GitSyncSummary {
  const summary: GitSyncSummary = {
    totalWorkflows: states.length,
    synced: 0,
    ahead: 0,
    behind: 0,
    conflict: 0,
    untracked: 0,
  };
  for (const s of states) {
    summary[s.syncStatus]++;
  }
  return summary;
}

// ─── Authorization Header ─────────────────────────────────────────────────────

/**
 * Build HTTP headers for authenticated Git operations.
 */
export function buildGitAuthHeaders(config: GitConfig): Record<string, string> {
  if (!config.token) return {};
  return {
    Authorization: `Bearer ${config.token}`,
  };
}

/**
 * Build a clone URL with embedded token for HTTPS repos.
 * Only supports HTTPS URLs. Returns original URL for SSH.
 */
export function buildAuthenticatedCloneUrl(config: GitConfig): string {
  if (!config.token || !config.repoUrl.startsWith("https://")) {
    return config.repoUrl;
  }
  try {
    const url = new URL(config.repoUrl);
    url.username = "token";
    url.password = config.token;
    return url.toString();
  } catch {
    return config.repoUrl;
  }
}

/**
 * Human-readable summary of a sync record.
 */
export function describeSyncRecord(record: SyncRecord): string {
  const hash = record.commitHash ? ` (${record.commitHash.slice(0, 7)})` : "";
  const err = record.error ? ` — ${record.error}` : "";
  return `[${record.status.toUpperCase()}] ${record.operation} workflow ${record.workflowId}${hash}${err}`;
}
