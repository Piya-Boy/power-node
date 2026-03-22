import { describe, it, expect } from "vitest";
import {
  createStore,
  setVar,
  getVar,
  deleteVar,
  getVarsByScope,
  mergeStores,
  listVarKeys,
  parseTemplate,
  applyFilters,
  BUILT_IN_FILTERS,
  interpolateTemplate,
  interpolateValue,
  interpolateDeep,
  extractVarRefs,
  getMissingVars,
  hasAllVars,
  maskSecrets,
  type VarStore,
} from "./variable-interpolator";

// ─────────────────────────────────────────────────────────────────────────────
// VarStore Operations
// ─────────────────────────────────────────────────────────────────────────────

describe("createStore", () => {
  it("creates empty store", () => {
    expect(createStore().entries).toHaveLength(0);
  });

  it("creates store with initial entries", () => {
    const store = createStore([{ key: "x", value: 1, scope: "global" }]);
    expect(store.entries).toHaveLength(1);
  });
});

describe("setVar / getVar", () => {
  it("sets and gets a variable", () => {
    let store = createStore();
    store = setVar(store, "name", "Alice", "workflow");
    const entry = getVar(store, "name", "workflow");
    expect(entry?.value).toBe("Alice");
  });

  it("overwrites same key+scope", () => {
    let store = createStore();
    store = setVar(store, "x", 1, "global");
    store = setVar(store, "x", 2, "global");
    expect(getVar(store, "x", "global")?.value).toBe(2);
    expect(store.entries.filter((e) => e.key === "x")).toHaveLength(1);
  });

  it("resolves by priority without scope (node > workflow > global)", () => {
    let store = createStore();
    store = setVar(store, "v", "global_val", "global");
    store = setVar(store, "v", "workflow_val", "workflow");
    store = setVar(store, "v", "node_val", "node");
    expect(getVar(store, "v")?.value).toBe("node_val");
  });

  it("returns undefined for missing key", () => {
    expect(getVar(createStore(), "missing")).toBeUndefined();
  });
});

describe("deleteVar", () => {
  it("deletes by key and scope", () => {
    let store = setVar(createStore(), "x", 1, "global");
    store = deleteVar(store, "x", "global");
    expect(getVar(store, "x", "global")).toBeUndefined();
  });

  it("deletes all scopes when no scope given", () => {
    let store = createStore();
    store = setVar(store, "x", 1, "global");
    store = setVar(store, "x", 2, "workflow");
    store = deleteVar(store, "x");
    expect(getVar(store, "x")).toBeUndefined();
  });
});

describe("getVarsByScope", () => {
  it("returns only entries for given scope", () => {
    let store = createStore();
    store = setVar(store, "a", 1, "global");
    store = setVar(store, "b", 2, "global");
    store = setVar(store, "c", 3, "workflow");
    expect(getVarsByScope(store, "global")).toHaveLength(2);
    expect(getVarsByScope(store, "workflow")).toHaveLength(1);
  });
});

describe("mergeStores", () => {
  it("merges two stores", () => {
    const s1 = setVar(createStore(), "a", 1, "global");
    const s2 = setVar(createStore(), "b", 2, "global");
    const merged = mergeStores(s1, s2);
    expect(listVarKeys(merged, "global")).toContain("a");
    expect(listVarKeys(merged, "global")).toContain("b");
  });

  it("later store overrides earlier for same key+scope", () => {
    const s1 = setVar(createStore(), "x", "old", "global");
    const s2 = setVar(createStore(), "x", "new", "global");
    const merged = mergeStores(s1, s2);
    expect(getVar(merged, "x", "global")?.value).toBe("new");
  });
});

describe("listVarKeys", () => {
  it("lists all keys", () => {
    let store = createStore();
    store = setVar(store, "a", 1, "global");
    store = setVar(store, "b", 2, "workflow");
    expect(listVarKeys(store)).toContain("a");
    expect(listVarKeys(store)).toContain("b");
  });

  it("lists keys for specific scope", () => {
    let store = createStore();
    store = setVar(store, "a", 1, "global");
    store = setVar(store, "b", 2, "workflow");
    expect(listVarKeys(store, "global")).toEqual(["a"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseTemplate
// ─────────────────────────────────────────────────────────────────────────────

describe("parseTemplate", () => {
  it("parses literal only", () => {
    const tokens = parseTemplate("hello world");
    expect(tokens).toEqual([{ type: "literal", value: "hello world" }]);
  });

  it("parses simple variable", () => {
    const tokens = parseTemplate("{{name}}");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ type: "var", path: "name", filters: [] });
  });

  it("parses scoped variable", () => {
    const tokens = parseTemplate("{{global:apiKey}}");
    expect(tokens[0]).toMatchObject({ type: "var", path: "apiKey", scope: "global" });
  });

  it("parses variable with filters", () => {
    const tokens = parseTemplate("{{name|upper|trim}}");
    expect(tokens[0]).toMatchObject({ type: "var", path: "name", filters: ["upper", "trim"] });
  });

  it("parses mixed template", () => {
    const tokens = parseTemplate("Hello {{name}}, you have {{count}} items");
    expect(tokens).toHaveLength(5); // literal, var, literal, var, literal
    expect(tokens[0]).toMatchObject({ type: "literal", value: "Hello " });
  });

  it("parses raw expression", () => {
    const tokens = parseTemplate("${{1 + 2}}");
    expect(tokens[0]).toMatchObject({ type: "expr", body: "1 + 2" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyFilters / BUILT_IN_FILTERS
// ─────────────────────────────────────────────────────────────────────────────

describe("BUILT_IN_FILTERS", () => {
  it("upper", () => expect(BUILT_IN_FILTERS.upper("hello")).toBe("HELLO"));
  it("lower", () => expect(BUILT_IN_FILTERS.lower("WORLD")).toBe("world"));
  it("trim", () => expect(BUILT_IN_FILTERS.trim("  hi  ")).toBe("hi"));
  it("json", () => expect(BUILT_IN_FILTERS.json({ a: 1 })).toBe('{"a":1}'));
  it("base64", () => expect(BUILT_IN_FILTERS.base64("abc")).toBe(Buffer.from("abc").toString("base64")));
  it("urlencode", () => expect(BUILT_IN_FILTERS.urlencode("a b")).toBe("a%20b"));
  it("length — string", () => expect(BUILT_IN_FILTERS.length("hello")).toBe(5));
  it("length — array", () => expect(BUILT_IN_FILTERS.length([1, 2, 3])).toBe(3));
  it("first", () => expect(BUILT_IN_FILTERS.first([10, 20])).toBe(10));
  it("last", () => expect(BUILT_IN_FILTERS.last([10, 20])).toBe(20));
  it("reverse — array", () => expect(BUILT_IN_FILTERS.reverse([1, 2, 3])).toEqual([3, 2, 1]));
  it("reverse — string", () => expect(BUILT_IN_FILTERS.reverse("abc")).toBe("cba"));
  it("keys", () => expect(BUILT_IN_FILTERS.keys({ a: 1, b: 2 })).toEqual(["a", "b"]));
  it("not", () => expect(BUILT_IN_FILTERS.not(true)).toBe(false));
  it("string", () => expect(BUILT_IN_FILTERS.string(42)).toBe("42"));
  it("number", () => expect(BUILT_IN_FILTERS.number("42")).toBe(42));
  it("boolean", () => expect(BUILT_IN_FILTERS.boolean(0)).toBe(false));
  it("default_empty — passes value through", () => expect(BUILT_IN_FILTERS.default_empty("hello")).toBe("hello"));
  it("default_empty — empty string", () => expect(BUILT_IN_FILTERS.default_empty("")).toBe("(empty)"));
});

describe("applyFilters", () => {
  it("chains multiple filters", () => {
    expect(applyFilters("  hello  ", ["trim", "upper"])).toBe("HELLO");
  });

  it("ignores unknown filters", () => {
    expect(applyFilters("hello", ["nonexistent_filter"])).toBe("hello");
  });

  it("uses custom filters", () => {
    const custom = { shout: (v: unknown) => `${v}!!!` };
    expect(applyFilters("hi", ["shout"], custom)).toBe("hi!!!");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// interpolateTemplate
// ─────────────────────────────────────────────────────────────────────────────

describe("interpolateTemplate", () => {
  function makeStore(): VarStore {
    let store = createStore();
    store = setVar(store, "name", "Alice", "workflow");
    store = setVar(store, "count", 42, "workflow");
    store = setVar(store, "user", { email: "alice@example.com", role: "admin" }, "workflow");
    store = setVar(store, "apiKey", "secret123", "secret");
    return store;
  }

  it("resolves simple variable", () => {
    const { output, resolved } = interpolateTemplate("Hello {{name}}!", makeStore());
    expect(output).toBe("Hello Alice!");
    expect(resolved).toContain("name");
  });

  it("resolves multiple variables", () => {
    const { output } = interpolateTemplate("{{name}} has {{count}} items", makeStore());
    expect(output).toBe("Alice has 42 items");
  });

  it("tracks missing variables", () => {
    const { output, missing } = interpolateTemplate("{{missing}}", makeStore());
    expect(output).toBe("");
    expect(missing).toContain("missing");
  });

  it("uses fallback for missing", () => {
    const { output } = interpolateTemplate("{{missing}}", makeStore(), { fallback: "N/A" });
    expect(output).toBe("N/A");
  });

  it("applies filters", () => {
    const { output } = interpolateTemplate("{{name|upper}}", makeStore());
    expect(output).toBe("ALICE");
  });

  it("resolves scoped variable", () => {
    const { output } = interpolateTemplate("{{secret:apiKey}}", makeStore());
    expect(output).toBe("secret123");
  });

  it("strict mode throws on missing", () => {
    expect(() => interpolateTemplate("{{missing}}", makeStore(), { strict: true })).toThrow();
  });

  it("scope restriction prevents access", () => {
    const { output, errors } = interpolateTemplate(
      "{{secret:apiKey}}",
      makeStore(),
      { allowedScopes: ["workflow"] }
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(output).toBe("");
  });

  it("handles literal-only template", () => {
    const { output } = interpolateTemplate("no variables here", makeStore());
    expect(output).toBe("no variables here");
  });

  it("passes through raw expressions", () => {
    const { output } = interpolateTemplate("result: ${{1 + 2}}", makeStore());
    expect(output).toContain("${{1 + 2}}");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// interpolateValue / interpolateDeep
// ─────────────────────────────────────────────────────────────────────────────

describe("interpolateValue", () => {
  it("interpolates string values", () => {
    const store = setVar(createStore(), "x", "world", "workflow");
    expect(interpolateValue("hello {{x}}", store)).toBe("hello world");
  });

  it("passes through non-string values unchanged", () => {
    const store = createStore();
    expect(interpolateValue(42, store)).toBe(42);
    expect(interpolateValue(null, store)).toBeNull();
    expect(interpolateValue([1, 2], store)).toEqual([1, 2]);
  });
});

describe("interpolateDeep", () => {
  it("interpolates nested object", () => {
    let store = createStore();
    store = setVar(store, "name", "Alice", "workflow");
    store = setVar(store, "city", "Bangkok", "workflow");
    const obj = {
      greeting: "Hello {{name}}",
      location: { city: "{{city}}" },
      count: 5,
    };
    const result = interpolateDeep(obj, store) as Record<string, unknown>;
    expect(result.greeting).toBe("Hello Alice");
    expect((result.location as Record<string, unknown>).city).toBe("Bangkok");
    expect(result.count).toBe(5);
  });

  it("interpolates inside arrays", () => {
    const store = setVar(createStore(), "item", "apple", "workflow");
    const result = interpolateDeep(["I like {{item}}", 42], store);
    expect((result as unknown[])[0]).toBe("I like apple");
    expect((result as unknown[])[1]).toBe(42);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Variable Dependency Analysis
// ─────────────────────────────────────────────────────────────────────────────

describe("extractVarRefs", () => {
  it("extracts variable references", () => {
    const refs = extractVarRefs("{{name}} and {{global:apiKey|upper}}");
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({ path: "name" });
    expect(refs[1]).toMatchObject({ path: "apiKey", scope: "global" });
  });

  it("returns empty for literal-only template", () => {
    expect(extractVarRefs("hello world")).toHaveLength(0);
  });
});

describe("getMissingVars", () => {
  it("identifies missing variables", () => {
    const store = setVar(createStore(), "name", "Alice", "workflow");
    const missing = getMissingVars("{{name}} {{missing}}", store);
    expect(missing).toEqual(["missing"]);
  });
});

describe("hasAllVars", () => {
  it("true when all vars present", () => {
    const store = setVar(createStore(), "x", 1, "workflow");
    expect(hasAllVars("{{x}}", store)).toBe(true);
  });

  it("false when any var missing", () => {
    expect(hasAllVars("{{x}}", createStore())).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// maskSecrets
// ─────────────────────────────────────────────────────────────────────────────

describe("maskSecrets", () => {
  it("masks secret values in text", () => {
    const store = setVar(createStore(), "token", "supersecret", "secret");
    const result = maskSecrets("Authorization: Bearer supersecret", store);
    expect(result).toBe("Authorization: Bearer ****");
    expect(result).not.toContain("supersecret");
  });

  it("masks encrypted entries", () => {
    const store = createStore([
      { key: "pw", value: "mypassword", scope: "workflow", encrypted: true },
    ]);
    expect(maskSecrets("pw=mypassword", store)).toBe("pw=****");
  });

  it("does not mask non-secret values", () => {
    const store = setVar(createStore(), "name", "Alice", "workflow");
    expect(maskSecrets("name=Alice", store)).toBe("name=Alice");
  });
});
