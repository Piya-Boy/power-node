/**
 * Phase 76 — Workflow Condition Evaluator
 * Pure utilities for evaluating boolean conditions, compound expressions,
 * and routing rules used by IF/Filter/Switch workflow nodes.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ComparisonOperator =
  | "==" | "!=" | ">" | ">=" | "<" | "<="
  | "contains" | "not_contains" | "starts_with" | "ends_with"
  | "matches" | "not_matches"
  | "in" | "not_in"
  | "is_null" | "is_not_null"
  | "is_empty" | "is_not_empty"
  | "is_true" | "is_false"
  | "between";          // value is [min, max]

export type LogicalOperator = "and" | "or" | "not";

export type ConditionValue = string | number | boolean | null | unknown[] | [number, number];

export interface SimpleCondition {
  type: "simple";
  field: string;          // dot-notation path in the data object
  operator: ComparisonOperator;
  value?: ConditionValue; // not needed for is_null, is_empty, etc.
  caseSensitive?: boolean;
}

export interface CompoundCondition {
  type: "compound";
  operator: LogicalOperator;
  conditions: Condition[];
}

export type Condition = SimpleCondition | CompoundCondition;

export interface EvaluationResult {
  result: boolean;
  matchedBranch?: string;   // for switch-style evaluation
  errors: string[];
}

export interface SwitchCase {
  id: string;
  label?: string;
  condition: Condition;
}

export interface SwitchEvaluation {
  matchedCaseId: string | undefined;
  allResults: Array<{ caseId: string; result: boolean }>;
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Value Extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract a nested field from a data object using dot notation.
 */
export function extractField(data: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = data;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparison Evaluation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate a single comparison condition against a data object.
 */
export function evaluateSimple(
  condition: SimpleCondition,
  data: Record<string, unknown>
): { result: boolean; error?: string } {
  const actual = extractField(data, condition.field);
  const expected = condition.value;
  const cs = condition.caseSensitive !== false; // default: case-sensitive

  try {
    switch (condition.operator) {
      case "==": return { result: deepLooseEqual(actual, expected) };
      case "!=": return { result: !deepLooseEqual(actual, expected) };
      case ">": return { result: typeof actual === "number" && typeof expected === "number" && actual > expected };
      case ">=": return { result: typeof actual === "number" && typeof expected === "number" && actual >= expected };
      case "<": return { result: typeof actual === "number" && typeof expected === "number" && actual < expected };
      case "<=": return { result: typeof actual === "number" && typeof expected === "number" && actual <= expected };

      case "contains": {
        if (typeof actual === "string" && typeof expected === "string") {
          return { result: cs ? actual.includes(expected) : actual.toLowerCase().includes(expected.toLowerCase()) };
        }
        if (Array.isArray(actual)) return { result: actual.some((v) => deepLooseEqual(v, expected)) };
        return { result: false };
      }
      case "not_contains": {
        if (typeof actual === "string" && typeof expected === "string") {
          return { result: cs ? !actual.includes(expected) : !actual.toLowerCase().includes(expected.toLowerCase()) };
        }
        if (Array.isArray(actual)) return { result: !actual.some((v) => deepLooseEqual(v, expected)) };
        return { result: true };
      }
      case "starts_with":
        if (typeof actual === "string" && typeof expected === "string") {
          return { result: cs ? actual.startsWith(expected) : actual.toLowerCase().startsWith(expected.toLowerCase()) };
        }
        return { result: false };
      case "ends_with":
        if (typeof actual === "string" && typeof expected === "string") {
          return { result: cs ? actual.endsWith(expected) : actual.toLowerCase().endsWith(expected.toLowerCase()) };
        }
        return { result: false };
      case "matches":
        if (typeof actual === "string" && typeof expected === "string") {
          const flags = cs ? "" : "i";
          return { result: new RegExp(expected, flags).test(actual) };
        }
        return { result: false };
      case "not_matches":
        if (typeof actual === "string" && typeof expected === "string") {
          const flags = cs ? "" : "i";
          return { result: !new RegExp(expected, flags).test(actual) };
        }
        return { result: true };

      case "in":
        return { result: Array.isArray(expected) && expected.some((v) => deepLooseEqual(actual, v)) };
      case "not_in":
        return { result: Array.isArray(expected) && !expected.some((v) => deepLooseEqual(actual, v)) };

      case "is_null": return { result: actual === null || actual === undefined };
      case "is_not_null": return { result: actual !== null && actual !== undefined };

      case "is_empty": return { result: isEmpty(actual) };
      case "is_not_empty": return { result: !isEmpty(actual) };

      case "is_true": return { result: actual === true || actual === "true" || actual === 1 };
      case "is_false": return { result: actual === false || actual === "false" || actual === 0 };

      case "between": {
        if (Array.isArray(expected) && expected.length === 2 && typeof actual === "number") {
          const [min, max] = expected as [number, number];
          return { result: actual >= min && actual <= max };
        }
        return { result: false };
      }

      default:
        return { result: false, error: `Unknown operator: ${condition.operator}` };
    }
  } catch (err) {
    return { result: false, error: String(err) };
  }
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function deepLooseEqual(a: unknown, b: unknown): boolean {
  // eslint-disable-next-line eqeqeq
  if (a == b) return true;  // loose equality for type coercion (e.g. "1" == 1)
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) {
    // cross-type: convert to string for comparison if one is a string
    if (typeof a === "string" || typeof b === "string") {
      return String(a) === String(b);
    }
    return false;
  }
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const aa = a as unknown[]; const bb = b as unknown[];
    return aa.length === bb.length && aa.every((v, i) => deepLooseEqual(v, bb[i]));
  }
  const oa = a as Record<string, unknown>; const ob = b as Record<string, unknown>;
  const keys = Object.keys(oa);
  return keys.length === Object.keys(ob).length && keys.every((k) => deepLooseEqual(oa[k], ob[k]));
}

// ─────────────────────────────────────────────────────────────────────────────
// Compound Condition Evaluation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate a condition (simple or compound) against a data object.
 */
export function evaluateCondition(
  condition: Condition,
  data: Record<string, unknown>
): EvaluationResult {
  const errors: string[] = [];

  function eval_(cond: Condition): boolean {
    if (cond.type === "simple") {
      const { result, error } = evaluateSimple(cond, data);
      if (error) errors.push(error);
      return result;
    }

    const { operator, conditions } = cond as CompoundCondition;
    if (conditions.length === 0) return operator === "and"; // empty AND = true, empty OR = false... handled below

    switch (operator) {
      case "and": return conditions.every((c) => eval_(c));
      case "or": return conditions.some((c) => eval_(c));
      case "not": return !eval_(conditions[0]);
      default: {
        errors.push(`Unknown logical operator: ${operator}`);
        return false;
      }
    }
  }

  const result = eval_(condition);
  return { result, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for Building Conditions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a simple condition.
 */
export function simple(
  field: string,
  operator: ComparisonOperator,
  value?: ConditionValue,
  caseSensitive?: boolean
): SimpleCondition {
  return { type: "simple", field, operator, value, caseSensitive };
}

/**
 * Build an AND compound condition.
 */
export function and(...conditions: Condition[]): CompoundCondition {
  return { type: "compound", operator: "and", conditions };
}

/**
 * Build an OR compound condition.
 */
export function or(...conditions: Condition[]): CompoundCondition {
  return { type: "compound", operator: "or", conditions };
}

/**
 * Build a NOT condition.
 */
export function not(condition: Condition): CompoundCondition {
  return { type: "compound", operator: "not", conditions: [condition] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Switch Evaluation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate a list of switch cases and return the first matching one.
 */
export function evaluateSwitch(
  cases: SwitchCase[],
  data: Record<string, unknown>
): SwitchEvaluation {
  const allResults: Array<{ caseId: string; result: boolean }> = [];
  const errors: string[] = [];
  let matchedCaseId: string | undefined;

  for (const switchCase of cases) {
    const { result, errors: caseErrors } = evaluateCondition(switchCase.condition, data);
    allResults.push({ caseId: switchCase.id, result });
    errors.push(...caseErrors);
    if (result && !matchedCaseId) {
      matchedCaseId = switchCase.id;
    }
  }

  return { matchedCaseId, allResults, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter Evaluation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filter an array of data records using a condition.
 */
export function filterData(
  records: Record<string, unknown>[],
  condition: Condition
): Record<string, unknown>[] {
  return records.filter((record) => evaluateCondition(condition, record).result);
}

/**
 * Partition records into matching and non-matching groups.
 */
export function partitionData(
  records: Record<string, unknown>[],
  condition: Condition
): {
  matching: Record<string, unknown>[];
  nonMatching: Record<string, unknown>[];
} {
  const matching: Record<string, unknown>[] = [];
  const nonMatching: Record<string, unknown>[] = [];
  for (const record of records) {
    if (evaluateCondition(condition, record).result) matching.push(record);
    else nonMatching.push(record);
  }
  return { matching, nonMatching };
}

// ─────────────────────────────────────────────────────────────────────────────
// Condition Serialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Produce a human-readable description of a condition.
 */
export function describeCondition(condition: Condition): string {
  if (condition.type === "simple") {
    const { field, operator, value } = condition;
    const valStr = value === undefined ? "" : ` ${JSON.stringify(value)}`;
    return `${field} ${operator}${valStr}`;
  }
  const { operator, conditions } = condition as CompoundCondition;
  if (operator === "not") {
    return `NOT (${describeCondition(conditions[0])})`;
  }
  const parts = conditions.map((c) => `(${describeCondition(c)})`);
  return parts.join(` ${operator.toUpperCase()} `);
}
