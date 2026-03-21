import { describe, it, expect } from "vitest";
import {
  getValueByPath,
  evaluateAssertion,
  runTestCase,
  aggregateTestResults,
  formatSuiteResult,
  filterTestsByTag,
  type WorkflowTestCase,
  type TestCaseResult,
} from "./workflow-test-runner";

describe("getValueByPath", () => {
  const obj = {
    name: "John",
    address: { city: "Bangkok", zip: "10000" },
    items: [{ id: 1, name: "a" }, { id: 2, name: "b" }],
    count: 0,
  };

  it("gets top-level value", () => {
    expect(getValueByPath(obj, "name")).toBe("John");
  });

  it("gets nested value with dot notation", () => {
    expect(getValueByPath(obj, "address.city")).toBe("Bangkok");
  });

  it("gets array item by index", () => {
    expect(getValueByPath(obj, "items[0].name")).toBe("a");
    expect(getValueByPath(obj, "items[1].id")).toBe(2);
  });

  it("returns undefined for missing path", () => {
    expect(getValueByPath(obj, "nonexistent")).toBeUndefined();
    expect(getValueByPath(obj, "address.phone")).toBeUndefined();
  });

  it("returns the whole object for empty path", () => {
    expect(getValueByPath(obj, "")).toBe(obj);
  });
});

describe("evaluateAssertion", () => {
  const output = {
    status: "success",
    data: { count: 5, items: ["a", "b", "c"], user: { name: "Alice" } },
    empty: null,
  };

  it("equals: matches same value", () => {
    const result = evaluateAssertion({ path: "status", operator: "equals", expected: "success" }, output);
    expect(result.passed).toBe(true);
  });

  it("equals: fails on different value", () => {
    const result = evaluateAssertion({ path: "status", operator: "equals", expected: "error" }, output);
    expect(result.passed).toBe(false);
  });

  it("not_equals: passes on different value", () => {
    const result = evaluateAssertion({ path: "status", operator: "not_equals", expected: "error" }, output);
    expect(result.passed).toBe(true);
  });

  it("contains: string contains", () => {
    const result = evaluateAssertion({ path: "status", operator: "contains", expected: "uc" }, output);
    expect(result.passed).toBe(true);
  });

  it("contains: array contains item", () => {
    const result = evaluateAssertion({ path: "data.items", operator: "contains", expected: "b" }, output);
    expect(result.passed).toBe(true);
  });

  it("not_contains: string not contains", () => {
    const result = evaluateAssertion({ path: "status", operator: "not_contains", expected: "error" }, output);
    expect(result.passed).toBe(true);
  });

  it("greater_than: number comparison", () => {
    const result = evaluateAssertion({ path: "data.count", operator: "greater_than", expected: 3 }, output);
    expect(result.passed).toBe(true);
  });

  it("less_than: number comparison", () => {
    const result = evaluateAssertion({ path: "data.count", operator: "less_than", expected: 10 }, output);
    expect(result.passed).toBe(true);
  });

  it("less_than: fails when value is higher", () => {
    const result = evaluateAssertion({ path: "data.count", operator: "less_than", expected: 3 }, output);
    expect(result.passed).toBe(false);
  });

  it("matches_regex: valid pattern", () => {
    const result = evaluateAssertion({ path: "status", operator: "matches_regex", expected: "^succ" }, output);
    expect(result.passed).toBe(true);
  });

  it("matches_regex: fails on no match", () => {
    const result = evaluateAssertion({ path: "status", operator: "matches_regex", expected: "^fail" }, output);
    expect(result.passed).toBe(false);
  });

  it("is_truthy: truthy value", () => {
    const result = evaluateAssertion({ path: "status", operator: "is_truthy" }, output);
    expect(result.passed).toBe(true);
  });

  it("is_falsy: null value", () => {
    const result = evaluateAssertion({ path: "empty", operator: "is_falsy" }, output);
    expect(result.passed).toBe(true);
  });

  it("has_key: key exists in object", () => {
    const result = evaluateAssertion({ path: "data", operator: "has_key", expected: "count" }, output);
    expect(result.passed).toBe(true);
  });

  it("has_key: key does not exist", () => {
    const result = evaluateAssertion({ path: "data", operator: "has_key", expected: "missing" }, output);
    expect(result.passed).toBe(false);
  });

  it("array_length: correct length", () => {
    const result = evaluateAssertion({ path: "data.items", operator: "array_length", expected: 3 }, output);
    expect(result.passed).toBe(true);
  });

  it("array_length: wrong length", () => {
    const result = evaluateAssertion({ path: "data.items", operator: "array_length", expected: 5 }, output);
    expect(result.passed).toBe(false);
  });

  it("uses custom message when provided", () => {
    const result = evaluateAssertion(
      { path: "status", operator: "equals", expected: "error", message: "Custom fail message" },
      output
    );
    expect(result.passed).toBe(false);
    expect(result.message).toBe("Custom fail message");
  });
});

describe("runTestCase", () => {
  const testCase: WorkflowTestCase = {
    id: "test-1",
    name: "Basic test",
    input: { url: "https://example.com" },
    assertions: [
      { path: "status", operator: "equals", expected: "success" },
      { path: "data.count", operator: "greater_than", expected: 0 },
    ],
  };

  const output = { status: "success", data: { count: 5 } };

  it("passes when all assertions pass", () => {
    const result = runTestCase(testCase, output, "SUCCESS", 100);
    expect(result.passed).toBe(true);
    expect(result.assertionResults.every((a) => a.passed)).toBe(true);
  });

  it("fails when any assertion fails", () => {
    const result = runTestCase(testCase, { status: "error", data: { count: 5 } }, "SUCCESS");
    expect(result.passed).toBe(false);
  });

  it("checks expected status", () => {
    const tc = { ...testCase, expectedStatus: "FAILED" as const, assertions: [] };
    const result = runTestCase(tc, {}, "SUCCESS");
    expect(result.passed).toBe(false);
  });

  it("passes status check when status matches", () => {
    const tc = { ...testCase, expectedStatus: "SUCCESS" as const, assertions: [] };
    const result = runTestCase(tc, {}, "SUCCESS");
    expect(result.passed).toBe(true);
  });
});

describe("aggregateTestResults", () => {
  const makeResult = (passed: boolean): TestCaseResult => ({
    testCase: { id: "t", name: "test", input: {}, assertions: [] },
    passed,
    assertionResults: [],
  });

  it("counts passed and failed", () => {
    const results = [makeResult(true), makeResult(true), makeResult(false)];
    const suite = aggregateTestResults("wf-1", results, 500);
    expect(suite.total).toBe(3);
    expect(suite.passed).toBe(2);
    expect(suite.failed).toBe(1);
    expect(suite.durationMs).toBe(500);
  });
});

describe("formatSuiteResult", () => {
  it("formats result string", () => {
    const suite = {
      workflowId: "wf-1",
      total: 10,
      passed: 8,
      failed: 2,
      skipped: 0,
      results: [],
      durationMs: 1234,
    };
    const formatted = formatSuiteResult(suite);
    expect(formatted).toContain("8/10");
    expect(formatted).toContain("80%");
    expect(formatted).toContain("1234ms");
  });
});

describe("filterTestsByTag", () => {
  const tests: WorkflowTestCase[] = [
    { id: "1", name: "T1", input: {}, assertions: [], tags: ["smoke", "api"] },
    { id: "2", name: "T2", input: {}, assertions: [], tags: ["smoke"] },
    { id: "3", name: "T3", input: {}, assertions: [], tags: ["regression"] },
  ];

  it("filters by tag", () => {
    expect(filterTestsByTag(tests, "smoke")).toHaveLength(2);
    expect(filterTestsByTag(tests, "api")).toHaveLength(1);
    expect(filterTestsByTag(tests, "regression")).toHaveLength(1);
    expect(filterTestsByTag(tests, "missing")).toHaveLength(0);
  });
});
