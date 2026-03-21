/**
 * Phase 31 — Workflow Testing Suite
 * Utilities for defining and running test cases against workflows.
 */

export type AssertionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "greater_than"
  | "less_than"
  | "matches_regex"
  | "is_truthy"
  | "is_falsy"
  | "has_key"
  | "array_length";

export interface TestAssertion {
  path: string;          // dot-notation path in the output (e.g. "data.user.name")
  operator: AssertionOperator;
  expected?: unknown;    // not needed for is_truthy/is_falsy
  message?: string;      // custom failure message
}

export interface WorkflowTestCase {
  id: string;
  name: string;
  description?: string;
  /** Input data to pass to the workflow */
  input: Record<string, unknown>;
  /** Node ID to mock (optional) */
  mocks?: Record<string, unknown>; // nodeId -> mock output
  /** Assertions on the final output */
  assertions: TestAssertion[];
  /** Expected execution status */
  expectedStatus?: "SUCCESS" | "FAILED";
  /** Tags for grouping */
  tags?: string[];
}

export interface AssertionResult {
  assertion: TestAssertion;
  passed: boolean;
  actual?: unknown;
  message: string;
}

export interface TestCaseResult {
  testCase: WorkflowTestCase;
  passed: boolean;
  assertionResults: AssertionResult[];
  executionTimeMs?: number;
  error?: string;
}

export interface TestSuiteResult {
  workflowId: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  results: TestCaseResult[];
  durationMs: number;
}

/**
 * Get a value from an object using dot-notation path.
 * Supports array indexing: "items[0].name"
 */
export function getValueByPath(obj: unknown, path: string): unknown {
  if (path === "" || path === ".") return obj;

  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Evaluate a single assertion against actual output.
 */
export function evaluateAssertion(
  assertion: TestAssertion,
  output: unknown
): AssertionResult {
  const actual = getValueByPath(output, assertion.path);

  let passed = false;
  let message = "";

  switch (assertion.operator) {
    case "equals":
      passed = JSON.stringify(actual) === JSON.stringify(assertion.expected);
      message = passed
        ? `"${assertion.path}" equals expected value`
        : `Expected "${assertion.path}" to equal ${JSON.stringify(assertion.expected)}, got ${JSON.stringify(actual)}`;
      break;

    case "not_equals":
      passed = JSON.stringify(actual) !== JSON.stringify(assertion.expected);
      message = passed
        ? `"${assertion.path}" does not equal ${JSON.stringify(assertion.expected)}`
        : `Expected "${assertion.path}" to NOT equal ${JSON.stringify(assertion.expected)}`;
      break;

    case "contains":
      if (typeof actual === "string" && typeof assertion.expected === "string") {
        passed = actual.includes(assertion.expected);
      } else if (Array.isArray(actual)) {
        passed = actual.some((item) => JSON.stringify(item) === JSON.stringify(assertion.expected));
      } else {
        passed = false;
      }
      message = passed
        ? `"${assertion.path}" contains expected value`
        : `Expected "${assertion.path}" to contain ${JSON.stringify(assertion.expected)}`;
      break;

    case "not_contains":
      if (typeof actual === "string" && typeof assertion.expected === "string") {
        passed = !actual.includes(assertion.expected);
      } else if (Array.isArray(actual)) {
        passed = !actual.some((item) => JSON.stringify(item) === JSON.stringify(assertion.expected));
      } else {
        passed = true; // null/undefined doesn't contain anything
      }
      message = passed
        ? `"${assertion.path}" does not contain the value`
        : `Expected "${assertion.path}" to NOT contain ${JSON.stringify(assertion.expected)}`;
      break;

    case "greater_than":
      passed = typeof actual === "number" && typeof assertion.expected === "number" && actual > assertion.expected;
      message = passed
        ? `"${assertion.path}" (${actual}) > ${assertion.expected}`
        : `Expected "${assertion.path}" (${actual}) to be greater than ${assertion.expected}`;
      break;

    case "less_than":
      passed = typeof actual === "number" && typeof assertion.expected === "number" && actual < assertion.expected;
      message = passed
        ? `"${assertion.path}" (${actual}) < ${assertion.expected}`
        : `Expected "${assertion.path}" (${actual}) to be less than ${assertion.expected}`;
      break;

    case "matches_regex":
      if (typeof actual === "string" && typeof assertion.expected === "string") {
        try {
          passed = new RegExp(assertion.expected).test(actual);
        } catch {
          passed = false;
        }
      } else {
        passed = false;
      }
      message = passed
        ? `"${assertion.path}" matches pattern ${assertion.expected}`
        : `Expected "${assertion.path}" ("${actual}") to match regex ${assertion.expected}`;
      break;

    case "is_truthy":
      passed = Boolean(actual);
      message = passed
        ? `"${assertion.path}" is truthy`
        : `Expected "${assertion.path}" to be truthy, got ${JSON.stringify(actual)}`;
      break;

    case "is_falsy":
      passed = !Boolean(actual);
      message = passed
        ? `"${assertion.path}" is falsy`
        : `Expected "${assertion.path}" to be falsy, got ${JSON.stringify(actual)}`;
      break;

    case "has_key":
      passed = typeof actual === "object" && actual !== null && String(assertion.expected) in (actual as object);
      message = passed
        ? `"${assertion.path}" has key "${assertion.expected}"`
        : `Expected "${assertion.path}" to have key "${assertion.expected}"`;
      break;

    case "array_length":
      passed = Array.isArray(actual) && actual.length === assertion.expected;
      message = passed
        ? `"${assertion.path}" has length ${assertion.expected}`
        : `Expected "${assertion.path}" to have length ${assertion.expected}, got ${Array.isArray(actual) ? actual.length : "non-array"}`;
      break;

    default:
      message = `Unknown operator: ${assertion.operator}`;
  }

  return {
    assertion,
    passed,
    actual,
    message: assertion.message ?? message,
  };
}

/**
 * Run all assertions for a test case against the given output.
 */
export function runTestCase(
  testCase: WorkflowTestCase,
  output: unknown,
  executionStatus?: "SUCCESS" | "FAILED",
  executionTimeMs?: number,
  error?: string
): TestCaseResult {
  const assertionResults = testCase.assertions.map((a) => evaluateAssertion(a, output));

  let passed = assertionResults.every((r) => r.passed);

  // Check expected status if provided
  if (testCase.expectedStatus && executionStatus) {
    if (testCase.expectedStatus !== executionStatus) {
      passed = false;
      assertionResults.push({
        assertion: {
          path: "__status__",
          operator: "equals",
          expected: testCase.expectedStatus,
        },
        passed: false,
        actual: executionStatus,
        message: `Expected status ${testCase.expectedStatus}, got ${executionStatus}`,
      });
    }
  }

  return {
    testCase,
    passed,
    assertionResults,
    executionTimeMs,
    error,
  };
}

/**
 * Aggregate multiple test case results into a suite result.
 */
export function aggregateTestResults(
  workflowId: string,
  results: TestCaseResult[],
  durationMs: number
): TestSuiteResult {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    workflowId,
    total: results.length,
    passed,
    failed,
    skipped: 0,
    results,
    durationMs,
  };
}

/**
 * Get a summary string of the suite result.
 */
export function formatSuiteResult(result: TestSuiteResult): string {
  const { total, passed, failed } = result;
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
  return `${passed}/${total} tests passed (${pct}%) in ${result.durationMs}ms`;
}

/**
 * Filter test cases by tag.
 */
export function filterTestsByTag(
  tests: WorkflowTestCase[],
  tag: string
): WorkflowTestCase[] {
  return tests.filter((t) => t.tags?.includes(tag));
}
