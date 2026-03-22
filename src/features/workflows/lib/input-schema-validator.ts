/**
 * Phase 72 — Workflow Input Schema Validator
 * Pure utilities for defining, validating, and coercing
 * workflow trigger inputs and node parameter values against schemas.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array"
  | "null"
  | "any";

export interface StringSchema {
  type: "string";
  minLength?: number;
  maxLength?: number;
  pattern?: string;         // regex pattern
  enum?: string[];
  format?: "email" | "url" | "uuid" | "date" | "datetime" | "ip";
}

export interface NumberSchema {
  type: "number" | "integer";
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  enum?: number[];
}

export interface BooleanSchema {
  type: "boolean";
}

export interface NullSchema {
  type: "null";
}

export interface AnySchema {
  type: "any";
}

export interface ArraySchema {
  type: "array";
  items?: FieldSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
}

export interface ObjectSchema {
  type: "object";
  properties?: Record<string, FieldSchema>;
  required?: string[];
  additionalProperties?: boolean | FieldSchema;
  minProperties?: number;
  maxProperties?: number;
}

export type FieldSchema = (
  | StringSchema
  | NumberSchema
  | BooleanSchema
  | NullSchema
  | AnySchema
  | ArraySchema
  | ObjectSchema
) & {
  description?: string;
  default?: unknown;
  nullable?: boolean;       // allow null in addition to primary type
  title?: string;
};

export interface ValidationError {
  path: string;       // dot-path to offending field e.g. "user.email"
  message: string;
  expected?: string;
  received?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  coerced?: unknown;  // coerced value if coercion was requested
}

// ─────────────────────────────────────────────────────────────────────────────
// Format Validators
// ─────────────────────────────────────────────────────────────────────────────

const FORMAT_PATTERNS: Record<string, RegExp> = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  url: /^https?:\/\/.+/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  date: /^\d{4}-\d{2}-\d{2}$/,
  datetime: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
  ip: /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]+$/i,
};

export function validateFormat(value: string, format: string): boolean {
  const pattern = FORMAT_PATTERNS[format];
  return pattern ? pattern.test(value) : true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Validator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a value against a schema.
 */
export function validate(
  value: unknown,
  schema: FieldSchema,
  options: { coerce?: boolean; path?: string } = {}
): ValidationResult {
  const { coerce = false, path = "" } = options;
  const errors: ValidationError[] = [];

  const result = validateValue(value, schema, path, errors, coerce);

  return {
    valid: errors.length === 0,
    errors,
    coerced: coerce ? result : undefined,
  };
}

function addError(
  errors: ValidationError[],
  path: string,
  message: string,
  expected?: string,
  received?: string
): void {
  errors.push({ path: path || "(root)", message, expected, received });
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function validateValue(
  value: unknown,
  schema: FieldSchema,
  path: string,
  errors: ValidationError[],
  coerce: boolean
): unknown {
  // Null check
  if (value === null || value === undefined) {
    if (schema.nullable || schema.type === "null" || schema.type === "any") {
      return value ?? null;
    }
    if ("default" in schema && schema.default !== undefined) {
      return schema.default;
    }
    addError(errors, path, `Value is required`, schema.type, "null");
    return value;
  }

  if (schema.type === "any") return value;

  // Type coercion
  let coercedValue = value;
  if (coerce) {
    if (schema.type === "string" && typeof value !== "string") {
      coercedValue = String(value);
    } else if ((schema.type === "number" || schema.type === "integer") && typeof value === "string") {
      const n = Number(value);
      if (!Number.isNaN(n)) coercedValue = n;
    } else if (schema.type === "boolean" && typeof value === "string") {
      if (value === "true") coercedValue = true;
      else if (value === "false") coercedValue = false;
    }
    value = coercedValue;
  }

  const actualType = typeOf(value);

  switch (schema.type) {
    case "string":
      return validateString(value, schema as StringSchema, path, errors);
    case "number":
    case "integer":
      return validateNumber(value, schema as NumberSchema, path, errors, actualType);
    case "boolean":
      if (typeof value !== "boolean") {
        addError(errors, path, `Expected boolean`, "boolean", actualType);
      }
      return value;
    case "null":
      if (value !== null) {
        addError(errors, path, `Expected null`, "null", actualType);
      }
      return value;
    case "array":
      return validateArray(value, schema as ArraySchema, path, errors, coerce);
    case "object":
      return validateObject(value, schema as ObjectSchema, path, errors, coerce);
    default:
      return value;
  }
}

function validateString(
  value: unknown,
  schema: StringSchema,
  path: string,
  errors: ValidationError[]
): unknown {
  if (typeof value !== "string") {
    addError(errors, path, `Expected string`, "string", typeOf(value));
    return value;
  }

  if (schema.minLength !== undefined && value.length < schema.minLength) {
    addError(errors, path, `String too short (min ${schema.minLength})`, `>=${schema.minLength} chars`, `${value.length} chars`);
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    addError(errors, path, `String too long (max ${schema.maxLength})`, `<=${schema.maxLength} chars`, `${value.length} chars`);
  }
  if (schema.pattern) {
    const re = new RegExp(schema.pattern);
    if (!re.test(value)) {
      addError(errors, path, `String does not match pattern ${schema.pattern}`, schema.pattern, value);
    }
  }
  if (schema.enum && !schema.enum.includes(value)) {
    addError(errors, path, `Value not in enum`, schema.enum.join("|"), value);
  }
  if (schema.format && !validateFormat(value, schema.format)) {
    addError(errors, path, `Invalid format '${schema.format}'`, schema.format, value);
  }
  return value;
}

function validateNumber(
  value: unknown,
  schema: NumberSchema,
  path: string,
  errors: ValidationError[],
  actualType: string
): unknown {
  if (typeof value !== "number" || Number.isNaN(value)) {
    addError(errors, path, `Expected number`, "number", actualType);
    return value;
  }
  if (schema.type === "integer" && !Number.isInteger(value)) {
    addError(errors, path, `Expected integer`, "integer", `${value}`);
  }
  if (schema.minimum !== undefined && value < schema.minimum) {
    addError(errors, path, `Value below minimum ${schema.minimum}`, `>=${schema.minimum}`, `${value}`);
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    addError(errors, path, `Value above maximum ${schema.maximum}`, `<=${schema.maximum}`, `${value}`);
  }
  if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
    addError(errors, path, `Value must be >${schema.exclusiveMinimum}`, `>${schema.exclusiveMinimum}`, `${value}`);
  }
  if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
    addError(errors, path, `Value must be <${schema.exclusiveMaximum}`, `<${schema.exclusiveMaximum}`, `${value}`);
  }
  if (schema.multipleOf !== undefined && value % schema.multipleOf !== 0) {
    addError(errors, path, `Value must be multiple of ${schema.multipleOf}`, `multiple of ${schema.multipleOf}`, `${value}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    addError(errors, path, `Value not in enum`, schema.enum.join("|"), `${value}`);
  }
  return value;
}

function validateArray(
  value: unknown,
  schema: ArraySchema,
  path: string,
  errors: ValidationError[],
  coerce: boolean
): unknown {
  if (!Array.isArray(value)) {
    addError(errors, path, `Expected array`, "array", typeOf(value));
    return value;
  }
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    addError(errors, path, `Array too short (min ${schema.minItems} items)`, `>=${schema.minItems}`, `${value.length}`);
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    addError(errors, path, `Array too long (max ${schema.maxItems} items)`, `<=${schema.maxItems}`, `${value.length}`);
  }
  if (schema.uniqueItems) {
    const seen = new Set();
    for (const item of value) {
      const key = JSON.stringify(item);
      if (seen.has(key)) {
        addError(errors, path, `Array items must be unique`);
        break;
      }
      seen.add(key);
    }
  }
  if (schema.items) {
    const coercedItems = value.map((item, i) =>
      validateValue(item, schema.items!, `${path}[${i}]`, errors, coerce)
    );
    return coercedItems;
  }
  return value;
}

function validateObject(
  value: unknown,
  schema: ObjectSchema,
  path: string,
  errors: ValidationError[],
  coerce: boolean
): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    addError(errors, path, `Expected object`, "object", typeOf(value));
    return value;
  }

  const obj = value as Record<string, unknown>;

  // Required fields
  for (const key of schema.required ?? []) {
    if (!(key in obj) || obj[key] === undefined || obj[key] === null) {
      addError(errors, `${path ? path + "." : ""}${key}`, `Required field missing`);
    }
  }

  // Property count
  const propCount = Object.keys(obj).length;
  if (schema.minProperties !== undefined && propCount < schema.minProperties) {
    addError(errors, path, `Object has too few properties (min ${schema.minProperties})`);
  }
  if (schema.maxProperties !== undefined && propCount > schema.maxProperties) {
    addError(errors, path, `Object has too many properties (max ${schema.maxProperties})`);
  }

  const coercedObj: Record<string, unknown> = {};

  // Validate known properties
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const propPath = path ? `${path}.${key}` : key;
      if (key in obj) {
        coercedObj[key] = validateValue(obj[key], propSchema, propPath, errors, coerce);
      } else if ("default" in propSchema && propSchema.default !== undefined) {
        coercedObj[key] = propSchema.default;
      }
    }
  }

  // Additional properties
  if (schema.additionalProperties === false && schema.properties) {
    const knownKeys = new Set(Object.keys(schema.properties));
    for (const key of Object.keys(obj)) {
      if (!knownKeys.has(key)) {
        addError(errors, path ? `${path}.${key}` : key, `Additional property not allowed`);
      }
    }
  }

  // Copy non-schema properties
  for (const key of Object.keys(obj)) {
    if (!(key in coercedObj)) coercedObj[key] = obj[key];
  }

  return coercedObj;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema Composition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a record against a map of field schemas (top-level object validation).
 */
export function validateRecord(
  record: Record<string, unknown>,
  schemas: Record<string, FieldSchema>,
  required: string[] = [],
  options: { coerce?: boolean; allowAdditional?: boolean } = {}
): ValidationResult {
  const schema: ObjectSchema = {
    type: "object",
    properties: schemas,
    required,
    additionalProperties: options.allowAdditional !== false,
  };
  return validate(record, schema, { coerce: options.coerce });
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema Introspection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract all field paths from an object schema (dot-notation).
 */
export function extractFieldPaths(schema: FieldSchema, prefix = ""): string[] {
  if (schema.type !== "object" || !("properties" in schema) || !schema.properties) {
    return prefix ? [prefix] : [];
  }
  const paths: string[] = [];
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    paths.push(fullPath);
    if (propSchema.type === "object") {
      paths.push(...extractFieldPaths(propSchema, fullPath));
    }
  }
  return paths;
}

/**
 * Get all required field paths for an object schema.
 */
export function getRequiredPaths(schema: ObjectSchema, prefix = ""): string[] {
  const required = schema.required ?? [];
  const paths: string[] = required.map((k) => prefix ? `${prefix}.${k}` : k);
  for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
    if (propSchema.type === "object") {
      const nested = getRequiredPaths(propSchema as ObjectSchema, prefix ? `${prefix}.${key}` : key);
      paths.push(...nested);
    }
  }
  return paths;
}
