/**
 * JSON utilities for handling API responses, transformations, and validation.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Safely parse JSON, returning null on failure.
 */
export function safeJsonParse(input: string): unknown | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

/**
 * Safely stringify JSON, returning null on failure (e.g., circular refs).
 */
export function safeJsonStringify(
  value: unknown,
  indent?: number,
): string | null {
  try {
    return JSON.stringify(value, null, indent);
  } catch {
    return null;
  }
}

/**
 * Deep clone a JSON-serializable value.
 */
export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(deepClone) as T;

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    result[k] = deepClone(v);
  }
  return result as T;
}

/**
 * Check if a value is a plain object.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Detect the JSON data type of a value.
 */
export function detectType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Validate that a JSON value matches a simple schema.
 * Schema can be: "string", "number", "boolean", "array", "object", "null", or "any"
 */
export function validateType(
  value: unknown,
  expectedType: string,
): boolean {
  if (expectedType === "any") return true;
  return detectType(value) === expectedType;
}

/**
 * Flatten nested JSON into dot-separated key paths.
 * e.g. { a: { b: 1 } } -> { "a.b": 1 }
 */
export function flattenJson(
  obj: Record<string, unknown>,
  prefix = "",
  result: Record<string, unknown> = {},
): Record<string, unknown> {
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (isPlainObject(value)) {
      flattenJson(value as Record<string, unknown>, newKey, result);
    } else if (Array.isArray(value)) {
      result[newKey] = value;
      value.forEach((item, idx) => {
        if (isPlainObject(item)) {
          flattenJson(item as Record<string, unknown>, `${newKey}[${idx}]`, result);
        } else {
          result[`${newKey}[${idx}]`] = item;
        }
      });
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

/**
 * Compare two JSON values for deep equality.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, (b as unknown[])[i]));
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
}

/**
 * Get all leaf paths from a JSON object.
 */
export function getLeafPaths(
  obj: Record<string, unknown>,
  prefix = "",
): string[] {
  const paths: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value) && Object.keys(value as object).length > 0) {
      paths.push(...getLeafPaths(value as Record<string, unknown>, path));
    } else {
      paths.push(path);
    }
  }

  return paths;
}

/**
 * Pick keys from a JSON object, supporting nested dot notation.
 * Returns a new object with only the selected paths.
 */
export function selectPaths(
  obj: Record<string, unknown>,
  paths: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const path of paths) {
    const parts = path.split(".");
    let current: unknown = obj;
    let target: Record<string, unknown> = result;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (current === null || typeof current !== "object") break;
      current = (current as Record<string, unknown>)[part];

      if (i === parts.length - 1) {
        target[part] = current;
      } else {
        if (!target[part]) target[part] = {};
        target = target[part] as Record<string, unknown>;
      }
    }
  }

  return result;
}
