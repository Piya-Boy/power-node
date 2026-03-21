/**
 * Input validation utilities — generic, no external dependencies.
 */

export interface ValidationRule<T> {
  validate: (value: T) => boolean;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a value against an array of rules.
 */
export function validate<T>(
  value: T,
  rules: ValidationRule<T>[],
): ValidationResult {
  const errors: string[] = [];

  for (const rule of rules) {
    if (!rule.validate(value)) {
      errors.push(rule.message);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Returns false if the value is null, undefined, or an empty string.
 */
export function required(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return true;
}

/**
 * Creates a rule that validates the minimum length of a string.
 */
export function minLength(min: number): ValidationRule<string> {
  return {
    validate: (value: string) => value.length >= min,
    message: `Must be at least ${min} character${min === 1 ? "" : "s"} long`,
  };
}

/**
 * Creates a rule that validates the maximum length of a string.
 */
export function maxLength(max: number): ValidationRule<string> {
  return {
    validate: (value: string) => value.length <= max,
    message: `Must be at most ${max} character${max === 1 ? "" : "s"} long`,
  };
}

/**
 * Creates a rule that validates a string against a regular expression.
 */
export function pattern(
  regex: RegExp,
  message: string,
): ValidationRule<string> {
  return {
    validate: (value: string) => regex.test(value),
    message,
  };
}

/**
 * Creates a rule that validates the minimum numeric value.
 */
export function minValue(min: number): ValidationRule<number> {
  return {
    validate: (value: number) => value >= min,
    message: `Must be at least ${min}`,
  };
}

/**
 * Creates a rule that validates the maximum numeric value.
 */
export function maxValue(max: number): ValidationRule<number> {
  return {
    validate: (value: number) => value <= max,
    message: `Must be at most ${max}`,
  };
}

/**
 * Validates an email address.
 */
export function isEmail(value: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

/**
 * Validates a URL (must start with http:// or https://).
 */
export function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validates a cuid2-style ID:
 * - Starts with a letter
 * - Contains only alphanumeric characters
 * - Length between 20 and 30 characters
 */
export function isCuid(value: string): boolean {
  return /^[a-z][a-z0-9]{19,29}$/i.test(value) && value.length >= 20 && value.length <= 30;
}

/**
 * Validate multiple object fields against a schema of rules.
 */
export function validateObject<T extends Record<string, unknown>>(
  obj: T,
  schema: Record<keyof T, ValidationRule<unknown>[]>,
): Record<keyof T, ValidationResult> {
  const results = {} as Record<keyof T, ValidationResult>;

  for (const key in schema) {
    results[key] = validate(obj[key], schema[key]);
  }

  return results;
}

/**
 * Combine multiple ValidationResults into a single result.
 */
export function combineResults(results: ValidationResult[]): ValidationResult {
  const errors: string[] = [];

  for (const result of results) {
    errors.push(...result.errors);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Sanitize a string with optional trim, maxLength truncation, and lowercase.
 */
export function sanitizeString(
  value: string,
  options?: {
    maxLength?: number;
    trim?: boolean;
    lowercase?: boolean;
  },
): string {
  let result = value;

  if (options?.trim !== false) {
    result = result.trim();
  }

  if (options?.lowercase) {
    result = result.toLowerCase();
  }

  if (options?.maxLength !== undefined && result.length > options.maxLength) {
    result = result.slice(0, options.maxLength);
  }

  return result;
}
