import { describe, it, expect } from "vitest";
import { groupBy, removeDuplicates, sortBy, aggregate, chunk, flatten, filterBy, zip } from "./array-utils";

describe("Array Utilities", () => {
  describe("groupBy", () => {
    it("should group items by key", () => {
      const items = [
        { type: "a", value: 1 },
        { type: "b", value: 2 },
        { type: "a", value: 3 },
      ];
      const result = groupBy(items, "type");
      expect(result.a.length).toBe(2);
      expect(result.b.length).toBe(1);
    });

    it("should group items with undefined key as __unknown__", () => {
      const items = [{ value: 1 }];
      const result = groupBy(items, "missing");
      expect(result.__unknown__).toHaveLength(1);
    });
  });

  describe("removeDuplicates", () => {
    it("should remove duplicate primitives", () => {
      const result = removeDuplicates([1, 2, 2, 3, 3, 3]);
      expect(result).toEqual([1, 2, 3]);
    });

    it("should remove duplicate objects by key", () => {
      const items = [
        { id: 1, name: "a" },
        { id: 2, name: "b" },
        { id: 1, name: "c" },
      ];
      expect(removeDuplicates(items, "id")).toHaveLength(2);
    });

    it("should handle empty array", () => {
      expect(removeDuplicates([])).toEqual([]);
    });
  });

  describe("sortBy", () => {
    const items = [
      { name: "Charlie", age: 30 },
      { name: "Alice", age: 25 },
      { name: "Bob", age: 35 },
    ];

    it("should sort strings ascending", () => {
      const result = sortBy(items, "name");
      expect(result[0].name).toBe("Alice");
      expect(result[2].name).toBe("Charlie");
    });

    it("should sort strings descending", () => {
      const result = sortBy(items, "name", "desc");
      expect(result[0].name).toBe("Charlie");
    });

    it("should sort numbers ascending", () => {
      const result = sortBy(items, "age");
      expect(result[0].age).toBe(25);
      expect(result[2].age).toBe(35);
    });

    it("should not mutate original", () => {
      const original = [...items];
      sortBy(items, "name");
      expect(items[0].name).toBe(original[0].name);
    });
  });

  describe("aggregate", () => {
    const items = [{ v: 10 }, { v: 20 }, { v: 30 }];

    it("should compute sum", () => {
      expect(aggregate(items, "v", "sum")).toBe(60);
    });

    it("should compute avg", () => {
      expect(aggregate(items, "v", "avg")).toBeCloseTo(20);
    });

    it("should compute min", () => {
      expect(aggregate(items, "v", "min")).toBe(10);
    });

    it("should compute max", () => {
      expect(aggregate(items, "v", "max")).toBe(30);
    });

    it("should compute count", () => {
      expect(aggregate(items, "v", "count")).toBe(3);
    });

    it("should return 0 for empty array", () => {
      expect(aggregate([], "v", "sum")).toBe(0);
    });

    it("should skip non-numeric values", () => {
      const mixed = [{ v: 10 }, { v: "abc" }, { v: 20 }];
      expect(aggregate(mixed, "v", "sum")).toBe(30);
    });
  });

  describe("chunk", () => {
    it("should split into chunks", () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it("should handle chunk size larger than array", () => {
      expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
    });

    it("should return empty for size 0", () => {
      expect(chunk([1, 2], 0)).toEqual([]);
    });
  });

  describe("flatten", () => {
    it("should flatten one level", () => {
      expect(flatten([[1, 2], [3, 4]])).toEqual([1, 2, 3, 4]);
    });

    it("should handle mixed array", () => {
      expect(flatten([1, [2, 3], 4])).toEqual([1, 2, 3, 4]);
    });

    it("should handle empty arrays", () => {
      expect(flatten([[], []])).toEqual([]);
    });
  });

  describe("filterBy", () => {
    const items = [
      { name: "Alice", age: 25, city: "NYC" },
      { name: "Bob", age: 30, city: "LA" },
      { name: "Charlie", age: 25, city: "NYC" },
    ];

    it("should filter by eq condition", () => {
      const result = filterBy(items, [{ field: "age", operator: "eq", value: 25 }]);
      expect(result).toHaveLength(2);
    });

    it("should filter by gt condition", () => {
      const result = filterBy(items, [{ field: "age", operator: "gt", value: 25 }]);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Bob");
    });

    it("should apply multiple conditions (AND)", () => {
      const result = filterBy(items, [
        { field: "age", operator: "eq", value: 25 },
        { field: "city", operator: "eq", value: "NYC" },
      ]);
      expect(result).toHaveLength(2);
    });

    it("should filter by contains", () => {
      const result = filterBy(items, [{ field: "name", operator: "contains", value: "li" }]);
      expect(result.some((i) => i.name === "Alice")).toBe(true);
      expect(result.some((i) => i.name === "Charlie")).toBe(true);
    });

    it("should filter by starts_with", () => {
      const result = filterBy(items, [{ field: "name", operator: "starts_with", value: "A" }]);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Alice");
    });
  });

  describe("zip", () => {
    it("should zip two arrays", () => {
      expect(zip([1, 2, 3], ["a", "b", "c"])).toEqual([[1, "a"], [2, "b"], [3, "c"]]);
    });

    it("should stop at shorter array", () => {
      expect(zip([1, 2, 3], ["a", "b"])).toEqual([[1, "a"], [2, "b"]]);
    });

    it("should handle empty arrays", () => {
      expect(zip([], [])).toEqual([]);
    });
  });
});
