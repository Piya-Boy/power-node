import { describe, it, expect } from "vitest";
import {
  createExport,
  validateExport,
  parseExport,
  validateWorkflowForExport,
  sanitizeForExport,
  importFromExport,
  validateImportedWorkflow,
  mergeImportSettings,
  createTemplate,
  instantiateTemplate,
  validateTemplate,
  detectFormat,
  estimateImportComplexity,
  buildImportSummary,
  type ExportedWorkflow,
  type WorkflowExport,
  type ImportResult,
} from "./workflow-io";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeWorkflow(overrides?: Partial<ExportedWorkflow>): ExportedWorkflow {
  return {
    id: "wf-1",
    name: "Test Workflow",
    description: "A test workflow",
    nodes: [{ id: "n1", type: "webhook" }, { id: "n2", type: "http" }],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
    settings: { timeout: 30, retries: 3 },
    tags: ["test", "demo"],
    version: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createExport
// ---------------------------------------------------------------------------
describe("createExport", () => {
  it("creates a valid export with default json format", () => {
    const wf = makeWorkflow();
    const exp = createExport([wf]);
    expect(exp.format).toBe("json");
    expect(exp.version).toBe("1.0");
    expect(exp.workflowCount).toBe(1);
    expect(exp.workflows).toHaveLength(1);
    expect(exp.metadata.exporter).toBe("powernode");
    expect(exp.metadata.platform).toBe("powernode-1.0");
  });

  it("uses specified format", () => {
    const exp = createExport([], "yaml");
    expect(exp.format).toBe("yaml");
  });

  it("sets workflowCount correctly", () => {
    const exp = createExport([makeWorkflow({ id: "wf-1" }), makeWorkflow({ id: "wf-2" })]);
    expect(exp.workflowCount).toBe(2);
    expect(exp.workflows).toHaveLength(2);
  });

  it("sets exportedAt to a recent date", () => {
    const before = new Date();
    const exp = createExport([]);
    const after = new Date();
    expect(exp.exportedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(exp.exportedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("creates empty export", () => {
    const exp = createExport([]);
    expect(exp.workflowCount).toBe(0);
    expect(exp.workflows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateExport
// ---------------------------------------------------------------------------
describe("validateExport", () => {
  it("validates a valid export", () => {
    const exp = createExport([makeWorkflow()]);
    expect(validateExport(exp).valid).toBe(true);
  });

  it("rejects null", () => {
    expect(validateExport(null).valid).toBe(false);
  });

  it("rejects missing format", () => {
    const exp = { ...createExport([]), format: undefined };
    expect(validateExport(exp).valid).toBe(false);
  });

  it("rejects missing version", () => {
    const exp = { ...createExport([]), version: undefined };
    expect(validateExport(exp).valid).toBe(false);
  });

  it("rejects missing workflows array", () => {
    const exp = { ...createExport([]), workflows: undefined };
    expect(validateExport(exp).valid).toBe(false);
  });

  it("rejects missing metadata", () => {
    const exp = { ...createExport([]), metadata: undefined };
    expect(validateExport(exp).valid).toBe(false);
  });

  it("returns error messages", () => {
    const result = validateExport({});
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// parseExport
// ---------------------------------------------------------------------------
describe("parseExport", () => {
  it("parses valid JSON export", () => {
    const exp = createExport([makeWorkflow()]);
    const json = JSON.stringify(exp);
    const parsed = parseExport(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.workflowCount).toBe(1);
  });

  it("converts exportedAt string to Date", () => {
    const exp = createExport([]);
    const json = JSON.stringify(exp);
    const parsed = parseExport(json);
    expect(parsed!.exportedAt).toBeInstanceOf(Date);
  });

  it("returns null for invalid JSON", () => {
    expect(parseExport("{invalid json}")).toBeNull();
  });

  it("returns null for valid JSON but invalid export structure", () => {
    expect(parseExport('{"foo": "bar"}')).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseExport("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateWorkflowForExport
// ---------------------------------------------------------------------------
describe("validateWorkflowForExport", () => {
  it("validates a valid workflow", () => {
    const wf = makeWorkflow();
    expect(validateWorkflowForExport(wf).valid).toBe(true);
  });

  it("rejects missing id", () => {
    const wf = { ...makeWorkflow(), id: undefined };
    expect(validateWorkflowForExport(wf).valid).toBe(false);
  });

  it("rejects missing name", () => {
    const wf = { ...makeWorkflow(), name: undefined };
    expect(validateWorkflowForExport(wf).valid).toBe(false);
  });

  it("rejects missing nodes", () => {
    const wf = { ...makeWorkflow(), nodes: undefined };
    expect(validateWorkflowForExport(wf).valid).toBe(false);
  });

  it("rejects missing version", () => {
    const wf = { ...makeWorkflow(), version: "1" as unknown as number };
    expect(validateWorkflowForExport(wf).valid).toBe(false);
  });

  it("returns error messages", () => {
    const result = validateWorkflowForExport({});
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// sanitizeForExport
// ---------------------------------------------------------------------------
describe("sanitizeForExport", () => {
  it("removes sensitive fields from settings", () => {
    const wf = makeWorkflow({
      settings: {
        timeout: 30,
        apiKey: "sk-secret-123",
        password: "hunter2",
        retries: 3,
      },
    });
    const sanitized = sanitizeForExport(wf);
    expect(sanitized.settings.timeout).toBe(30);
    expect(sanitized.settings.retries).toBe(3);
    expect(sanitized.settings.apiKey).toBeUndefined();
    expect(sanitized.settings.password).toBeUndefined();
  });

  it("removes token fields", () => {
    const wf = makeWorkflow({ settings: { accessToken: "token-abc", name: "my-workflow" } });
    const sanitized = sanitizeForExport(wf);
    expect(sanitized.settings.accessToken).toBeUndefined();
    expect(sanitized.settings.name).toBe("my-workflow");
  });

  it("preserves nodes and edges", () => {
    const wf = makeWorkflow();
    const sanitized = sanitizeForExport(wf);
    expect(sanitized.nodes).toEqual(wf.nodes);
    expect(sanitized.edges).toEqual(wf.edges);
  });

  it("does not mutate original workflow", () => {
    const wf = makeWorkflow({ settings: { apiKey: "secret", timeout: 30 } });
    sanitizeForExport(wf);
    expect(wf.settings.apiKey).toBe("secret");
  });
});

// ---------------------------------------------------------------------------
// validateImportedWorkflow
// ---------------------------------------------------------------------------
describe("validateImportedWorkflow", () => {
  it("skips validation when level is skip", () => {
    const result = validateImportedWorkflow({}, "skip");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("validates successfully in strict mode", () => {
    const wf = makeWorkflow();
    const result = validateImportedWorkflow(wf, "strict");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects missing required fields in strict mode", () => {
    const result = validateImportedWorkflow({ id: "wf1", name: "test" }, "strict");
    expect(result.valid).toBe(false);
  });

  it("adds warnings instead of errors in lenient mode for optional fields", () => {
    const wf = { id: "wf1", name: "test" }; // missing nodes/edges/version
    const result = validateImportedWorkflow(wf, "lenient");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("still requires id and name in lenient mode", () => {
    const result = validateImportedWorkflow({ nodes: [], edges: [], version: 1 }, "lenient");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("id"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// importFromExport
// ---------------------------------------------------------------------------
describe("importFromExport", () => {
  it("imports all workflows successfully", () => {
    const exp = createExport([makeWorkflow({ id: "wf-1" }), makeWorkflow({ id: "wf-2" })]);
    const result = importFromExport(exp);
    expect(result.success).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.workflows).toHaveLength(2);
  });

  it("skips duplicate workflow ids when skipDuplicates is true", () => {
    const exp = createExport([makeWorkflow({ id: "wf-existing" })]);
    const result = importFromExport(exp, {
      skipDuplicates: true,
      existingIds: ["wf-existing"],
    });
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.warnings.some((w) => w.includes("wf-existing"))).toBe(true);
  });

  it("records errors for invalid workflows in strict mode", () => {
    const exp = createExport([{ id: "", name: "", nodes: [], edges: [], settings: {}, tags: [], version: 1 }]);
    const result = importFromExport(exp, { validationLevel: "strict" });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.success).toBe(false);
  });

  it("imports with lenient validation (default)", () => {
    const exp = createExport([makeWorkflow()]);
    const result = importFromExport(exp);
    expect(result.imported).toBe(1);
  });

  it("handles empty export", () => {
    const exp = createExport([]);
    const result = importFromExport(exp);
    expect(result.success).toBe(true);
    expect(result.imported).toBe(0);
    expect(result.workflows).toHaveLength(0);
  });

  it("uses skip validation level to pass all workflows", () => {
    const exp = createExport([{ id: "", name: "", nodes: null as unknown as unknown[], edges: null as unknown as unknown[], settings: {}, tags: [], version: 0 }]);
    const result = importFromExport(exp, { validationLevel: "skip" });
    expect(result.imported).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// mergeImportSettings
// ---------------------------------------------------------------------------
describe("mergeImportSettings", () => {
  it("imports override existing settings", () => {
    const existing = { timeout: 30, retries: 3 };
    const imported = { timeout: 60 };
    const merged = mergeImportSettings(existing, imported);
    expect(merged.timeout).toBe(60);
    expect(merged.retries).toBe(3);
  });

  it("imported keys not in existing are added", () => {
    const existing = { timeout: 30 };
    const imported = { newSetting: "value" };
    const merged = mergeImportSettings(existing, imported);
    expect(merged.newSetting).toBe("value");
  });

  it("does not mutate inputs", () => {
    const existing = { a: 1 };
    const imported = { a: 2 };
    mergeImportSettings(existing, imported);
    expect(existing.a).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// createTemplate
// ---------------------------------------------------------------------------
describe("createTemplate", () => {
  it("creates a template from a workflow", () => {
    const wf = makeWorkflow();
    const template = createTemplate(wf, {
      id: "tmpl-1",
      description: "A great template",
      category: "automation",
    });
    expect(template.id).toBe("tmpl-1");
    expect(template.name).toBe(wf.name);
    expect(template.description).toBe("A great template");
    expect(template.category).toBe("automation");
    expect(template.nodes).toEqual(wf.nodes);
    expect(template.edges).toEqual(wf.edges);
  });

  it("uses default author and version", () => {
    const wf = makeWorkflow();
    const template = createTemplate(wf, {
      id: "tmpl-2",
      description: "desc",
      category: "cat",
    });
    expect(template.author).toBe("unknown");
    expect(template.version).toBe("1.0");
  });

  it("accepts requiredCredentials", () => {
    const wf = makeWorkflow();
    const template = createTemplate(wf, {
      id: "tmpl-3",
      description: "desc",
      category: "cat",
      requiredCredentials: ["openai", "sendgrid"],
    });
    expect(template.requiredCredentials).toEqual(["openai", "sendgrid"]);
  });

  it("sets createdAt to current date", () => {
    const before = new Date();
    const wf = makeWorkflow();
    const template = createTemplate(wf, { id: "t", description: "d", category: "c" });
    const after = new Date();
    expect(template.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(template.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

// ---------------------------------------------------------------------------
// instantiateTemplate
// ---------------------------------------------------------------------------
describe("instantiateTemplate", () => {
  it("creates workflow from template", () => {
    const wf = makeWorkflow();
    const template = createTemplate(wf, { id: "t1", description: "d", category: "c" });
    const instance = instantiateTemplate(template);
    expect(instance.name).toBe(wf.name);
    expect(instance.nodes).toEqual(wf.nodes);
    expect(instance.edges).toEqual(wf.edges);
    expect(instance.version).toBe(1);
  });

  it("applies overrides", () => {
    const wf = makeWorkflow();
    const template = createTemplate(wf, { id: "t1", description: "d", category: "c" });
    const instance = instantiateTemplate(template, { name: "My Custom Name", id: "custom-id" });
    expect(instance.name).toBe("My Custom Name");
    expect(instance.id).toBe("custom-id");
  });

  it("generates unique id by default", () => {
    const wf = makeWorkflow();
    const template = createTemplate(wf, { id: "t1", description: "d", category: "c" });
    const i1 = instantiateTemplate(template);
    const i2 = instantiateTemplate(template);
    // Both should have ids starting with "wf-"
    expect(i1.id).toMatch(/^wf-/);
    expect(i2.id).toMatch(/^wf-/);
  });
});

// ---------------------------------------------------------------------------
// validateTemplate
// ---------------------------------------------------------------------------
describe("validateTemplate", () => {
  it("validates a valid template", () => {
    const wf = makeWorkflow();
    const template = createTemplate(wf, {
      id: "t1",
      description: "desc",
      category: "cat",
      author: "me",
      version: "2.0",
    });
    expect(validateTemplate(template).valid).toBe(true);
  });

  it("rejects missing required fields", () => {
    expect(validateTemplate({}).valid).toBe(false);
  });

  it("rejects missing id", () => {
    const template = { name: "n", description: "d", category: "c", nodes: [], edges: [], author: "a", version: "1.0" };
    expect(validateTemplate(template).valid).toBe(false);
  });

  it("rejects missing description", () => {
    const template = { id: "t", name: "n", category: "c", nodes: [], edges: [], author: "a", version: "1.0" };
    expect(validateTemplate(template).valid).toBe(false);
  });

  it("returns error messages", () => {
    const result = validateTemplate({});
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// detectFormat
// ---------------------------------------------------------------------------
describe("detectFormat", () => {
  it("detects json format", () => {
    const exp = createExport([]);
    const json = JSON.stringify(exp);
    expect(detectFormat(json)).toBe("json");
  });

  it("detects template format from format field", () => {
    const content = JSON.stringify({ format: "template", version: "1.0" });
    expect(detectFormat(content)).toBe("template");
  });

  it("detects yaml from --- prefix", () => {
    expect(detectFormat("---\nformat: json")).toBe("yaml");
  });

  it("detects yaml from key: value pattern", () => {
    expect(detectFormat("format: json\nversion: 1.0")).toBe("yaml");
  });

  it("returns null for unrecognized format", () => {
    expect(detectFormat("this is just plain text")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(detectFormat("{invalid}")).toBeNull();
  });

  it("detects compressed format from base64 string", () => {
    const b64 = "SGVsbG9Xb3JsZFRlc3RpbmdCYXNlNjRFeGFtcGxlRGF0YT09";
    const result = detectFormat(b64);
    expect(result).toBe("compressed");
  });
});

// ---------------------------------------------------------------------------
// estimateImportComplexity
// ---------------------------------------------------------------------------
describe("estimateImportComplexity", () => {
  it("estimates simple complexity for small workflow", () => {
    const exp = createExport([makeWorkflow()]);
    const result = estimateImportComplexity(exp);
    expect(result.complexity).toBe("simple");
    expect(result.nodeCount).toBe(2);
    expect(result.edgeCount).toBe(1);
  });

  it("estimates moderate complexity for medium workflow", () => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, type: "http" }));
    const edges = Array.from({ length: 25 }, (_, i) => ({ id: `e${i}` }));
    const wf = makeWorkflow({ nodes, edges });
    const exp = createExport([wf]);
    const result = estimateImportComplexity(exp);
    expect(result.complexity).toBe("moderate");
  });

  it("estimates complex complexity for large workflow", () => {
    const nodes = Array.from({ length: 60 }, (_, i) => ({ id: `n${i}`, type: "http" }));
    const edges = Array.from({ length: 80 }, (_, i) => ({ id: `e${i}` }));
    const wf = makeWorkflow({ nodes, edges });
    const exp = createExport([wf]);
    const result = estimateImportComplexity(exp);
    expect(result.complexity).toBe("complex");
  });

  it("aggregates counts across multiple workflows", () => {
    const wf1 = makeWorkflow({ id: "wf-1", nodes: [{ id: "n1" }], edges: [] });
    const wf2 = makeWorkflow({ id: "wf-2", nodes: [{ id: "n2" }, { id: "n3" }], edges: [] });
    const exp = createExport([wf1, wf2]);
    const result = estimateImportComplexity(exp);
    expect(result.nodeCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// buildImportSummary
// ---------------------------------------------------------------------------
describe("buildImportSummary", () => {
  it("reports success for clean import", () => {
    const result: ImportResult = {
      success: true,
      imported: 3,
      skipped: 0,
      errors: [],
      warnings: [],
      workflows: [],
    };
    const summary = buildImportSummary(result);
    expect(summary).toContain("3 workflow(s)");
  });

  it("reports errors when present", () => {
    const result: ImportResult = {
      success: false,
      imported: 1,
      skipped: 1,
      errors: [{ workflowIndex: 0, message: "Missing id" }],
      warnings: [],
      workflows: [],
    };
    const summary = buildImportSummary(result);
    expect(summary).toContain("Missing id");
    expect(summary).toContain("errors");
  });

  it("reports warnings when present", () => {
    const result: ImportResult = {
      success: true,
      imported: 2,
      skipped: 0,
      errors: [],
      warnings: ["Missing version, defaulting to 1"],
      workflows: [],
    };
    const summary = buildImportSummary(result);
    expect(summary).toContain("Warnings");
  });

  it("mentions skipped count when non-zero", () => {
    const result: ImportResult = {
      success: false,
      imported: 2,
      skipped: 1,
      errors: [{ workflowIndex: 2, message: "bad" }],
      warnings: [],
      workflows: [],
    };
    const summary = buildImportSummary(result);
    expect(summary).toContain("Skipped: 1");
  });
});
