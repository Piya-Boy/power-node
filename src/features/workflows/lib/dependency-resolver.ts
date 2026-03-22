/**
 * Phase 64 — Workflow Dependency Resolver
 * Pure utilities for resolving workflow dependencies: sub-workflow calls,
 * shared credentials, node package requirements, and import graphs.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DependencyType =
  | "sub-workflow"
  | "credential"
  | "node-package"
  | "env-variable"
  | "webhook"
  | "schedule";

export type DependencyStatus =
  | "resolved"
  | "missing"
  | "circular"
  | "version-mismatch"
  | "deprecated";

export interface Dependency {
  id: string;
  type: DependencyType;
  name: string;
  version?: string;       // semver or tag
  required: boolean;
  resolvedId?: string;    // id of the resolved artifact
  status?: DependencyStatus;
}

export interface WorkflowManifest {
  id: string;
  name: string;
  version: string;
  dependencies: Dependency[];
}

export interface ResolvedDependency extends Dependency {
  status: DependencyStatus;
  resolvedVersion?: string;
  resolvedAt?: Date;
  errorMessage?: string;
}

export interface ResolutionResult {
  workflowId: string;
  resolved: ResolvedDependency[];
  missing: ResolvedDependency[];
  circular: string[][];
  allResolved: boolean;
  errors: string[];
}

export interface DependencyGraph {
  nodes: Map<string, WorkflowManifest>;
  edges: Map<string, string[]>;  // workflowId → list of dependency workflowIds
}

// ─────────────────────────────────────────────────────────────────────────────
// Version Matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if an available version satisfies a version requirement.
 * Supports exact, ^major, ~minor, >=version, and * (any).
 */
export function satisfiesVersion(required: string, available: string): boolean {
  if (required === "*" || required === "latest") return true;
  if (required === available) return true;

  const reqParts = parseVersion(required.replace(/^[\^~>=]+/, ""));
  const avParts = parseVersion(available);
  if (!reqParts || !avParts) return false;

  if (required.startsWith(">=")) {
    return compareVersions(avParts, reqParts) >= 0;
  }
  if (required.startsWith("^")) {
    // Compatible: same major, available >= required
    return avParts.major === reqParts.major && compareVersions(avParts, reqParts) >= 0;
  }
  if (required.startsWith("~")) {
    // Patch-compatible: same major+minor, available >= required
    return avParts.major === reqParts.major &&
      avParts.minor === reqParts.minor &&
      compareVersions(avParts, reqParts) >= 0;
  }

  return false;
}

/**
 * Find the best matching version from a list of available versions.
 */
export function findBestVersion(required: string, available: string[]): string | null {
  const matching = available.filter((v) => satisfiesVersion(required, v));
  if (matching.length === 0) return null;
  // Return highest matching version
  return matching.sort((a, b) => {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    if (!pa || !pb) return 0;
    return compareVersions(pb, pa); // descending
  })[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency Resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve dependencies for a workflow manifest against available artifacts.
 */
export function resolveDependencies(
  manifest: WorkflowManifest,
  available: Map<string, string[]>  // name → available versions
): ResolutionResult {
  const resolved: ResolvedDependency[] = [];
  const missing: ResolvedDependency[] = [];
  const errors: string[] = [];

  for (const dep of manifest.dependencies) {
    const versions = available.get(dep.name);
    if (!versions || versions.length === 0) {
      const r: ResolvedDependency = { ...dep, status: "missing", errorMessage: `"${dep.name}" not found` };
      if (dep.required) {
        errors.push(`Required dependency "${dep.name}" is missing`);
        missing.push(r);
      } else {
        resolved.push({ ...dep, status: "missing" });
      }
      continue;
    }

    const requiredVersion = dep.version ?? "*";
    const best = findBestVersion(requiredVersion, versions);
    if (!best) {
      const r: ResolvedDependency = {
        ...dep,
        status: "version-mismatch",
        errorMessage: `No version of "${dep.name}" satisfies "${requiredVersion}" (available: ${versions.join(", ")})`,
      };
      if (dep.required) {
        errors.push(r.errorMessage!);
        missing.push(r);
      } else {
        resolved.push(r);
      }
      continue;
    }

    resolved.push({
      ...dep,
      status: "resolved",
      resolvedVersion: best,
      resolvedId: `${dep.name}@${best}`,
      resolvedAt: new Date(),
    });
  }

  return {
    workflowId: manifest.id,
    resolved,
    missing,
    circular: [],
    allResolved: missing.length === 0 && errors.length === 0,
    errors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency Graph
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a dependency graph from a list of workflow manifests.
 */
export function buildDependencyGraph(manifests: WorkflowManifest[]): DependencyGraph {
  const nodes = new Map<string, WorkflowManifest>();
  const edges = new Map<string, string[]>();

  for (const m of manifests) {
    nodes.set(m.id, m);
    const subWorkflowDeps = m.dependencies
      .filter((d) => d.type === "sub-workflow" && d.resolvedId)
      .map((d) => d.resolvedId!);
    edges.set(m.id, subWorkflowDeps);
  }

  return { nodes, edges };
}

/**
 * Detect circular dependencies in the dependency graph.
 */
export function detectCircularDependencies(graph: DependencyGraph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): void {
    visited.add(node);
    inStack.add(node);
    path.push(node);

    for (const neighbor of graph.edges.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (inStack.has(neighbor)) {
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), neighbor]);
        }
      }
    }

    path.pop();
    inStack.delete(node);
  }

  for (const id of graph.nodes.keys()) {
    if (!visited.has(id)) dfs(id);
  }

  return cycles;
}

/**
 * Get a topological execution order for workflows in the graph.
 * Returns null if there are cycles.
 */
export function getExecutionOrder(graph: DependencyGraph): string[] | null {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of graph.nodes.keys()) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }

  for (const [from, tos] of graph.edges) {
    for (const to of tos) {
      adj.get(from)?.push(to);
      inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
    }
  }

  const queue: string[] = [...graph.nodes.keys()].filter((id) => (inDegree.get(id) ?? 0) === 0);
  const order: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (const neighbor of adj.get(node) ?? []) {
      const deg = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, deg);
      if (deg === 0) queue.push(neighbor);
    }
  }

  return order.length === graph.nodes.size ? order : null;
}

/**
 * Get all transitive dependencies of a workflow.
 */
export function getTransitiveDependencies(
  workflowId: string,
  graph: DependencyGraph
): Set<string> {
  const visited = new Set<string>();
  const queue = [workflowId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    if (current !== workflowId) visited.add(current);

    for (const dep of graph.edges.get(current) ?? []) {
      if (!visited.has(dep)) queue.push(dep);
    }
  }

  return visited;
}

/**
 * Get all workflows that depend on a given workflow (reverse dependencies).
 */
export function getReverseDependencies(
  workflowId: string,
  graph: DependencyGraph
): string[] {
  const dependents: string[] = [];
  for (const [id, deps] of graph.edges) {
    if (deps.includes(workflowId)) dependents.push(id);
  }
  return dependents;
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a workflow manifest.
 */
export function createManifest(params: {
  id: string;
  name: string;
  version: string;
  dependencies?: Dependency[];
}): WorkflowManifest {
  return {
    id: params.id,
    name: params.name,
    version: params.version,
    dependencies: params.dependencies ?? [],
  };
}

/**
 * Add a dependency to a manifest (returns new manifest).
 */
export function addDependency(manifest: WorkflowManifest, dep: Dependency): WorkflowManifest {
  const existing = manifest.dependencies.find((d) => d.id === dep.id);
  if (existing) return manifest;
  return { ...manifest, dependencies: [...manifest.dependencies, dep] };
}

/**
 * Remove a dependency from a manifest by id.
 */
export function removeDependency(manifest: WorkflowManifest, depId: string): WorkflowManifest {
  return { ...manifest, dependencies: manifest.dependencies.filter((d) => d.id !== depId) };
}

/**
 * Validate a manifest: version format, dep ids unique, no empty names.
 */
export function validateManifest(manifest: WorkflowManifest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!manifest.id) errors.push("id is required");
  if (!manifest.name || manifest.name.trim() === "") errors.push("name is required");
  if (!manifest.version) errors.push("version is required");
  else if (!parseVersion(manifest.version)) errors.push(`invalid version format: "${manifest.version}"`);

  const ids = manifest.dependencies.map((d) => d.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) errors.push("dependency ids must be unique");

  for (const dep of manifest.dependencies) {
    if (!dep.name || dep.name.trim() === "") errors.push(`dependency "${dep.id}" has empty name`);
    if (dep.version && !parseVersion(dep.version.replace(/^[\^~>=]+/, "")) && dep.version !== "*" && dep.version !== "latest") {
      errors.push(`dependency "${dep.name}" has invalid version: "${dep.version}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Summarize all dependencies by type.
 */
export function summarizeDependencies(manifest: WorkflowManifest): Record<DependencyType, number> {
  const counts: Record<DependencyType, number> = {
    "sub-workflow": 0,
    credential: 0,
    "node-package": 0,
    "env-variable": 0,
    webhook: 0,
    schedule: 0,
  };
  for (const dep of manifest.dependencies) {
    counts[dep.type] = (counts[dep.type] ?? 0) + 1;
  }
  return counts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface SemVer { major: number; minor: number; patch: number }

function parseVersion(v: string): SemVer | null {
  const match = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return { major: parseInt(match[1], 10), minor: parseInt(match[2], 10), patch: parseInt(match[3], 10) };
}

function compareVersions(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}
