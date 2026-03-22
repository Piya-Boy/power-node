/**
 * Phase 82 — Workflow Node Registry
 * Pure utilities for managing a catalog of workflow node type definitions:
 * registration, validation, search, versioning, and metadata.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type NodeCategory =
  | "trigger"
  | "action"
  | "logic"
  | "transform"
  | "integration"
  | "ai"
  | "utility"
  | "output";

export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "select"
  | "multiselect"
  | "json"
  | "expression"
  | "credential"
  | "file"
  | "color"
  | "date";

export interface FieldOption {
  label: string;
  value: string | number | boolean;
}

export interface NodeField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  default?: unknown;
  description?: string;
  placeholder?: string;
  options?: FieldOption[];
  min?: number;
  max?: number;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  };
}

export interface NodePort {
  key: string;
  label: string;
  description?: string;
  multiple?: boolean;   // can accept/produce multiple connections
}

export interface NodeDefinition {
  type: string;           // unique identifier e.g. "http_request"
  version: string;        // semver string
  label: string;
  description: string;
  category: NodeCategory;
  tags: string[];
  icon?: string;
  color?: string;
  inputs: NodePort[];
  outputs: NodePort[];
  fields: NodeField[];
  deprecated?: boolean;
  deprecationMessage?: string;
  replacedBy?: string;
  experimental?: boolean;
  author?: string;
  docsUrl?: string;
}

export interface NodeRegistry {
  definitions: NodeDefinition[];
}

export interface RegistrationResult {
  success: boolean;
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createRegistry(definitions: NodeDefinition[] = []): NodeRegistry {
  return { definitions: [...definitions] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export function validateDefinition(def: NodeDefinition): string[] {
  const errors: string[] = [];

  if (!def.type || !/^[a-z][a-z0-9_]*$/.test(def.type)) {
    errors.push(`type must be snake_case, got: '${def.type}'`);
  }
  if (!def.version || !/^\d+\.\d+\.\d+/.test(def.version)) {
    errors.push(`version must be semver, got: '${def.version}'`);
  }
  if (!def.label || def.label.trim().length === 0) {
    errors.push("label is required");
  }
  if (!def.description || def.description.trim().length === 0) {
    errors.push("description is required");
  }

  // Validate field keys are unique
  const fieldKeys = def.fields.map((f) => f.key);
  const dupFields = fieldKeys.filter((k, i) => fieldKeys.indexOf(k) !== i);
  if (dupFields.length > 0) {
    errors.push(`Duplicate field keys: ${dupFields.join(", ")}`);
  }

  // Validate select fields have options
  for (const field of def.fields) {
    if ((field.type === "select" || field.type === "multiselect") && (!field.options || field.options.length === 0)) {
      errors.push(`Field '${field.key}' of type '${field.type}' must have options`);
    }
  }

  return errors;
}

export function isValidDefinition(def: NodeDefinition): boolean {
  return validateDefinition(def).length === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerNode(
  registry: NodeRegistry,
  def: NodeDefinition
): { registry: NodeRegistry; result: RegistrationResult } {
  const errors = validateDefinition(def);
  if (errors.length > 0) {
    return { registry, result: { success: false, errors } };
  }

  // Replace existing definition with same type (update/overwrite)
  const filtered = registry.definitions.filter((d) => d.type !== def.type);
  const definitions = [...filtered, def];

  return {
    registry: { definitions },
    result: { success: true, errors: [] },
  };
}

export function unregisterNode(registry: NodeRegistry, type: string): NodeRegistry {
  return { definitions: registry.definitions.filter((d) => d.type !== type) };
}

export function registerMany(
  registry: NodeRegistry,
  defs: NodeDefinition[]
): { registry: NodeRegistry; results: RegistrationResult[] } {
  let current = registry;
  const results: RegistrationResult[] = [];

  for (const def of defs) {
    const { registry: next, result } = registerNode(current, def);
    current = next;
    results.push(result);
  }

  return { registry: current, results };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lookup
// ─────────────────────────────────────────────────────────────────────────────

export function getNode(registry: NodeRegistry, type: string): NodeDefinition | undefined {
  return registry.definitions.find((d) => d.type === type);
}

export function hasNode(registry: NodeRegistry, type: string): boolean {
  return registry.definitions.some((d) => d.type === type);
}

export function getNodesByCategory(
  registry: NodeRegistry,
  category: NodeCategory
): NodeDefinition[] {
  return registry.definitions.filter((d) => d.category === category);
}

export function getNodesByTag(registry: NodeRegistry, tag: string): NodeDefinition[] {
  return registry.definitions.filter((d) => d.tags.includes(tag));
}

export function getActiveNodes(registry: NodeRegistry): NodeDefinition[] {
  return registry.definitions.filter((d) => !d.deprecated);
}

export function getDeprecatedNodes(registry: NodeRegistry): NodeDefinition[] {
  return registry.definitions.filter((d) => d.deprecated === true);
}

export function getExperimentalNodes(registry: NodeRegistry): NodeDefinition[] {
  return registry.definitions.filter((d) => d.experimental === true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchOptions {
  query?: string;
  category?: NodeCategory;
  tags?: string[];
  includeDeprecated?: boolean;
  includeExperimental?: boolean;
}

export function searchNodes(
  registry: NodeRegistry,
  options: SearchOptions = {}
): NodeDefinition[] {
  let results = registry.definitions;

  if (!options.includeDeprecated) {
    results = results.filter((d) => !d.deprecated);
  }
  if (!options.includeExperimental) {
    results = results.filter((d) => !d.experimental);
  }
  if (options.category) {
    results = results.filter((d) => d.category === options.category);
  }
  if (options.tags && options.tags.length > 0) {
    results = results.filter((d) => options.tags!.some((t) => d.tags.includes(t)));
  }
  if (options.query) {
    const q = options.query.toLowerCase();
    results = results.filter(
      (d) =>
        d.type.toLowerCase().includes(q) ||
        d.label.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Versioning
// ─────────────────────────────────────────────────────────────────────────────

function parseSemver(v: string): [number, number, number] {
  const parts = v.split(".").map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export function compareVersions(a: string, b: string): number {
  const [aMaj, aMin, aPatch] = parseSemver(a);
  const [bMaj, bMin, bPatch] = parseSemver(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPatch - bPatch;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

export function deprecateNode(
  registry: NodeRegistry,
  type: string,
  message?: string,
  replacedBy?: string
): NodeRegistry {
  return {
    definitions: registry.definitions.map((d) =>
      d.type === type
        ? { ...d, deprecated: true, deprecationMessage: message, replacedBy }
        : d
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Node Configuration Validation
// ─────────────────────────────────────────────────────────────────────────────

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateNodeConfig(
  def: NodeDefinition,
  config: Record<string, unknown>
): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const field of def.fields) {
    const value = config[field.key];

    if (field.required && (value === undefined || value === null || value === "")) {
      errors.push(`Required field '${field.key}' is missing`);
      continue;
    }

    if (value === undefined || value === null) continue;

    // Type checks
    if (field.type === "number") {
      const n = Number(value);
      if (isNaN(n)) errors.push(`Field '${field.key}' must be a number`);
      else {
        if (field.min !== undefined && n < field.min) errors.push(`Field '${field.key}' must be >= ${field.min}`);
        if (field.max !== undefined && n > field.max) errors.push(`Field '${field.key}' must be <= ${field.max}`);
      }
    }

    if (field.type === "string" && typeof value === "string") {
      if (field.validation?.minLength !== undefined && value.length < field.validation.minLength) {
        errors.push(`Field '${field.key}' must be at least ${field.validation.minLength} chars`);
      }
      if (field.validation?.maxLength !== undefined && value.length > field.validation.maxLength) {
        errors.push(`Field '${field.key}' must be at most ${field.validation.maxLength} chars`);
      }
      if (field.validation?.pattern && !new RegExp(field.validation.pattern).test(value)) {
        errors.push(`Field '${field.key}' does not match required pattern`);
      }
    }

    if (field.type === "select" && field.options) {
      const valid = field.options.map((o) => o.value);
      if (!valid.includes(value as string | number | boolean)) {
        errors.push(`Field '${field.key}' has invalid value '${value}'`);
      }
    }
  }

  // Warn about extra fields not in definition
  const knownKeys = new Set(def.fields.map((f) => f.key));
  for (const key of Object.keys(config)) {
    if (!knownKeys.has(key)) warnings.push(`Unknown field '${key}' will be ignored`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats & Summary
// ─────────────────────────────────────────────────────────────────────────────

export interface RegistryStats {
  total: number;
  byCategory: Record<NodeCategory, number>;
  active: number;
  deprecated: number;
  experimental: number;
  totalFields: number;
  avgFieldsPerNode: number;
}

export function computeRegistryStats(registry: NodeRegistry): RegistryStats {
  const byCategory: Record<NodeCategory, number> = {
    trigger: 0, action: 0, logic: 0, transform: 0, integration: 0, ai: 0, utility: 0, output: 0,
  };

  let totalFields = 0;
  for (const d of registry.definitions) {
    byCategory[d.category]++;
    totalFields += d.fields.length;
  }

  return {
    total: registry.definitions.length,
    byCategory,
    active: getActiveNodes(registry).length,
    deprecated: getDeprecatedNodes(registry).length,
    experimental: getExperimentalNodes(registry).length,
    totalFields,
    avgFieldsPerNode: registry.definitions.length === 0 ? 0 : totalFields / registry.definitions.length,
  };
}

export function listNodeTypes(registry: NodeRegistry): string[] {
  return registry.definitions.map((d) => d.type).sort();
}

export function groupByCategory(
  registry: NodeRegistry
): Record<NodeCategory, NodeDefinition[]> {
  const result: Record<NodeCategory, NodeDefinition[]> = {
    trigger: [], action: [], logic: [], transform: [],
    integration: [], ai: [], utility: [], output: [],
  };
  for (const d of registry.definitions) {
    result[d.category].push(d);
  }
  return result;
}
