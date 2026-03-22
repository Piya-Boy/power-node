/**
 * Phase 79 — Workflow Data Transformer
 * Pure utilities for mapping, reshaping, and transforming data
 * between workflow nodes: field mapping, type coercion, flattening,
 * grouping, pivoting, and template interpolation.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ScalarValue = string | number | boolean | null | undefined;
export type JsonValue = ScalarValue | JsonValue[] | { [key: string]: JsonValue };

export type CoercionTarget = "string" | "number" | "boolean" | "null" | "array" | "object";

export interface FieldMapping {
  source: string;       // dot-notation source path
  target: string;       // dot-notation target path
  transform?: TransformFn;
  defaultValue?: JsonValue;
}

export type TransformFn = (value: unknown) => unknown;

export interface MappingResult {
  output: Record<string, unknown>;
  errors: string[];
  mappedCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field Access (dot-notation)
// ─────────────────────────────────────────────────────────────────────────────

export function getPath(obj: unknown, path: string): unknown {
  if (path === "") return obj;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    // Handle array index notation like "items[0]" → "items.0"
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function setPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): Record<string, unknown> {
  if (path === "") return obj;
  const parts = path.split(".");
  const result = { ...obj };
  let cur: Record<string, unknown> = result;

  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const existing = cur[key];
    const next: Record<string, unknown> =
      existing !== null && typeof existing === "object" && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    cur[key] = next;
    cur = next;
  }
  cur[parts[parts.length - 1]] = value;
  return result;
}

export function deletePath(
  obj: Record<string, unknown>,
  path: string
): Record<string, unknown> {
  if (path === "") return obj;
  const parts = path.split(".");
  const result = { ...obj };
  let cur: Record<string, unknown> = result;

  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const existing = cur[key];
    if (existing === null || typeof existing !== "object") return result;
    const next = { ...(existing as Record<string, unknown>) };
    cur[key] = next;
    cur = next;
  }
  delete cur[parts[parts.length - 1]];
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field Mapping
// ─────────────────────────────────────────────────────────────────────────────

export function applyMapping(
  input: Record<string, unknown>,
  mappings: FieldMapping[]
): MappingResult {
  const errors: string[] = [];
  let output: Record<string, unknown> = {};
  let mappedCount = 0;

  for (const { source, target, transform, defaultValue } of mappings) {
    try {
      let value = getPath(input, source);
      if (value === undefined) {
        value = defaultValue;
      }
      if (transform !== undefined) {
        value = transform(value);
      }
      output = setPath(output, target, value);
      mappedCount++;
    } catch (err) {
      errors.push(`Mapping ${source} → ${target}: ${String(err)}`);
    }
  }

  return { output, errors, mappedCount };
}

export function renameFields(
  obj: Record<string, unknown>,
  renames: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = renames[key] ?? key;
    result[newKey] = value;
  }
  return result;
}

export function pickFields(
  obj: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const value = getPath(obj, field);
    if (value !== undefined) {
      result[field] = value;
    }
  }
  return result;
}

export function omitFields(
  obj: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  const fieldSet = new Set(fields);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!fieldSet.has(key)) result[key] = value;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Coercion
// ─────────────────────────────────────────────────────────────────────────────

export function coerce(value: unknown, target: CoercionTarget): unknown {
  switch (target) {
    case "string":
      if (value === null || value === undefined) return "";
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);

    case "number": {
      if (value === null || value === undefined) return 0;
      const n = Number(value);
      return isNaN(n) ? 0 : n;
    }

    case "boolean":
      if (value === "false" || value === "0" || value === "" || value === null || value === undefined) return false;
      return Boolean(value);

    case "null":
      return null;

    case "array":
      if (Array.isArray(value)) return value;
      if (value === null || value === undefined) return [];
      return [value];

    case "object":
      if (value !== null && typeof value === "object" && !Array.isArray(value)) return value;
      if (typeof value === "string") {
        try { return JSON.parse(value); } catch { return {}; }
      }
      return {};
  }
}

export function coerceRecord(
  obj: Record<string, unknown>,
  schema: Record<string, CoercionTarget>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...obj };
  for (const [field, target] of Object.entries(schema)) {
    if (field in result) {
      result[field] = coerce(result[field], target);
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Object Flattening / Unflattening
// ─────────────────────────────────────────────────────────────────────────────

export function flattenObject(
  obj: Record<string, unknown>,
  prefix = "",
  separator = "."
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  function recurse(cur: unknown, path: string): void {
    if (cur !== null && typeof cur === "object" && !Array.isArray(cur)) {
      const entries = Object.entries(cur as Record<string, unknown>);
      if (entries.length === 0) {
        if (path) result[path] = cur;
        return;
      }
      for (const [key, val] of entries) {
        recurse(val, path ? `${path}${separator}${key}` : key);
      }
    } else {
      if (path) result[path] = cur;
    }
  }

  recurse(obj, prefix);
  return result;
}

export function unflattenObject(
  flat: Record<string, unknown>,
  separator = "."
): Record<string, unknown> {
  let result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    result = setPath(result, key.split(separator).join("."), value);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Array Transformations
// ─────────────────────────────────────────────────────────────────────────────

export function groupBy<T extends Record<string, unknown>>(
  items: T[],
  keyField: string
): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = String(getPath(item, keyField) ?? "__undefined__");
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

export function indexBy<T extends Record<string, unknown>>(
  items: T[],
  keyField: string
): Record<string, T> {
  const result: Record<string, T> = {};
  for (const item of items) {
    const key = String(getPath(item, keyField) ?? "__undefined__");
    result[key] = item;
  }
  return result;
}

export function pluck<T extends Record<string, unknown>>(
  items: T[],
  field: string
): unknown[] {
  return items.map((item) => getPath(item, field));
}

export function uniqueBy<T extends Record<string, unknown>>(
  items: T[],
  keyField: string
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = String(getPath(item, keyField));
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

export function zip<A, B>(a: A[], b: B[]): Array<[A, B]> {
  const len = Math.min(a.length, b.length);
  return Array.from({ length: len }, (_, i) => [a[i], b[i]]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pivot / Unpivot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pivot: convert array of records into a column-oriented map.
 * e.g. [{name:"Alice",score:90},{name:"Bob",score:80}]
 *   → { name:["Alice","Bob"], score:[90,80] }
 */
export function pivot(records: Record<string, unknown>[]): Record<string, unknown[]> {
  if (records.length === 0) return {};
  const keys = Object.keys(records[0]);
  const result: Record<string, unknown[]> = {};
  for (const key of keys) {
    result[key] = records.map((r) => r[key]);
  }
  return result;
}

/**
 * Unpivot: convert column-oriented map back to array of records.
 */
export function unpivot(columns: Record<string, unknown[]>): Record<string, unknown>[] {
  const keys = Object.keys(columns);
  if (keys.length === 0) return [];
  const length = columns[keys[0]].length;
  return Array.from({ length }, (_, i) => {
    const record: Record<string, unknown> = {};
    for (const key of keys) {
      record[key] = columns[key][i];
    }
    return record;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Template Interpolation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interpolate `{{path}}` expressions in a string using data values.
 */
export function interpolate(
  template: string,
  data: Record<string, unknown>,
  options: { fallback?: string; strict?: boolean } = {}
): string {
  const { fallback = "", strict = false } = options;
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
    const trimmed = path.trim();
    const value = getPath(data, trimmed);
    if (value === undefined || value === null) {
      if (strict) throw new Error(`Missing template variable: ${trimmed}`);
      return fallback;
    }
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  });
}

export function interpolateRecord(
  obj: Record<string, unknown>,
  data: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = interpolate(value, data);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function extractTemplateVars(template: string): string[] {
  const vars: string[] = [];
  for (const match of template.matchAll(/\{\{([^}]+)\}\}/g)) {
    vars.push(match[1].trim());
  }
  return [...new Set(vars)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Deep Merge
// ─────────────────────────────────────────────────────────────────────────────

export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transform Pipeline
// ─────────────────────────────────────────────────────────────────────────────

export type PipelineStep = (input: Record<string, unknown>) => Record<string, unknown>;

export function createPipeline(...steps: PipelineStep[]): PipelineStep {
  return (input) => steps.reduce((acc, step) => step(acc), input);
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON Path Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List all leaf paths in an object using dot notation.
 */
export function listPaths(obj: unknown, prefix = ""): string[] {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return prefix ? [prefix] : [];
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return prefix ? [prefix] : [];
    return obj.flatMap((item, i) => listPaths(item, prefix ? `${prefix}.${i}` : String(i)));
  }
  const entries = Object.entries(obj as Record<string, unknown>);
  if (entries.length === 0) return prefix ? [prefix] : [];
  return entries.flatMap(([key, val]) => listPaths(val, prefix ? `${prefix}.${key}` : key));
}

/**
 * Check if all required paths exist in an object.
 */
export function hasAllPaths(obj: Record<string, unknown>, paths: string[]): boolean {
  return paths.every((p) => getPath(obj, p) !== undefined);
}

/**
 * Deep clone a JSON-compatible value.
 */
export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}
