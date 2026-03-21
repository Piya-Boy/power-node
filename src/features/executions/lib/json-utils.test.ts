import { describe, it, expect } from "vitest";
import {
  safeJsonParse,
  safeJsonStringify,
  deepClone,
  isPlainObject,
  detectType,
  validateType,
  flattenJson,
  deepEqual,
  getLeafPaths,
  selectPaths,
} from "./json-utils";

describe("JSON Utilities", () => {
  describe("safeJsonParse", () => {
    it("should parse valid JSON", () => {
      expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
      expect(safeJsonParse("[1,2,3]")).toEqual([1, 2, 3]);
    });

    it("should return null for invalid JSON", () => {
      expect(safeJsonParse("invalid")).toBeNull();
      expect(safeJsonParse("")).toBeNull();
    });
  });

  describe("safeJsonStringify", () => {
    it("should stringify values", () => {
      expect(safeJsonStringify({ a: 1 })).toBe('{"a":1}');
    });

    it("should support indent", () => {
      const result = safeJsonStringify({ a: 1 }, 2);
      expect(result).toContain("\n");
    });

    it("should return null for circular references", () => {
      const obj: Record<string, unknown> = {};
      obj.self = obj;
      expect(safeJsonStringify(obj)).toBeNull();
    });
  });

  describe("deepClone", () => {
    it("should clone objects", () => {
      const obj = { a: { b: 1 } };
      const clone = deepClone(obj);
      expect(clone).toEqual(obj);
      expect(clone).not.toBe(obj);
      expect(clone.a).not.toBe(obj.a);
    });

    it("should clone arrays", () => {
      const arr = [1, [2, 3]];
      const clone = deepClone(arr);
      expect(clone).toEqual(arr);
      expect(clone).not.toBe(arr);
    });

    it("should handle primitives", () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone("hello")).toBe("hello");
      expect(deepClone(null)).toBeNull();
    });
  });

  describe("isPlainObject", () => {
    it("should return true for plain objects", () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1 })).toBe(true);
    });

    it("should return false for arrays", () => {
      expect(isPlainObject([])).toBe(false);
    });

    it("should return false for null", () => {
      expect(isPlainObject(null)).toBe(false);
    });

    it("should return false for primitives", () => {
      expect(isPlainObject("string")).toBe(false);
      expect(isPlainObject(42)).toBe(false);
    });
  });

  describe("detectType", () => {
    it("should detect types correctly", () => {
      expect(detectType(null)).toBe("null");
      expect(detectType([])).toBe("array");
      expect(detectType({})).toBe("object");
      expect(detectType("str")).toBe("string");
      expect(detectType(42)).toBe("number");
      expect(detectType(true)).toBe("boolean");
    });
  });

  describe("validateType", () => {
    it("should validate matching types", () => {
      expect(validateType("str", "string")).toBe(true);
      expect(validateType([], "array")).toBe(true);
      expect(validateType(null, "null")).toBe(true);
    });

    it("should reject mismatched types", () => {
      expect(validateType(42, "string")).toBe(false);
      expect(validateType(null, "object")).toBe(false);
    });

    it("should accept any for any type", () => {
      expect(validateType(42, "any")).toBe(true);
      expect(validateType(null, "any")).toBe(true);
    });
  });

  describe("flattenJson", () => {
    it("should flatten nested objects", () => {
      const result = flattenJson({ a: { b: 1, c: 2 } });
      expect(result["a.b"]).toBe(1);
      expect(result["a.c"]).toBe(2);
    });

    it("should keep arrays", () => {
      const result = flattenJson({ items: [1, 2] });
      expect(result.items).toEqual([1, 2]);
    });

    it("should handle flat objects", () => {
      const result = flattenJson({ a: 1, b: "two" });
      expect(result.a).toBe(1);
      expect(result.b).toBe("two");
    });
  });

  describe("deepEqual", () => {
    it("should return true for equal primitives", () => {
      expect(deepEqual(1, 1)).toBe(true);
      expect(deepEqual("a", "a")).toBe(true);
    });

    it("should return false for unequal values", () => {
      expect(deepEqual(1, 2)).toBe(false);
      expect(deepEqual("a", "b")).toBe(false);
    });

    it("should compare nested objects", () => {
      expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
      expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it("should compare arrays", () => {
      expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    });

    it("should handle null", () => {
      expect(deepEqual(null, null)).toBe(true);
      expect(deepEqual(null, {})).toBe(false);
    });

    it("should detect extra keys", () => {
      expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    });
  });

  describe("getLeafPaths", () => {
    it("should get leaf paths", () => {
      const paths = getLeafPaths({ a: { b: 1, c: 2 } });
      expect(paths).toContain("a.b");
      expect(paths).toContain("a.c");
    });

    it("should handle flat objects", () => {
      const paths = getLeafPaths({ x: 1, y: 2 });
      expect(paths).toEqual(["x", "y"]);
    });

    it("should include arrays as leaf", () => {
      const paths = getLeafPaths({ items: [1, 2, 3] });
      expect(paths).toContain("items");
    });
  });

  describe("selectPaths", () => {
    it("should select specified paths", () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = selectPaths(obj, ["a", "c"]);
      expect(result.a).toBe(1);
      expect(result.c).toBe(3);
      expect(result.b).toBeUndefined();
    });

    it("should handle missing paths gracefully", () => {
      const result = selectPaths({ a: 1 }, ["missing"]);
      expect(result.missing).toBeUndefined();
    });
  });
});
