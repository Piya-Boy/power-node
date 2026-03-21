import { describe, it, expect } from "vitest";
import {
  getNestedValue,
  setNestedValue,
  flattenObject,
  pickKeys,
  omitKeys,
  deepMerge,
} from "./data-utils";

describe("Data Utilities", () => {
  describe("getNestedValue", () => {
    it("should get top-level value", () => {
      expect(getNestedValue({ a: 1 }, "a")).toBe(1);
    });

    it("should get nested value", () => {
      expect(getNestedValue({ a: { b: { c: 42 } } }, "a.b.c")).toBe(42);
    });

    it("should return undefined for missing path", () => {
      expect(getNestedValue({ a: 1 }, "b")).toBeUndefined();
    });

    it("should return undefined for null intermediate", () => {
      expect(getNestedValue({ a: null } as any, "a.b")).toBeUndefined();
    });

    it("should handle array index notation", () => {
      expect(getNestedValue({ items: [10, 20, 30] }, "items[1]")).toBe(20);
    });

    it("should handle nested array access", () => {
      expect(getNestedValue({ a: { items: ["x", "y"] } }, "a.items[0]")).toBe("x");
    });

    it("should return undefined for non-array with index", () => {
      expect(getNestedValue({ a: "string" }, "a[0]")).toBeUndefined();
    });
  });

  describe("setNestedValue", () => {
    it("should set top-level value", () => {
      expect(setNestedValue({}, "a", 1)).toEqual({ a: 1 });
    });

    it("should set nested value", () => {
      expect(setNestedValue({}, "a.b.c", 42)).toEqual({ a: { b: { c: 42 } } });
    });

    it("should not mutate original object", () => {
      const original = { a: { b: 1 } };
      const result = setNestedValue(original, "a.b", 2);
      expect(original.a.b).toBe(1);
      expect(result.a).not.toBe(original.a);
    });

    it("should preserve existing values", () => {
      const result = setNestedValue({ a: { b: 1, c: 2 } }, "a.b", 10);
      expect(result).toEqual({ a: { b: 10, c: 2 } });
    });
  });

  describe("flattenObject", () => {
    it("should flatten nested object", () => {
      expect(flattenObject({ a: { b: 1, c: 2 } })).toEqual({
        "a.b": 1,
        "a.c": 2,
      });
    });

    it("should handle deeply nested", () => {
      expect(flattenObject({ a: { b: { c: 42 } } })).toEqual({
        "a.b.c": 42,
      });
    });

    it("should preserve arrays as values", () => {
      const result = flattenObject({ a: [1, 2, 3] });
      expect(result.a).toEqual([1, 2, 3]);
    });

    it("should handle flat object", () => {
      expect(flattenObject({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    });

    it("should handle empty object", () => {
      expect(flattenObject({})).toEqual({});
    });
  });

  describe("pickKeys", () => {
    it("should pick specified keys", () => {
      expect(pickKeys({ a: 1, b: 2, c: 3 }, ["a", "c"])).toEqual({ a: 1, c: 3 });
    });

    it("should ignore missing keys", () => {
      expect(pickKeys({ a: 1 }, ["a", "b"])).toEqual({ a: 1 });
    });

    it("should support dot notation for nested access", () => {
      const obj = { user: { name: "Alice", age: 30 } };
      const result = pickKeys(obj, ["user.name"]);
      expect(result["user.name"]).toBe("Alice");
    });
  });

  describe("omitKeys", () => {
    it("should omit specified keys", () => {
      expect(omitKeys({ a: 1, b: 2, c: 3 }, ["b"])).toEqual({ a: 1, c: 3 });
    });

    it("should handle omitting non-existent keys", () => {
      expect(omitKeys({ a: 1 }, ["x"])).toEqual({ a: 1 });
    });

    it("should return empty for omitting all keys", () => {
      expect(omitKeys({ a: 1 }, ["a"])).toEqual({});
    });
  });

  describe("deepMerge", () => {
    it("should merge flat objects", () => {
      expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
    });

    it("should deep merge nested objects", () => {
      const result = deepMerge(
        { a: { b: 1, c: 2 } },
        { a: { b: 10, d: 4 } },
      );
      expect(result).toEqual({ a: { b: 10, c: 2, d: 4 } });
    });

    it("should override non-object values", () => {
      expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
    });

    it("should override with arrays (no merge)", () => {
      expect(deepMerge({ a: [1, 2] }, { a: [3, 4] })).toEqual({ a: [3, 4] });
    });

    it("should not mutate originals", () => {
      const target = { a: { b: 1 } };
      const source = { a: { c: 2 } };
      deepMerge(target, source);
      expect(target).toEqual({ a: { b: 1 } });
    });
  });
});
