/**
 * Phase 84 — Workflow Output Mapper
 * Pure utilities for mapping node outputs to downstream inputs:
 * field-to-field mapping, expression evaluation, conditional routing,
 * output merging, and schema normalization.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type OutputValue = string | number | boolean | null | OutputValue[] | { [k: string]: OutputValue };

export interface NodeOutput {
  nodeId: string;
  portKey: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface FieldMap {
  sourceNodeId: string;
  sourceField: string;    // dot-notation path in source output
  targetField: string;    // dot-notation path in target input
  transform?: (v: unknown) => unknown;
  defaultValue?: unknown;
  required?: boolean;
}

export interface RoutingRule {
  id: string;
  condition: (data: Record<string, unknown>) => boolean;
  targetNodeId: string;
  targetPort?: string;
}

export interface MappingConfig {
  targetNodeId: string;
  fieldMaps: FieldMap[];
  includeAll?: boolean;   // pass all unmapped fields through
  stripUndefined?: boolean;
}

export interface MappingResult {
  targetNodeId: string;
  input: Record<string, unknown>;
  applied: string[];      // field keys that were mapped
  missing: string[];      // required fields that were missing
  errors: string[];
}

export interface RouterResult {
  matched: Array<{ ruleId: string; targetNodeId: string; targetPort?: string }>;
  unmatched: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dot-notation Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  if (!path) return obj;
  const parts = path.split(".");
  const result = { ...obj };
  let cur: Record<string, unknown> = result;
  for (let i = 0; i < parts.length - 1; i++) {
    const existing = cur[parts[i]];
    const next = (existing !== null && typeof existing === "object" && !Array.isArray(existing))
      ? { ...(existing as Record<string, unknown>) }
      : {};
    cur[parts[i]] = next;
    cur = next;
  }
  cur[parts[parts.length - 1]] = value;
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// NodeOutput Management
// ─────────────────────────────────────────────────────────────────────────────

export function createOutput(
  nodeId: string,
  portKey: string,
  data: Record<string, unknown>,
  timestamp = Date.now()
): NodeOutput {
  return { nodeId, portKey, data, timestamp };
}

export function getOutputByNode(outputs: NodeOutput[], nodeId: string): NodeOutput[] {
  return outputs.filter((o) => o.nodeId === nodeId);
}

export function getOutputByPort(outputs: NodeOutput[], nodeId: string, portKey: string): NodeOutput | undefined {
  return outputs.find((o) => o.nodeId === nodeId && o.portKey === portKey);
}

export function mergeOutputData(outputs: NodeOutput[], strategy: "last_wins" | "first_wins" | "merge" = "merge"): Record<string, unknown> {
  if (outputs.length === 0) return {};

  if (strategy === "last_wins") {
    return outputs.reduce((acc, o) => ({ ...acc, ...o.data }), {} as Record<string, unknown>);
  }
  if (strategy === "first_wins") {
    const result: Record<string, unknown> = {};
    for (const output of outputs) {
      for (const [k, v] of Object.entries(output.data)) {
        if (!(k in result)) result[k] = v;
      }
    }
    return result;
  }
  // merge: deep merge
  return outputs.reduce((acc, o) => deepMergeObj(acc, o.data), {} as Record<string, unknown>);
}

function deepMergeObj(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v) &&
      typeof result[k] === "object" && result[k] !== null && !Array.isArray(result[k])) {
      result[k] = deepMergeObj(result[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field Mapping
// ─────────────────────────────────────────────────────────────────────────────

export function applyFieldMap(
  sourceData: Record<string, unknown>,
  map: FieldMap
): { value: unknown; error?: string } {
  try {
    let value = getPath(sourceData, map.sourceField);
    if (value === undefined || value === null) {
      if (map.defaultValue !== undefined) {
        value = map.defaultValue;
      } else if (map.required) {
        return { value: undefined, error: `Required field '${map.sourceField}' is missing` };
      }
    }
    if (map.transform && value !== undefined) {
      value = map.transform(value);
    }
    return { value };
  } catch (err) {
    return { value: undefined, error: `Transform error for '${map.sourceField}': ${String(err)}` };
  }
}

export function applyMappingConfig(
  outputs: Record<string, NodeOutput>,   // keyed by nodeId
  config: MappingConfig
): MappingResult {
  const applied: string[] = [];
  const missing: string[] = [];
  const errors: string[] = [];
  let input: Record<string, unknown> = {};

  // Process field maps
  for (const fieldMap of config.fieldMaps) {
    const sourceOutput = outputs[fieldMap.sourceNodeId];
    if (!sourceOutput) {
      if (fieldMap.required) {
        missing.push(`${fieldMap.sourceNodeId}.${fieldMap.sourceField}`);
        errors.push(`Source node '${fieldMap.sourceNodeId}' has no output`);
      }
      continue;
    }

    const { value, error } = applyFieldMap(sourceOutput.data, fieldMap);
    if (error) {
      if (fieldMap.required) missing.push(fieldMap.sourceField);
      errors.push(error);
      continue;
    }

    if (value !== undefined || !config.stripUndefined) {
      input = setPath(input, fieldMap.targetField, value);
      applied.push(fieldMap.targetField);
    }
  }

  // Pass all unmapped fields from all sources if includeAll is set
  if (config.includeAll) {
    for (const output of Object.values(outputs)) {
      for (const [key, value] of Object.entries(output.data)) {
        if (!(key in input)) {
          input[key] = value;
        }
      }
    }
  }

  return { targetNodeId: config.targetNodeId, input, applied, missing, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Output Routing
// ─────────────────────────────────────────────────────────────────────────────

export function applyRoutingRules(
  data: Record<string, unknown>,
  rules: RoutingRule[]
): RouterResult {
  const matched: RouterResult["matched"] = [];

  for (const rule of rules) {
    try {
      if (rule.condition(data)) {
        matched.push({ ruleId: rule.id, targetNodeId: rule.targetNodeId, targetPort: rule.targetPort });
      }
    } catch {
      // Condition evaluation error — treat as unmatched
    }
  }

  return { matched, unmatched: matched.length === 0 };
}

export function firstMatchRouter(
  data: Record<string, unknown>,
  rules: RoutingRule[]
): RouterResult {
  for (const rule of rules) {
    try {
      if (rule.condition(data)) {
        return {
          matched: [{ ruleId: rule.id, targetNodeId: rule.targetNodeId, targetPort: rule.targetPort }],
          unmatched: false,
        };
      }
    } catch {
      // skip
    }
  }
  return { matched: [], unmatched: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Output Normalization & Transformation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize output: strip null/undefined top-level keys.
 */
export function stripNullFields(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== null && v !== undefined) result[k] = v;
  }
  return result;
}

/**
 * Rename output fields using a mapping of oldKey → newKey.
 */
export function renameOutputFields(
  data: Record<string, unknown>,
  renames: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    result[renames[k] ?? k] = v;
  }
  return result;
}

/**
 * Prefix all top-level keys with a namespace.
 */
export function namespaceOutput(
  data: Record<string, unknown>,
  prefix: string
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    result[`${prefix}.${k}`] = v;
  }
  return result;
}

/**
 * Flatten a nested output to dot-notation keys.
 */
export function flattenOutput(
  data: Record<string, unknown>,
  prefix = ""
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  function recurse(cur: unknown, path: string): void {
    if (cur !== null && typeof cur === "object" && !Array.isArray(cur)) {
      const entries = Object.entries(cur as Record<string, unknown>);
      if (entries.length === 0 && path) { result[path] = cur; return; }
      for (const [k, v] of entries) recurse(v, path ? `${path}.${k}` : k);
    } else {
      if (path) result[path] = cur;
    }
  }
  recurse(data, prefix);
  return result;
}

/**
 * Select only specified fields from output.
 */
export function projectOutput(
  data: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const value = getPath(data, field);
    if (value !== undefined) result[field] = value;
  }
  return result;
}

/**
 * Wrap output in a keyed object (e.g. for namespacing results).
 */
export function wrapOutput(data: Record<string, unknown>, key: string): Record<string, unknown> {
  return { [key]: data };
}

/**
 * Unwrap a keyed output.
 */
export function unwrapOutput(data: Record<string, unknown>, key: string): Record<string, unknown> {
  const inner = data[key];
  if (inner !== null && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Array Output Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Split a list output into individual records for fan-out.
 */
export function fanOut(
  output: NodeOutput,
  arrayField: string
): NodeOutput[] {
  const items = getPath(output.data, arrayField);
  if (!Array.isArray(items)) return [output];

  return items.map((item, i) => ({
    ...output,
    data: { ...output.data, [arrayField]: item, _index: i, _total: items.length },
  }));
}

/**
 * Collect multiple outputs into a single list output (fan-in).
 */
export function fanIn(
  outputs: NodeOutput[],
  targetField = "items"
): NodeOutput {
  const items = outputs.map((o) => o.data);
  const base = outputs[0] ?? { nodeId: "merged", portKey: "out", timestamp: Date.now() };
  return {
    nodeId: base.nodeId,
    portKey: base.portKey,
    data: { [targetField]: items, _count: items.length },
    timestamp: base.timestamp,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Output Comparison
// ─────────────────────────────────────────────────────────────────────────────

export interface OutputDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

export function diffOutputs(prev: Record<string, unknown>, next: Record<string, unknown>): OutputDiff {
  const prevKeys = new Set(Object.keys(prev));
  const nextKeys = new Set(Object.keys(next));

  const added = [...nextKeys].filter((k) => !prevKeys.has(k));
  const removed = [...prevKeys].filter((k) => !nextKeys.has(k));
  const changed = [...nextKeys].filter((k) => prevKeys.has(k) && JSON.stringify(prev[k]) !== JSON.stringify(next[k]));

  return { added, removed, changed };
}

export function hasOutputChanged(prev: Record<string, unknown>, next: Record<string, unknown>): boolean {
  const diff = diffOutputs(prev, next);
  return diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;
}
