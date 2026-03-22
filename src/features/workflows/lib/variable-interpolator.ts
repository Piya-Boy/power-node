/**
 * Phase 81 — Workflow Variable Interpolator
 * Pure utilities for evaluating variable expressions, resolving
 * references across scopes, and transforming dynamic values
 * in workflow node configurations.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type VarScope = "global" | "workflow" | "node" | "env" | "secret";

export interface VarEntry {
  key: string;
  value: unknown;
  scope: VarScope;
  encrypted?: boolean;
  description?: string;
}

export interface VarStore {
  entries: VarEntry[];
}

export interface InterpolateOptions {
  strict?: boolean;          // throw on missing variables
  fallback?: string;         // default for missing
  maxDepth?: number;         // max recursive resolution depth
  allowedScopes?: VarScope[]; // restrict which scopes can be referenced
}

export interface InterpolationResult {
  output: string;
  resolved: string[];        // variables that were successfully resolved
  missing: string[];         // variables that could not be resolved
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// VarStore Operations
// ─────────────────────────────────────────────────────────────────────────────

export function createStore(entries: VarEntry[] = []): VarStore {
  return { entries: [...entries] };
}

export function setVar(
  store: VarStore,
  key: string,
  value: unknown,
  scope: VarScope = "workflow"
): VarStore {
  const filtered = store.entries.filter((e) => !(e.key === key && e.scope === scope));
  return { entries: [...filtered, { key, value, scope }] };
}

export function getVar(
  store: VarStore,
  key: string,
  scope?: VarScope
): VarEntry | undefined {
  if (scope) {
    return store.entries.find((e) => e.key === key && e.scope === scope);
  }
  // Priority order: node > workflow > global > env > secret
  const priority: VarScope[] = ["node", "workflow", "global", "env", "secret"];
  for (const s of priority) {
    const found = store.entries.find((e) => e.key === key && e.scope === s);
    if (found) return found;
  }
  return undefined;
}

export function deleteVar(store: VarStore, key: string, scope?: VarScope): VarStore {
  const entries = scope
    ? store.entries.filter((e) => !(e.key === key && e.scope === scope))
    : store.entries.filter((e) => e.key !== key);
  return { entries };
}

export function getVarsByScope(store: VarStore, scope: VarScope): VarEntry[] {
  return store.entries.filter((e) => e.scope === scope);
}

export function mergeStores(...stores: VarStore[]): VarStore {
  const entries: VarEntry[] = [];
  for (const store of stores) {
    for (const entry of store.entries) {
      // Later stores override earlier ones for same key+scope
      const idx = entries.findIndex((e) => e.key === entry.key && e.scope === entry.scope);
      if (idx >= 0) entries[idx] = entry;
      else entries.push(entry);
    }
  }
  return { entries };
}

export function listVarKeys(store: VarStore, scope?: VarScope): string[] {
  const filtered = scope ? store.entries.filter((e) => e.scope === scope) : store.entries;
  return [...new Set(filtered.map((e) => e.key))];
}

// ─────────────────────────────────────────────────────────────────────────────
// Expression Parser
// ─────────────────────────────────────────────────────────────────────────────

export type ExprToken =
  | { type: "literal"; value: string }
  | { type: "var"; path: string; scope?: VarScope; filters: string[] }
  | { type: "expr"; body: string };

/**
 * Parse a template string into tokens.
 * Supports:
 *   - {{varName}} — simple variable
 *   - {{scope:varName}} — scoped variable
 *   - {{varName | filter}} — variable with filters
 *   - ${{expression}} — raw expression (not evaluated by default, returns placeholder)
 */
export function parseTemplate(template: string): ExprToken[] {
  const tokens: ExprToken[] = [];
  const regex = /\$?\{\{([^}]+)\}\}/g;
  let last = 0;

  for (const match of template.matchAll(regex)) {
    const fullMatch = match[0];
    const inner = match[1].trim();
    const start = match.index ?? 0;

    // Add literal segment before this match
    if (start > last) {
      tokens.push({ type: "literal", value: template.slice(last, start) });
    }

    if (fullMatch.startsWith("$")) {
      tokens.push({ type: "expr", body: inner });
    } else {
      // Parse scope:key|filter1|filter2
      const pipeparts = inner.split("|").map((s) => s.trim());
      const rawPath = pipeparts[0];
      const filters = pipeparts.slice(1);

      // Check for scope prefix
      const colonIdx = rawPath.indexOf(":");
      if (colonIdx !== -1) {
        const scopeStr = rawPath.slice(0, colonIdx) as VarScope;
        const path = rawPath.slice(colonIdx + 1);
        tokens.push({ type: "var", path, scope: scopeStr, filters });
      } else {
        tokens.push({ type: "var", path: rawPath, filters });
      }
    }

    last = start + fullMatch.length;
  }

  if (last < template.length) {
    tokens.push({ type: "literal", value: template.slice(last) });
  }

  return tokens;
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in Filters
// ─────────────────────────────────────────────────────────────────────────────

export type FilterFn = (value: unknown) => unknown;

export const BUILT_IN_FILTERS: Record<string, FilterFn> = {
  upper: (v) => typeof v === "string" ? v.toUpperCase() : v,
  lower: (v) => typeof v === "string" ? v.toLowerCase() : v,
  trim: (v) => typeof v === "string" ? v.trim() : v,
  json: (v) => JSON.stringify(v),
  base64: (v) => Buffer.from(String(v)).toString("base64"),
  urlencode: (v) => encodeURIComponent(String(v)),
  length: (v) => Array.isArray(v) ? v.length : typeof v === "string" ? v.length : 0,
  first: (v) => Array.isArray(v) ? v[0] : v,
  last: (v) => Array.isArray(v) ? v[v.length - 1] : v,
  reverse: (v) => Array.isArray(v) ? [...v].reverse() : typeof v === "string" ? v.split("").reverse().join("") : v,
  keys: (v) => v !== null && typeof v === "object" && !Array.isArray(v) ? Object.keys(v as object) : [],
  values: (v) => v !== null && typeof v === "object" && !Array.isArray(v) ? Object.values(v as object) : [],
  not: (v) => !v,
  string: (v) => v === null || v === undefined ? "" : String(v),
  number: (v) => { const n = Number(v); return isNaN(n) ? 0 : n; },
  boolean: (v) => Boolean(v),
  default_empty: (v) => (v === null || v === undefined || v === "") ? "(empty)" : v,
};

export function applyFilters(value: unknown, filters: string[], custom: Record<string, FilterFn> = {}): unknown {
  const allFilters = { ...BUILT_IN_FILTERS, ...custom };
  let result = value;
  for (const filter of filters) {
    const fn = allFilters[filter];
    if (fn) result = fn(result);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Nested Path Resolver (dot-notation in var values)
// ─────────────────────────────────────────────────────────────────────────────

function getNestedValue(value: unknown, path: string): unknown {
  if (!path.includes(".")) return value;
  const parts = path.split(".");
  // First part is the var key — already resolved; remaining parts are field access
  let cur = value;
  for (let i = 1; i < parts.length; i++) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[parts[i]];
  }
  return cur;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Interpolation
// ─────────────────────────────────────────────────────────────────────────────

export function interpolateTemplate(
  template: string,
  store: VarStore,
  options: InterpolateOptions = {},
  customFilters: Record<string, FilterFn> = {}
): InterpolationResult {
  const {
    strict = false,
    fallback = "",
    allowedScopes,
  } = options;

  const resolved: string[] = [];
  const missing: string[] = [];
  const errors: string[] = [];

  const tokens = parseTemplate(template);
  const parts: string[] = [];

  for (const token of tokens) {
    if (token.type === "literal") {
      parts.push(token.value);
      continue;
    }

    if (token.type === "expr") {
      // Raw expressions are returned as-is (not evaluated)
      parts.push(`\${{${token.body}}}`);
      continue;
    }

    // Variable token
    const varToken = token;
    const rootKey = varToken.path.split(".")[0];

    // Check scope restriction
    if (allowedScopes && varToken.scope && !allowedScopes.includes(varToken.scope)) {
      errors.push(`Scope '${varToken.scope}' is not allowed`);
      parts.push(fallback);
      continue;
    }

    try {
      const entry = getVar(store, rootKey, varToken.scope);
      if (entry === undefined) {
        missing.push(varToken.path);
        if (strict) throw new Error(`Missing variable: ${varToken.path}`);
        parts.push(fallback);
        continue;
      }

      // Resolve nested path if needed
      let value: unknown = getNestedValue(entry.value, varToken.path);

      // Apply filters
      if (varToken.filters.length > 0) {
        value = applyFilters(value, varToken.filters, customFilters);
      }

      resolved.push(varToken.path);
      parts.push(value === null || value === undefined ? fallback : String(value));
    } catch (err) {
      if (strict) throw err;
      errors.push(String(err));
      parts.push(fallback);
    }
  }

  return { output: parts.join(""), resolved, missing, errors };
}

/**
 * Interpolate a single value — if string, runs through template engine;
 * otherwise returns the value as-is.
 */
export function interpolateValue(
  value: unknown,
  store: VarStore,
  options: InterpolateOptions = {}
): unknown {
  if (typeof value === "string") {
    return interpolateTemplate(value, store, options).output;
  }
  return value;
}

/**
 * Recursively interpolate all string values in a plain object or array.
 */
export function interpolateDeep(
  obj: unknown,
  store: VarStore,
  options: InterpolateOptions = {}
): unknown {
  if (typeof obj === "string") {
    return interpolateTemplate(obj, store, options).output;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => interpolateDeep(item, store, options));
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = interpolateDeep(val, store, options);
    }
    return result;
  }
  return obj;
}

// ─────────────────────────────────────────────────────────────────────────────
// Variable Dependency Analysis
// ─────────────────────────────────────────────────────────────────────────────

export function extractVarRefs(template: string): Array<{ path: string; scope?: VarScope }> {
  const tokens = parseTemplate(template);
  return tokens
    .filter((t): t is Extract<ExprToken, { type: "var" }> => t.type === "var")
    .map((t) => ({ path: t.path, scope: t.scope }));
}

export function getMissingVars(
  template: string,
  store: VarStore
): string[] {
  const refs = extractVarRefs(template);
  return refs
    .filter((ref) => getVar(store, ref.path.split(".")[0], ref.scope) === undefined)
    .map((ref) => ref.path);
}

export function hasAllVars(template: string, store: VarStore): boolean {
  return getMissingVars(template, store).length === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Masking (for secrets)
// ─────────────────────────────────────────────────────────────────────────────

export function maskSecrets(text: string, store: VarStore): string {
  const secrets = store.entries.filter((e) => e.scope === "secret" || e.encrypted);
  let result = text;
  for (const entry of secrets) {
    if (typeof entry.value === "string" && entry.value.length > 0) {
      result = result.replaceAll(entry.value, "****");
    }
  }
  return result;
}
