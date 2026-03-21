import { describe, it, expect } from "vitest";
import {
  createTemplate,
  detectVariables,
  validateTemplate,
  renderTemplate,
  renderTemplateStrict,
  estimateTokens,
  buildConversation,
  mergeVariables,
  extractVariableSchema,
  validateVariableValue,
  searchTemplates,
  cloneTemplate,
  computeTemplateStats,
  type PromptTemplate,
  type TemplateVariable,
} from "./prompt-templates";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTemplate(overrides: Partial<PromptTemplate> = {}): PromptTemplate {
  const now = new Date("2024-01-01T00:00:00Z");
  return {
    id: "tmpl-1",
    name: "Test Template",
    description: "A test template",
    role: "user",
    template: "Hello, {{name}}!",
    variables: [{ name: "name", type: "string", required: true }],
    tags: ["greet"],
    version: "1.0.0",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeVar(overrides: Partial<TemplateVariable> = {}): TemplateVariable {
  return {
    name: "testVar",
    type: "string",
    required: true,
    ...overrides,
  };
}

// ─── createTemplate ───────────────────────────────────────────────────────────

describe("createTemplate", () => {
  it("creates template with required fields", () => {
    const t = createTemplate({ id: "t1", name: "T1", template: "Hello {{world}}" });
    expect(t.id).toBe("t1");
    expect(t.name).toBe("T1");
  });

  it("sets default role to user", () => {
    const t = createTemplate({ id: "t1", name: "T1", template: "Hi" });
    expect(t.role).toBe("user");
  });

  it("sets default version to 1.0.0", () => {
    const t = createTemplate({ id: "t1", name: "T1", template: "Hi" });
    expect(t.version).toBe("1.0.0");
  });

  it("sets createdAt and updatedAt", () => {
    const t = createTemplate({ id: "t1", name: "T1", template: "Hi" });
    expect(t.createdAt).toBeInstanceOf(Date);
    expect(t.updatedAt).toBeInstanceOf(Date);
  });

  it("auto-detects variables from template", () => {
    const t = createTemplate({ id: "t1", name: "T1", template: "Dear {{firstName}} {{lastName}}" });
    const names = t.variables.map((v) => v.name);
    expect(names).toContain("firstName");
    expect(names).toContain("lastName");
  });

  it("does not duplicate variables already defined", () => {
    const t = createTemplate({
      id: "t1",
      name: "T1",
      template: "Hello {{name}}",
      variables: [{ name: "name", type: "string", required: true }],
    });
    const nameVars = t.variables.filter((v) => v.name === "name");
    expect(nameVars).toHaveLength(1);
  });

  it("sets empty tags by default", () => {
    const t = createTemplate({ id: "t1", name: "T1", template: "Hi" });
    expect(t.tags).toEqual([]);
  });

  it("respects role override", () => {
    const t = createTemplate({ id: "t1", name: "T1", template: "You are helpful.", role: "system" });
    expect(t.role).toBe("system");
  });
});

// ─── detectVariables ─────────────────────────────────────────────────────────

describe("detectVariables", () => {
  it("returns empty array for template with no placeholders", () => {
    expect(detectVariables("Hello world!")).toEqual([]);
  });

  it("detects single variable", () => {
    expect(detectVariables("Hello {{name}}!")).toEqual(["name"]);
  });

  it("detects multiple variables", () => {
    const vars = detectVariables("{{greeting}} {{name}}, you have {{count}} messages.");
    expect(vars).toContain("greeting");
    expect(vars).toContain("name");
    expect(vars).toContain("count");
  });

  it("deduplicates repeated variables", () => {
    const vars = detectVariables("{{name}} and {{name}} again");
    expect(vars.filter((v) => v === "name")).toHaveLength(1);
  });

  it("ignores invalid placeholder syntax", () => {
    const vars = detectVariables("Hello { name } and {{valid}}");
    expect(vars).toEqual(["valid"]);
  });
});

// ─── validateTemplate ─────────────────────────────────────────────────────────

describe("validateTemplate", () => {
  it("returns valid for a proper template", () => {
    const t = makeTemplate();
    const { valid, errors } = validateTemplate(t);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it("errors on empty id", () => {
    const t = makeTemplate({ id: "" });
    const { valid, errors } = validateTemplate(t);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("id"))).toBe(true);
  });

  it("errors on empty name", () => {
    const t = makeTemplate({ name: "" });
    const { valid, errors } = validateTemplate(t);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("errors on empty template content", () => {
    const t = makeTemplate({ template: "" });
    const { valid, errors } = validateTemplate(t);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("template"))).toBe(true);
  });

  it("errors on invalid role", () => {
    const t = makeTemplate({ role: "invalid" as never });
    const { valid, errors } = validateTemplate(t);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("role"))).toBe(true);
  });

  it("errors when template uses undefined variable", () => {
    const t = makeTemplate({
      template: "Hello {{undefinedVar}}!",
      variables: [],
    });
    const { valid, errors } = validateTemplate(t);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("undefinedVar"))).toBe(true);
  });

  it("errors on invalid temperature", () => {
    const t = makeTemplate({ temperature: 5 });
    const { valid, errors } = validateTemplate(t);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("temperature"))).toBe(true);
  });

  it("errors on negative maxTokens", () => {
    const t = makeTemplate({ maxTokens: -100 });
    const { valid, errors } = validateTemplate(t);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("maxTokens"))).toBe(true);
  });

  it("errors on invalid version format", () => {
    const t = makeTemplate({ version: "v1.0" });
    const { valid, errors } = validateTemplate(t);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("version"))).toBe(true);
  });
});

// ─── renderTemplate ───────────────────────────────────────────────────────────

describe("renderTemplate", () => {
  it("substitutes variables", () => {
    const t = makeTemplate({ template: "Hello, {{name}}!" });
    const result = renderTemplate(t, { name: "Alice" });
    expect(result.content).toBe("Hello, Alice!");
  });

  it("tracks used variables", () => {
    const t = makeTemplate({ template: "{{name}} is {{age}}" , variables: [
      { name: "name", type: "string", required: true },
      { name: "age", type: "number", required: true },
    ]});
    const result = renderTemplate(t, { name: "Bob", age: 30 });
    expect(result.variablesUsed).toContain("name");
    expect(result.variablesUsed).toContain("age");
  });

  it("tracks missing required variables", () => {
    const t = makeTemplate({ template: "Hello, {{name}}!" });
    const result = renderTemplate(t, {});
    expect(result.missingVariables).toContain("name");
  });

  it("uses default value when variable not provided", () => {
    const t = makeTemplate({
      template: "Hello, {{name}}!",
      variables: [{ name: "name", type: "string", required: false, defaultValue: "World" }],
    });
    const result = renderTemplate(t, {});
    expect(result.content).toBe("Hello, World!");
  });

  it("returns correct role", () => {
    const t = makeTemplate({ role: "system" });
    const result = renderTemplate(t, { name: "Alice" });
    expect(result.role).toBe("system");
  });

  it("estimates tokens", () => {
    const t = makeTemplate({ template: "Hello, {{name}}!" });
    const result = renderTemplate(t, { name: "Alice" });
    expect(result.tokensEstimate).toBeGreaterThan(0);
  });
});

// ─── renderTemplateStrict ─────────────────────────────────────────────────────

describe("renderTemplateStrict", () => {
  it("returns content when all required vars present", () => {
    const t = makeTemplate({ template: "Hi {{name}}" });
    const result = renderTemplateStrict(t, { name: "Alice" });
    expect("content" in result).toBe(true);
    if ("content" in result) expect(result.content).toBe("Hi Alice");
  });

  it("returns error when required var missing", () => {
    const t = makeTemplate({ template: "Hi {{name}}" });
    const result = renderTemplateStrict(t, {});
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("name");
  });
});

// ─── estimateTokens ───────────────────────────────────────────────────────────

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns positive number for non-empty text", () => {
    expect(estimateTokens("Hello world")).toBeGreaterThan(0);
  });

  it("scales with word count", () => {
    const short = estimateTokens("Hello");
    const long = estimateTokens("Hello world this is a longer sentence with more words");
    expect(long).toBeGreaterThan(short);
  });

  it("uses ~1.3 multiplier on word count", () => {
    // "Hello world" = 2 words * 1.3 = 2.6 → ceil = 3
    expect(estimateTokens("Hello world")).toBe(3);
  });
});

// ─── buildConversation ────────────────────────────────────────────────────────

describe("buildConversation", () => {
  it("renders each template in order", () => {
    const system = makeTemplate({ id: "s1", role: "system", template: "You are {{persona}}.", variables: [{ name: "persona", type: "string", required: true }] });
    const user = makeTemplate({ id: "u1", role: "user", template: "Hello {{name}}!", variables: [{ name: "name", type: "string", required: true }] });
    const result = buildConversation([system, user], { persona: "helpful assistant", name: "Alice" });
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("system");
    expect(result[1].role).toBe("user");
  });

  it("returns empty array for no templates", () => {
    expect(buildConversation([], {})).toHaveLength(0);
  });

  it("shares variables across templates", () => {
    const t1 = makeTemplate({ id: "t1", template: "Hi {{name}}" });
    const t2 = makeTemplate({ id: "t2", template: "Bye {{name}}" });
    const results = buildConversation([t1, t2], { name: "Alice" });
    expect(results[0].content).toBe("Hi Alice");
    expect(results[1].content).toBe("Bye Alice");
  });
});

// ─── mergeVariables ───────────────────────────────────────────────────────────

describe("mergeVariables", () => {
  it("merges two variable sets", () => {
    const merged = mergeVariables({ a: 1 }, { b: 2 });
    expect(merged).toEqual({ a: 1, b: 2 });
  });

  it("overrides take precedence", () => {
    const merged = mergeVariables({ a: "default" }, { a: "override" });
    expect(merged.a).toBe("override");
  });

  it("preserves base fields not in overrides", () => {
    const merged = mergeVariables({ a: 1, b: 2 }, { c: 3 });
    expect(merged.a).toBe(1);
    expect(merged.b).toBe(2);
    expect(merged.c).toBe(3);
  });
});

// ─── extractVariableSchema ────────────────────────────────────────────────────

describe("extractVariableSchema", () => {
  it("builds schema map from variables", () => {
    const t = makeTemplate({
      variables: [
        { name: "name", type: "string", required: true },
        { name: "age", type: "number", required: false },
      ],
    });
    const schema = extractVariableSchema(t);
    expect(schema["name"]).toBeDefined();
    expect(schema["age"]).toBeDefined();
  });

  it("keys are variable names", () => {
    const t = makeTemplate();
    const schema = extractVariableSchema(t);
    expect(Object.keys(schema)).toContain("name");
  });

  it("returns empty object for no variables", () => {
    const t = makeTemplate({ variables: [], template: "Hi" });
    const schema = extractVariableSchema(t);
    expect(Object.keys(schema)).toHaveLength(0);
  });
});

// ─── validateVariableValue ────────────────────────────────────────────────────

describe("validateVariableValue", () => {
  it("returns valid for correct string", () => {
    const v = makeVar({ type: "string" });
    expect(validateVariableValue(v, "hello").valid).toBe(true);
  });

  it("returns invalid for wrong type (string expected, number given)", () => {
    const v = makeVar({ type: "string" });
    const result = validateVariableValue(v, 42);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("string");
  });

  it("returns valid for correct number", () => {
    const v = makeVar({ type: "number" });
    expect(validateVariableValue(v, 42).valid).toBe(true);
  });

  it("returns invalid for wrong type (number expected, string given)", () => {
    const v = makeVar({ type: "number" });
    const result = validateVariableValue(v, "42");
    expect(result.valid).toBe(false);
  });

  it("returns valid for correct boolean", () => {
    const v = makeVar({ type: "boolean" });
    expect(validateVariableValue(v, true).valid).toBe(true);
  });

  it("returns valid for correct array", () => {
    const v = makeVar({ type: "array" });
    expect(validateVariableValue(v, [1, 2, 3]).valid).toBe(true);
  });

  it("returns invalid for non-array when array expected", () => {
    const v = makeVar({ type: "array" });
    const result = validateVariableValue(v, { a: 1 });
    expect(result.valid).toBe(false);
  });

  it("returns valid for correct object", () => {
    const v = makeVar({ type: "object" });
    expect(validateVariableValue(v, { key: "val" }).valid).toBe(true);
  });

  it("validates regex pattern for string", () => {
    const v = makeVar({ type: "string", validator: "^[a-z]+$" });
    expect(validateVariableValue(v, "hello").valid).toBe(true);
    expect(validateVariableValue(v, "Hello123").valid).toBe(false);
  });

  it("returns invalid for missing required value", () => {
    const v = makeVar({ required: true });
    const result = validateVariableValue(v, undefined);
    expect(result.valid).toBe(false);
  });

  it("returns valid for missing optional value", () => {
    const v = makeVar({ required: false });
    const result = validateVariableValue(v, undefined);
    expect(result.valid).toBe(true);
  });
});

// ─── searchTemplates ──────────────────────────────────────────────────────────

describe("searchTemplates", () => {
  const templates = [
    makeTemplate({ id: "t1", name: "Greeting Template", tags: ["greeting", "welcome"] }),
    makeTemplate({ id: "t2", name: "Summary Generator", description: "Summarizes content", tags: ["ai"] }),
    makeTemplate({ id: "t3", name: "Code Reviewer", tags: ["code", "review"] }),
  ];

  it("returns all templates for empty query", () => {
    expect(searchTemplates(templates, "")).toHaveLength(3);
  });

  it("matches by name", () => {
    const results = searchTemplates(templates, "greeting");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("t1");
  });

  it("matches by description", () => {
    const results = searchTemplates(templates, "Summarizes");
    expect(results.some((t) => t.id === "t2")).toBe(true);
  });

  it("matches by tag", () => {
    const results = searchTemplates(templates, "review");
    expect(results.some((t) => t.id === "t3")).toBe(true);
  });

  it("is case insensitive", () => {
    const results = searchTemplates(templates, "GREETING");
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns empty when no match", () => {
    expect(searchTemplates(templates, "xyz-no-match")).toHaveLength(0);
  });
});

// ─── cloneTemplate ────────────────────────────────────────────────────────────

describe("cloneTemplate", () => {
  it("creates a new id different from original", () => {
    const t = makeTemplate({ id: "original" });
    const clone = cloneTemplate(t);
    expect(clone.id).not.toBe("original");
  });

  it("appends Copy to name", () => {
    const t = makeTemplate({ name: "Original" });
    const clone = cloneTemplate(t);
    expect(clone.name).toContain("Copy");
  });

  it("preserves template content", () => {
    const t = makeTemplate({ template: "Hello {{name}}" });
    const clone = cloneTemplate(t);
    expect(clone.template).toBe("Hello {{name}}");
  });

  it("applies overrides", () => {
    const t = makeTemplate();
    const clone = cloneTemplate(t, { name: "Custom Name" });
    expect(clone.name).toBe("Custom Name");
  });

  it("sets new timestamps", () => {
    const t = makeTemplate({ createdAt: new Date("2020-01-01"), updatedAt: new Date("2020-01-01") });
    const before = Date.now();
    const clone = cloneTemplate(t);
    expect(clone.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

// ─── computeTemplateStats ─────────────────────────────────────────────────────

describe("computeTemplateStats", () => {
  it("returns zeros for empty array", () => {
    const stats = computeTemplateStats([]);
    expect(stats.totalTemplates).toBe(0);
    expect(stats.avgVariables).toBe(0);
    expect(stats.withDefaults).toBe(0);
  });

  it("counts total templates", () => {
    const templates = [makeTemplate({ id: "t1" }), makeTemplate({ id: "t2" })];
    expect(computeTemplateStats(templates).totalTemplates).toBe(2);
  });

  it("counts by role", () => {
    const templates = [
      makeTemplate({ id: "t1", role: "system" }),
      makeTemplate({ id: "t2", role: "user" }),
      makeTemplate({ id: "t3", role: "user" }),
    ];
    const stats = computeTemplateStats(templates);
    expect(stats.byRole.system).toBe(1);
    expect(stats.byRole.user).toBe(2);
  });

  it("counts by model", () => {
    const templates = [
      makeTemplate({ id: "t1", model: "gpt-4" }),
      makeTemplate({ id: "t2", model: "gpt-4" }),
      makeTemplate({ id: "t3", model: "claude-3" }),
    ];
    const stats = computeTemplateStats(templates);
    expect(stats.byModel["gpt-4"]).toBe(2);
    expect(stats.byModel["claude-3"]).toBe(1);
  });

  it("computes avg variables", () => {
    const templates = [
      makeTemplate({ id: "t1", variables: [makeVar(), makeVar({ name: "v2" })] }),
      makeTemplate({ id: "t2", variables: [] }),
    ];
    const stats = computeTemplateStats(templates);
    expect(stats.avgVariables).toBe(1); // (2+0)/2
  });

  it("counts templates with defaults", () => {
    const templates = [
      makeTemplate({ id: "t1", variables: [{ name: "x", type: "string", required: false, defaultValue: "hi" }] }),
      makeTemplate({ id: "t2", variables: [{ name: "y", type: "string", required: true }] }),
    ];
    const stats = computeTemplateStats(templates);
    expect(stats.withDefaults).toBe(1);
  });
});
