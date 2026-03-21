import { describe, it, expect } from "vitest";
import {
  parseExpression,
  segmentsToString,
  getAvailableVariables,
  filterSuggestions,
  validateExpression,
} from "./expression-parser";

describe("Expression Parser", () => {
  describe("parseExpression", () => {
    it("should parse plain text", () => {
      const segments = parseExpression("Hello world");
      expect(segments).toEqual([{ type: "text", value: "Hello world" }]);
    });

    it("should parse single variable", () => {
      const segments = parseExpression("{{name}}");
      expect(segments).toEqual([
        { type: "variable", value: "name", path: ["name"] },
      ]);
    });

    it("should parse mixed text and variables", () => {
      const segments = parseExpression("Hello {{name}}, welcome!");
      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({ type: "text", value: "Hello " });
      expect(segments[1]).toEqual({ type: "variable", value: "name", path: ["name"] });
      expect(segments[2]).toEqual({ type: "text", value: ", welcome!" });
    });

    it("should parse nested paths", () => {
      const segments = parseExpression("{{user.profile.name}}");
      expect(segments[0]).toEqual({
        type: "variable",
        value: "user.profile.name",
        path: ["user", "profile", "name"],
      });
    });

    it("should handle multiple variables", () => {
      const segments = parseExpression("{{a}} and {{b}}");
      expect(segments).toHaveLength(3);
      expect(segments[0].type).toBe("variable");
      expect(segments[1].type).toBe("text");
      expect(segments[2].type).toBe("variable");
    });

    it("should handle empty string", () => {
      expect(parseExpression("")).toEqual([]);
    });

    it("should trim variable names", () => {
      const segments = parseExpression("{{ name }}");
      expect(segments[0]).toEqual({
        type: "variable",
        value: "name",
        path: ["name"],
      });
    });
  });

  describe("segmentsToString", () => {
    it("should reconstruct template from segments", () => {
      const segments = parseExpression("Hello {{name}}, age: {{age}}");
      expect(segmentsToString(segments)).toBe("Hello {{name}}, age: {{age}}");
    });

    it("should handle plain text", () => {
      expect(segmentsToString([{ type: "text", value: "hello" }])).toBe("hello");
    });

    it("should handle empty segments", () => {
      expect(segmentsToString([])).toBe("");
    });
  });

  describe("getAvailableVariables", () => {
    it("should list top-level keys", () => {
      const vars = getAvailableVariables({ name: "Alice", age: 30 });
      expect(vars).toContain("name");
      expect(vars).toContain("age");
    });

    it("should list nested keys with dot notation", () => {
      const vars = getAvailableVariables({
        user: { name: "Alice", email: "a@b.com" },
      });
      expect(vars).toContain("user");
      expect(vars).toContain("user.name");
      expect(vars).toContain("user.email");
    });

    it("should handle empty context", () => {
      expect(getAvailableVariables({})).toEqual([]);
    });

    it("should not recurse into arrays", () => {
      const vars = getAvailableVariables({ items: [1, 2, 3] });
      expect(vars).toEqual(["items"]);
    });
  });

  describe("filterSuggestions", () => {
    const available = ["name", "user.name", "user.email", "order.id", "order.total"];

    it("should filter by partial match", () => {
      const result = filterSuggestions(available, "name");
      expect(result).toContain("name");
      expect(result).toContain("user.name");
      expect(result).not.toContain("order.id");
    });

    it("should be case insensitive", () => {
      const result = filterSuggestions(available, "NAME");
      expect(result).toContain("name");
    });

    it("should return first 20 for empty input", () => {
      const result = filterSuggestions(available, "");
      expect(result.length).toBeLessThanOrEqual(20);
    });

    it("should limit results to 20", () => {
      const many = Array.from({ length: 50 }, (_, i) => `var_${i}`);
      const result = filterSuggestions(many, "var");
      expect(result.length).toBe(20);
    });
  });

  describe("validateExpression", () => {
    it("should validate all variables exist", () => {
      const result = validateExpression("{{name}} {{age}}", ["name", "age"]);
      expect(result.valid).toBe(true);
      expect(result.unknownVars).toHaveLength(0);
    });

    it("should detect unknown variables", () => {
      const result = validateExpression("{{unknown}}", ["name"]);
      expect(result.valid).toBe(false);
      expect(result.unknownVars).toContain("unknown");
    });

    it("should accept nested paths if root exists", () => {
      const result = validateExpression("{{user.name}}", ["user", "user.name"]);
      expect(result.valid).toBe(true);
    });

    it("should accept nested paths if parent path exists", () => {
      const result = validateExpression("{{user.deep.value}}", ["user.deep"]);
      expect(result.valid).toBe(true);
    });

    it("should handle plain text without variables", () => {
      const result = validateExpression("plain text", []);
      expect(result.valid).toBe(true);
    });
  });
});
