import { describe, it, expect } from "vitest";
import { resolveTemplate, resolveObjectTemplates, extractReferences } from "./template-resolver";

describe("Template Resolver", () => {
  describe("resolveTemplate", () => {
    it("should resolve simple variable", () => {
      const result = resolveTemplate("Hello {{name}}", { name: "World" });
      expect(result).toBe("Hello World");
    });

    it("should resolve nested property", () => {
      const result = resolveTemplate("Status: {{response.status}}", {
        response: { status: 200 },
      });
      expect(result).toBe("Status: 200");
    });

    it("should return original string when no templates", () => {
      expect(resolveTemplate("plain text", {})).toBe("plain text");
    });

    it("should handle missing variables gracefully", () => {
      const result = resolveTemplate("{{missing}}", {});
      expect(result).toBe("");
    });

    it("should handle empty string", () => {
      expect(resolveTemplate("", {})).toBe("");
    });

    it("should resolve multiple templates", () => {
      const result = resolveTemplate("{{first}} and {{second}}", {
        first: "A",
        second: "B",
      });
      expect(result).toBe("A and B");
    });

    it("should not escape HTML by default", () => {
      const result = resolveTemplate("{{html}}", {
        html: "<b>bold</b>",
      });
      expect(result).toBe("<b>bold</b>");
    });

    it("should handle invalid template syntax", () => {
      const result = resolveTemplate("{{#invalid", {});
      expect(result).toBe("{{#invalid");
    });
  });

  describe("resolveObjectTemplates", () => {
    it("should resolve all string values in object", () => {
      const result = resolveObjectTemplates(
        {
          message: "Hello {{name}}",
          subject: "From {{sender}}",
          count: 42,
        },
        { name: "Alice", sender: "Bob" },
      );
      expect(result.message).toBe("Hello Alice");
      expect(result.subject).toBe("From Bob");
      expect(result.count).toBe(42);
    });

    it("should resolve nested objects", () => {
      const result = resolveObjectTemplates(
        {
          outer: {
            inner: "{{value}}",
          },
        },
        { value: "resolved" },
      );
      expect((result.outer as any).inner).toBe("resolved");
    });

    it("should preserve non-string values", () => {
      const result = resolveObjectTemplates(
        {
          num: 42,
          bool: true,
          arr: [1, 2, 3],
          nil: null,
        },
        {},
      );
      expect(result.num).toBe(42);
      expect(result.bool).toBe(true);
      expect(result.arr).toEqual([1, 2, 3]);
      expect(result.nil).toBeNull();
    });
  });

  describe("extractReferences", () => {
    it("should extract simple references", () => {
      const refs = extractReferences("{{name}}");
      expect(refs).toEqual(["name"]);
    });

    it("should extract top-level from nested refs", () => {
      const refs = extractReferences("{{response.data.value}}");
      expect(refs).toEqual(["response"]);
    });

    it("should extract multiple unique refs", () => {
      const refs = extractReferences("{{a}} and {{b}} and {{a.x}}");
      expect(refs).toContain("a");
      expect(refs).toContain("b");
      expect(refs.length).toBe(2); // 'a' appears once due to Set
    });

    it("should return empty for no templates", () => {
      expect(extractReferences("plain text")).toEqual([]);
    });

    it("should handle empty string", () => {
      expect(extractReferences("")).toEqual([]);
    });
  });
});
