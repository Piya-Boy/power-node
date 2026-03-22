import { describe, it, expect } from "vitest";
import {
  getPath,
  setPath,
  deletePath,
  applyMapping,
  renameFields,
  pickFields,
  omitFields,
  coerce,
  coerceRecord,
  flattenObject,
  unflattenObject,
  groupBy,
  indexBy,
  pluck,
  uniqueBy,
  chunk,
  zip,
  pivot,
  unpivot,
  interpolate,
  interpolateRecord,
  extractTemplateVars,
  deepMerge,
  createPipeline,
  listPaths,
  hasAllPaths,
  deepClone,
} from "./data-transformer";

// ─────────────────────────────────────────────────────────────────────────────
// getPath / setPath / deletePath
// ─────────────────────────────────────────────────────────────────────────────

describe("getPath", () => {
  it("gets top-level field", () => expect(getPath({ a: 1 }, "a")).toBe(1));
  it("gets nested field", () => expect(getPath({ a: { b: { c: 42 } } }, "a.b.c")).toBe(42));
  it("returns undefined for missing path", () => expect(getPath({ a: 1 }, "b.c")).toBeUndefined());
  it("returns undefined when traversing null", () => expect(getPath({ a: null }, "a.b")).toBeUndefined());
  it("returns whole object for empty path", () => {
    const obj = { x: 1 };
    expect(getPath(obj, "")).toBe(obj);
  });
});

describe("setPath", () => {
  it("sets top-level field", () => {
    expect(setPath({}, "x", 5)).toEqual({ x: 5 });
  });

  it("sets nested field immutably", () => {
    const obj = { a: { b: 1 } };
    const result = setPath(obj, "a.c", 2);
    expect(result.a).toEqual({ b: 1, c: 2 });
    expect((obj.a as Record<string, unknown>).c).toBeUndefined();
  });

  it("creates intermediate objects", () => {
    const result = setPath({}, "a.b.c", "hello");
    expect(result).toEqual({ a: { b: { c: "hello" } } });
  });
});

describe("deletePath", () => {
  it("deletes top-level key", () => {
    const result = deletePath({ a: 1, b: 2 }, "b");
    expect(result).toEqual({ a: 1 });
  });

  it("deletes nested key", () => {
    const result = deletePath({ a: { b: 1, c: 2 } }, "a.b");
    expect(result.a).toEqual({ c: 2 });
  });

  it("no-ops for missing path", () => {
    const obj = { a: 1 };
    expect(deletePath(obj, "z")).toEqual({ a: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyMapping
// ─────────────────────────────────────────────────────────────────────────────

describe("applyMapping", () => {
  it("maps source to target", () => {
    const result = applyMapping(
      { name: "Alice", age: 30 },
      [{ source: "name", target: "user.name" }, { source: "age", target: "user.age" }]
    );
    expect(result.output).toEqual({ user: { name: "Alice", age: 30 } });
    expect(result.mappedCount).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it("uses defaultValue for missing source", () => {
    const result = applyMapping(
      {},
      [{ source: "missing", target: "out", defaultValue: "default" }]
    );
    expect(result.output.out).toBe("default");
  });

  it("applies transform function", () => {
    const result = applyMapping(
      { value: "hello" },
      [{ source: "value", target: "upper", transform: (v) => String(v).toUpperCase() }]
    );
    expect(result.output.upper).toBe("HELLO");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// renameFields / pickFields / omitFields
// ─────────────────────────────────────────────────────────────────────────────

describe("renameFields", () => {
  it("renames specified fields", () => {
    const result = renameFields({ firstName: "Alice", age: 30 }, { firstName: "name" });
    expect(result).toEqual({ name: "Alice", age: 30 });
  });

  it("leaves unrenamed fields intact", () => {
    expect(renameFields({ a: 1, b: 2 }, {})).toEqual({ a: 1, b: 2 });
  });
});

describe("pickFields", () => {
  it("picks only specified fields", () => {
    expect(pickFields({ a: 1, b: 2, c: 3 }, ["a", "c"])).toEqual({ a: 1, c: 3 });
  });

  it("ignores missing fields", () => {
    expect(pickFields({ a: 1 }, ["a", "z"])).toEqual({ a: 1 });
  });
});

describe("omitFields", () => {
  it("omits specified fields", () => {
    expect(omitFields({ a: 1, b: 2, c: 3 }, ["b"])).toEqual({ a: 1, c: 3 });
  });

  it("leaves other fields intact", () => {
    expect(omitFields({ a: 1 }, ["z"])).toEqual({ a: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// coerce
// ─────────────────────────────────────────────────────────────────────────────

describe("coerce — string", () => {
  it("converts number to string", () => expect(coerce(42, "string")).toBe("42"));
  it("converts null to empty string", () => expect(coerce(null, "string")).toBe(""));
  it("converts object to JSON", () => expect(coerce({ a: 1 }, "string")).toBe('{"a":1}'));
});

describe("coerce — number", () => {
  it("converts string to number", () => expect(coerce("42", "number")).toBe(42));
  it("converts null to 0", () => expect(coerce(null, "number")).toBe(0));
  it("converts NaN source to 0", () => expect(coerce("abc", "number")).toBe(0));
});

describe("coerce — boolean", () => {
  it("true for truthy values", () => expect(coerce(1, "boolean")).toBe(true));
  it("false for 'false' string", () => expect(coerce("false", "boolean")).toBe(false));
  it("false for null", () => expect(coerce(null, "boolean")).toBe(false));
  it("false for empty string", () => expect(coerce("", "boolean")).toBe(false));
});

describe("coerce — array", () => {
  it("passes through array", () => expect(coerce([1, 2], "array")).toEqual([1, 2]));
  it("wraps non-array in array", () => expect(coerce("hello", "array")).toEqual(["hello"]));
  it("returns empty array for null", () => expect(coerce(null, "array")).toEqual([]));
});

describe("coerce — object", () => {
  it("passes through object", () => expect(coerce({ a: 1 }, "object")).toEqual({ a: 1 }));
  it("parses JSON string", () => expect(coerce('{"x":1}', "object")).toEqual({ x: 1 }));
  it("returns empty object for invalid string", () => expect(coerce("not-json", "object")).toEqual({}));
});

describe("coerceRecord", () => {
  it("coerces specified fields", () => {
    const result = coerceRecord({ age: "30", active: "true" }, { age: "number", active: "boolean" });
    expect(result.age).toBe(30);
    expect(result.active).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// flattenObject / unflattenObject
// ─────────────────────────────────────────────────────────────────────────────

describe("flattenObject", () => {
  it("flattens nested object", () => {
    const flat = flattenObject({ a: { b: { c: 1 }, d: 2 }, e: 3 });
    expect(flat).toEqual({ "a.b.c": 1, "a.d": 2, e: 3 });
  });

  it("handles already flat object", () => {
    expect(flattenObject({ x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
  });

  it("handles prefix", () => {
    const flat = flattenObject({ a: 1 }, "root");
    expect(flat).toEqual({ "root.a": 1 });
  });
});

describe("unflattenObject", () => {
  it("unflattens to nested object", () => {
    const result = unflattenObject({ "a.b.c": 1, "a.d": 2, e: 3 });
    expect(result).toEqual({ a: { b: { c: 1 }, d: 2 }, e: 3 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// groupBy / indexBy / pluck / uniqueBy
// ─────────────────────────────────────────────────────────────────────────────

const PEOPLE = [
  { name: "Alice", dept: "eng", level: 3 },
  { name: "Bob", dept: "eng", level: 2 },
  { name: "Charlie", dept: "design", level: 4 },
];

describe("groupBy", () => {
  it("groups by field", () => {
    const groups = groupBy(PEOPLE, "dept");
    expect(groups["eng"]).toHaveLength(2);
    expect(groups["design"]).toHaveLength(1);
  });

  it("returns empty object for empty array", () => {
    expect(groupBy([], "dept")).toEqual({});
  });
});

describe("indexBy", () => {
  it("creates index by field", () => {
    const index = indexBy(PEOPLE, "name");
    expect(index["Alice"]).toEqual(PEOPLE[0]);
    expect(index["Charlie"]).toEqual(PEOPLE[2]);
  });
});

describe("pluck", () => {
  it("extracts field from each item", () => {
    expect(pluck(PEOPLE, "name")).toEqual(["Alice", "Bob", "Charlie"]);
  });
});

describe("uniqueBy", () => {
  it("deduplicates by field", () => {
    const data = [
      { id: 1, name: "Alice" },
      { id: 2, name: "Alice" },
      { id: 3, name: "Bob" },
    ];
    const unique = uniqueBy(data, "name");
    expect(unique).toHaveLength(2);
    expect(unique[0].id).toBe(1);
  });
});

describe("chunk", () => {
  it("splits into chunks", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("handles size larger than array", () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });
});

describe("zip", () => {
  it("zips two arrays", () => {
    expect(zip([1, 2, 3], ["a", "b", "c"])).toEqual([[1, "a"], [2, "b"], [3, "c"]]);
  });
  it("stops at shorter array", () => {
    expect(zip([1, 2, 3], ["a"])).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// pivot / unpivot
// ─────────────────────────────────────────────────────────────────────────────

describe("pivot", () => {
  it("converts rows to columns", () => {
    const result = pivot([{ name: "Alice", score: 90 }, { name: "Bob", score: 80 }]);
    expect(result.name).toEqual(["Alice", "Bob"]);
    expect(result.score).toEqual([90, 80]);
  });

  it("returns empty for empty input", () => {
    expect(pivot([])).toEqual({});
  });
});

describe("unpivot", () => {
  it("converts columns to rows", () => {
    const result = unpivot({ name: ["Alice", "Bob"], score: [90, 80] });
    expect(result).toEqual([{ name: "Alice", score: 90 }, { name: "Bob", score: 80 }]);
  });

  it("returns empty for empty columns", () => {
    expect(unpivot({})).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// interpolate
// ─────────────────────────────────────────────────────────────────────────────

describe("interpolate", () => {
  it("replaces single variable", () => {
    expect(interpolate("Hello {{name}}!", { name: "Alice" })).toBe("Hello Alice!");
  });

  it("replaces nested path", () => {
    expect(interpolate("{{user.name}}", { user: { name: "Bob" } })).toBe("Bob");
  });

  it("uses fallback for missing", () => {
    expect(interpolate("{{missing}}", {}, { fallback: "N/A" })).toBe("N/A");
  });

  it("replaces multiple occurrences", () => {
    expect(interpolate("{{a}} and {{a}}", { a: "X" })).toBe("X and X");
  });

  it("serializes objects", () => {
    expect(interpolate("{{obj}}", { obj: { x: 1 } })).toBe('{"x":1}');
  });

  it("strict mode throws for missing", () => {
    expect(() => interpolate("{{x}}", {}, { strict: true })).toThrow();
  });
});

describe("interpolateRecord", () => {
  it("interpolates string values in record", () => {
    const result = interpolateRecord(
      { greeting: "Hello {{name}}", count: 42 },
      { name: "Alice" }
    );
    expect(result.greeting).toBe("Hello Alice");
    expect(result.count).toBe(42);
  });
});

describe("extractTemplateVars", () => {
  it("extracts variable names", () => {
    const vars = extractTemplateVars("Hello {{name}}, you have {{count}} messages");
    expect(vars).toEqual(["name", "count"]);
  });

  it("deduplicates", () => {
    expect(extractTemplateVars("{{a}} {{a}} {{b}}")).toEqual(["a", "b"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deepMerge
// ─────────────────────────────────────────────────────────────────────────────

describe("deepMerge", () => {
  it("merges shallow fields", () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 });
  });

  it("deep merges nested objects", () => {
    const result = deepMerge({ config: { host: "localhost", port: 80 } }, { config: { port: 443 } });
    expect(result).toEqual({ config: { host: "localhost", port: 443 } });
  });

  it("overrides array (not deep-merges)", () => {
    const result = deepMerge({ arr: [1, 2, 3] }, { arr: [4, 5] });
    expect(result.arr).toEqual([4, 5]);
  });

  it("does not mutate base", () => {
    const base = { a: { x: 1 } };
    deepMerge(base, { a: { y: 2 } });
    expect((base.a as Record<string, unknown>).y).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createPipeline
// ─────────────────────────────────────────────────────────────────────────────

describe("createPipeline", () => {
  it("applies steps in order", () => {
    const pipe = createPipeline(
      (obj) => ({ ...obj, a: (obj.a as number) + 1 }),
      (obj) => ({ ...obj, a: (obj.a as number) * 2 }),
    );
    expect(pipe({ a: 3 })).toEqual({ a: 8 }); // (3+1)*2
  });

  it("works with empty pipeline", () => {
    const pipe = createPipeline();
    expect(pipe({ x: 1 })).toEqual({ x: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// listPaths / hasAllPaths / deepClone
// ─────────────────────────────────────────────────────────────────────────────

describe("listPaths", () => {
  it("lists leaf paths", () => {
    const paths = listPaths({ a: 1, b: { c: 2, d: 3 } });
    expect(paths).toContain("a");
    expect(paths).toContain("b.c");
    expect(paths).toContain("b.d");
  });

  it("handles arrays", () => {
    const paths = listPaths({ arr: [1, 2] });
    expect(paths).toContain("arr.0");
    expect(paths).toContain("arr.1");
  });
});

describe("hasAllPaths", () => {
  it("true when all paths exist", () => {
    expect(hasAllPaths({ a: 1, b: { c: 2 } }, ["a", "b.c"])).toBe(true);
  });
  it("false when any path missing", () => {
    expect(hasAllPaths({ a: 1 }, ["a", "z"])).toBe(false);
  });
});

describe("deepClone", () => {
  it("clones object deeply", () => {
    const obj = { a: { b: [1, 2, 3] } };
    const clone = deepClone(obj);
    clone.a.b.push(4);
    expect(obj.a.b).toHaveLength(3);
  });

  it("clones primitives", () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone("hello")).toBe("hello");
    expect(deepClone(null)).toBeNull();
  });
});
