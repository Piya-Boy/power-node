/**
 * Phase 30 — Custom Node SDK
 * Utilities for defining, validating, and registering custom node types.
 */

export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "json"
  | "code"
  | "password"
  | "select"
  | "multiselect"
  | "color";

export interface NodeField {
  name: string;
  label: string;
  type: FieldType;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: Array<{ label: string; value: string | number }>;
  placeholder?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  };
}

export interface CustomNodeDefinition {
  /** Unique identifier (snake_case) */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Category for grouping */
  category: string;
  /** Node color (hex or tailwind) */
  color: string;
  /** Icon name (lucide-react) */
  icon: string;
  /** Input ports */
  inputs: string[];
  /** Output ports */
  outputs: string[];
  /** Configuration fields */
  fields: NodeField[];
  /** Node version */
  version: string;
  /** Author info */
  author?: {
    name: string;
    email?: string;
  };
  /** Keywords for search */
  keywords?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const RESERVED_IDS = new Set([
  "initial", "manual_trigger", "webhook_trigger", "schedule_trigger",
  "http_request", "code", "if", "switch", "filter", "loop", "merge",
  "split", "wait", "stop_error", "sub_workflow", "transform",
]);

/**
 * Validate a custom node definition.
 */
export function validateNodeDefinition(def: CustomNodeDefinition): ValidationResult {
  const errors: string[] = [];

  // ID validation
  if (!def.id) {
    errors.push("Node ID is required");
  } else if (!/^[a-z][a-z0-9_]*$/.test(def.id)) {
    errors.push("Node ID must be snake_case (lowercase letters, numbers, underscores, starting with a letter)");
  } else if (RESERVED_IDS.has(def.id)) {
    errors.push(`Node ID "${def.id}" is reserved by the platform`);
  }

  // Name
  if (!def.name?.trim()) errors.push("Node name is required");
  if (def.name?.length > 50) errors.push("Node name must be 50 characters or less");

  // Description
  if (!def.description?.trim()) errors.push("Node description is required");
  if (def.description?.length > 200) errors.push("Node description must be 200 characters or less");

  // Category
  if (!def.category?.trim()) errors.push("Node category is required");

  // Color
  if (!def.color?.trim()) errors.push("Node color is required");

  // Inputs/Outputs
  if (!def.inputs || def.inputs.length === 0) errors.push("Node must have at least one input port");
  if (!def.outputs || def.outputs.length === 0) errors.push("Node must have at least one output port");

  // Fields
  const fieldNames = new Set<string>();
  for (const field of def.fields ?? []) {
    if (!field.name) {
      errors.push("Field name is required");
      continue;
    }
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field.name)) {
      errors.push(`Field name "${field.name}" must be alphanumeric (starting with a letter)`);
    }
    if (fieldNames.has(field.name)) {
      errors.push(`Duplicate field name: "${field.name}"`);
    }
    fieldNames.add(field.name);

    if (!field.label?.trim()) errors.push(`Field "${field.name}" must have a label`);
    if (!field.type) errors.push(`Field "${field.name}" must have a type`);

    if ((field.type === "select" || field.type === "multiselect") && (!field.options || field.options.length === 0)) {
      errors.push(`Field "${field.name}" of type ${field.type} must have options`);
    }
  }

  // Version
  if (!def.version?.trim()) {
    errors.push("Node version is required");
  } else if (!/^\d+\.\d+\.\d+$/.test(def.version)) {
    errors.push("Node version must be semver format (e.g. 1.0.0)");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get the default value for a field type.
 */
export function getFieldDefault(field: NodeField): unknown {
  if (field.default !== undefined) return field.default;
  switch (field.type) {
    case "string": return "";
    case "number": return 0;
    case "boolean": return false;
    case "json": return {};
    case "code": return "";
    case "password": return "";
    case "select": return field.options?.[0]?.value ?? "";
    case "multiselect": return [];
    case "color": return "#000000";
  }
}

/**
 * Get default node data from all fields.
 */
export function getNodeDefaultData(def: CustomNodeDefinition): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of def.fields) {
    data[field.name] = getFieldDefault(field);
  }
  return data;
}

/**
 * Validate node instance data against the field definitions.
 */
export function validateNodeData(
  def: CustomNodeDefinition,
  data: Record<string, unknown>
): ValidationResult {
  const errors: string[] = [];

  for (const field of def.fields) {
    const value = data[field.name];

    if (field.required && (value === undefined || value === null || value === "")) {
      errors.push(`Field "${field.label}" is required`);
      continue;
    }

    if (value === undefined || value === null || value === "") continue;

    // Type validation
    if (field.type === "number") {
      const num = Number(value);
      if (isNaN(num)) {
        errors.push(`Field "${field.label}" must be a number`);
      } else {
        if (field.validation?.min !== undefined && num < field.validation.min) {
          errors.push(`Field "${field.label}" must be >= ${field.validation.min}`);
        }
        if (field.validation?.max !== undefined && num > field.validation.max) {
          errors.push(`Field "${field.label}" must be <= ${field.validation.max}`);
        }
      }
    }

    if (field.type === "string" || field.type === "password") {
      const str = String(value);
      if (field.validation?.minLength !== undefined && str.length < field.validation.minLength) {
        errors.push(`Field "${field.label}" must be at least ${field.validation.minLength} characters`);
      }
      if (field.validation?.maxLength !== undefined && str.length > field.validation.maxLength) {
        errors.push(`Field "${field.label}" must be at most ${field.validation.maxLength} characters`);
      }
      if (field.validation?.pattern !== undefined) {
        const regex = new RegExp(field.validation.pattern);
        if (!regex.test(str)) {
          errors.push(`Field "${field.label}" has an invalid format`);
        }
      }
    }

    if (field.type === "select" && field.options) {
      const validValues = field.options.map((o) => o.value);
      if (!validValues.includes(value as string | number)) {
        errors.push(`Field "${field.label}" has an invalid value`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Search custom node definitions by keyword.
 */
export function searchCustomNodes(
  nodes: CustomNodeDefinition[],
  query: string
): CustomNodeDefinition[] {
  const q = query.toLowerCase();
  return nodes.filter(
    (n) =>
      n.name.toLowerCase().includes(q) ||
      n.description.toLowerCase().includes(q) ||
      n.category.toLowerCase().includes(q) ||
      (n.keywords ?? []).some((k) => k.toLowerCase().includes(q))
  );
}

/**
 * Group custom nodes by category.
 */
export function groupNodesByCategory(
  nodes: CustomNodeDefinition[]
): Record<string, CustomNodeDefinition[]> {
  const groups: Record<string, CustomNodeDefinition[]> = {};
  for (const node of nodes) {
    if (!groups[node.category]) groups[node.category] = [];
    groups[node.category].push(node);
  }
  return groups;
}
