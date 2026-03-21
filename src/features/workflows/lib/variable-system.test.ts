import { describe, it, expect } from "vitest";
import {
  parseVariableValue,
  serializeVariableValue,
  maskSecret,
  filterVariables,
  resolveVariables,
  interpolateWithVariables,
  isValidVariableName,
  validateVariable,
  extractVariableReferences,
  getMissingVariables,
  type Variable,
} from "./variable-system";

const makeVar = (overrides: Partial<Variable> = {}): Variable => ({
  id: "var-1",
  name: "MY_VAR",
  value: "hello",
  type: "string",
  scope: "global",
  isSecret: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("parseVariableValue", () => {
  it("parses string as-is", () => {
    expect(parseVariableValue(makeVar({ type: "string", value: "hello" }))).toBe("hello");
  });

  it("parses number", () => {
    expect(parseVariableValue(makeVar({ type: "number", value: "42" }))).toBe(42);
    expect(parseVariableValue(makeVar({ type: "number", value: "3.14" }))).toBe(3.14);
  });

  it("returns 0 for invalid number", () => {
    expect(parseVariableValue(makeVar({ type: "number", value: "abc" }))).toBe(0);
  });

  it("parses boolean", () => {
    expect(parseVariableValue(makeVar({ type: "boolean", value: "true" }))).toBe(true);
    expect(parseVariableValue(makeVar({ type: "boolean", value: "false" }))).toBe(false);
    expect(parseVariableValue(makeVar({ type: "boolean", value: "1" }))).toBe(true);
  });

  it("parses JSON", () => {
    const result = parseVariableValue(makeVar({ type: "json", value: '{"key":"value"}' }));
    expect(result).toEqual({ key: "value" });
  });

  it("returns null for invalid JSON", () => {
    expect(parseVariableValue(makeVar({ type: "json", value: "not json" }))).toBeNull();
  });
});

describe("serializeVariableValue", () => {
  it("serializes JSON to string", () => {
    const result = serializeVariableValue({ key: "val" }, "json");
    expect(result).toBe('{"key":"val"}');
  });

  it("converts other types to string", () => {
    expect(serializeVariableValue(42, "number")).toBe("42");
    expect(serializeVariableValue(true, "boolean")).toBe("true");
  });
});

describe("maskSecret", () => {
  it("masks long secrets", () => {
    const masked = maskSecret("supersecrettoken123");
    expect(masked).toContain("*");
    expect(masked.startsWith("su")).toBe(true);
    expect(masked.endsWith("23")).toBe(true);
  });

  it("masks short secrets", () => {
    expect(maskSecret("ab")).toBe("****");
  });
});

describe("filterVariables", () => {
  const vars: Variable[] = [
    makeVar({ id: "1", scope: "global", name: "GLOBAL_KEY" }),
    makeVar({ id: "2", scope: "project", scopeId: "proj-1", name: "PROJ_KEY" }),
    makeVar({ id: "3", scope: "workflow", scopeId: "wf-1", name: "WF_KEY" }),
    makeVar({ id: "4", scope: "global", name: "API_URL", environment: "production" }),
  ];

  it("filters by scope", () => {
    expect(filterVariables(vars, { scope: "global" })).toHaveLength(2);
    expect(filterVariables(vars, { scope: "project" })).toHaveLength(1);
  });

  it("filters by scopeId", () => {
    expect(filterVariables(vars, { scopeId: "proj-1" })).toHaveLength(1);
  });

  it("filters by environment", () => {
    expect(filterVariables(vars, { environment: "production" })).toHaveLength(1);
  });

  it("filters by namePrefix", () => {
    expect(filterVariables(vars, { namePrefix: "GLOBAL" })).toHaveLength(1);
    expect(filterVariables(vars, { namePrefix: "API" })).toHaveLength(1);
  });
});

describe("resolveVariables", () => {
  const vars: Variable[] = [
    makeVar({ id: "1", name: "BASE_URL", value: "https://global.example.com", scope: "global" }),
    makeVar({ id: "2", name: "BASE_URL", value: "https://project.example.com", scope: "project", scopeId: "proj-1" }),
    makeVar({ id: "3", name: "API_KEY", value: "my-api-key", scope: "global" }),
    makeVar({ id: "4", name: "DEBUG", value: "true", scope: "workflow", scopeId: "wf-1", type: "boolean" }),
    makeVar({ id: "5", name: "ENV_VAR", value: "prod-value", scope: "global", environment: "production" }),
  ];

  it("resolves global variables", () => {
    const result = resolveVariables(vars, {});
    expect(result.BASE_URL).toBe("https://global.example.com");
    expect(result.API_KEY).toBe("my-api-key");
  });

  it("project scope overrides global", () => {
    const result = resolveVariables(vars, { projectId: "proj-1" });
    expect(result.BASE_URL).toBe("https://project.example.com");
  });

  it("workflow scope takes highest priority", () => {
    const moreVars = [
      ...vars,
      makeVar({ id: "6", name: "BASE_URL", value: "https://workflow.example.com", scope: "workflow", scopeId: "wf-1" }),
    ];
    const result = resolveVariables(moreVars, { workflowId: "wf-1", projectId: "proj-1" });
    expect(result.BASE_URL).toBe("https://workflow.example.com");
  });

  it("includes boolean parsed value", () => {
    const result = resolveVariables(vars, { workflowId: "wf-1" });
    expect(result.DEBUG).toBe(true);
  });

  it("skips environment-specific vars when environment doesn't match", () => {
    const result = resolveVariables(vars, { environment: "development" });
    expect(result.ENV_VAR).toBeUndefined();
  });

  it("includes environment-specific vars when environment matches", () => {
    const result = resolveVariables(vars, { environment: "production" });
    expect(result.ENV_VAR).toBe("prod-value");
  });
});

describe("interpolateWithVariables", () => {
  it("replaces variable references", () => {
    const result = interpolateWithVariables("Hello {{name}}!", { name: "World" });
    expect(result).toBe("Hello World!");
  });

  it("handles whitespace in references", () => {
    const result = interpolateWithVariables("{{ name }}", { name: "Alice" });
    expect(result).toBe("Alice");
  });

  it("leaves unknown references unchanged", () => {
    const result = interpolateWithVariables("Hello {{unknown}}!", { name: "World" });
    expect(result).toBe("Hello {{unknown}}!");
  });

  it("replaces multiple references", () => {
    const result = interpolateWithVariables("{{first}} {{last}}", { first: "John", last: "Doe" });
    expect(result).toBe("John Doe");
  });
});

describe("isValidVariableName", () => {
  it("accepts valid names", () => {
    expect(isValidVariableName("MY_VAR")).toBe(true);
    expect(isValidVariableName("apiKey")).toBe(true);
    expect(isValidVariableName("_private")).toBe(true);
  });

  it("rejects invalid names", () => {
    expect(isValidVariableName("123start")).toBe(false);
    expect(isValidVariableName("has space")).toBe(false);
    expect(isValidVariableName("has-dash")).toBe(false);
    expect(isValidVariableName("")).toBe(false);
  });

  it("rejects names over 64 chars", () => {
    expect(isValidVariableName("A".repeat(65))).toBe(false);
    expect(isValidVariableName("A".repeat(64))).toBe(true);
  });
});

describe("validateVariable", () => {
  it("validates a correct variable", () => {
    const errors = validateVariable({
      name: "MY_VAR",
      value: "hello",
      type: "string",
      scope: "global",
    });
    expect(errors).toHaveLength(0);
  });

  it("rejects missing name", () => {
    const errors = validateVariable({ value: "x", type: "string", scope: "global" });
    expect(errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("rejects project scope without scopeId", () => {
    const errors = validateVariable({ name: "V", value: "x", type: "string", scope: "project" });
    expect(errors.some((e) => e.includes("scopeId"))).toBe(true);
  });

  it("rejects invalid number value", () => {
    const errors = validateVariable({ name: "V", value: "notanumber", type: "number", scope: "global" });
    expect(errors.some((e) => e.includes("number"))).toBe(true);
  });

  it("rejects invalid boolean value", () => {
    const errors = validateVariable({ name: "V", value: "yes", type: "boolean", scope: "global" });
    expect(errors.some((e) => e.includes("boolean"))).toBe(true);
  });

  it("rejects invalid JSON value", () => {
    const errors = validateVariable({ name: "V", value: "{bad json", type: "json", scope: "global" });
    expect(errors.some((e) => e.includes("JSON"))).toBe(true);
  });
});

describe("extractVariableReferences", () => {
  it("extracts variable names from template", () => {
    const refs = extractVariableReferences("Hello {{name}}, your ID is {{user_id}}!");
    expect(refs).toContain("name");
    expect(refs).toContain("user_id");
  });

  it("deduplicates references", () => {
    const refs = extractVariableReferences("{{name}} {{name}} {{name}}");
    expect(refs).toHaveLength(1);
  });

  it("returns empty for no references", () => {
    expect(extractVariableReferences("Hello world")).toHaveLength(0);
  });
});

describe("getMissingVariables", () => {
  it("returns missing variable names", () => {
    const missing = getMissingVariables("{{name}} {{email}}", { name: "Alice" });
    expect(missing).toEqual(["email"]);
  });

  it("returns empty when all variables present", () => {
    const missing = getMissingVariables("{{name}}", { name: "Bob" });
    expect(missing).toHaveLength(0);
  });
});
