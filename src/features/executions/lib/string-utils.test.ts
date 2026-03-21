import { describe, it, expect } from "vitest";
import {
  toCase,
  truncate,
  slugify,
  countWords,
  extractNumbers,
  interpolate,
  isValidEmail,
  isValidUrl,
  escapeHtml,
  stripHtml,
  randomString,
} from "./string-utils";

describe("String Utilities", () => {
  describe("toCase", () => {
    it("should convert to camelCase", () => {
      expect(toCase("hello world", "camel")).toBe("helloWorld");
      expect(toCase("my-variable", "camel")).toBe("myVariable");
      expect(toCase("MY_CONST", "camel")).toBe("myConst");
    });

    it("should convert to PascalCase", () => {
      expect(toCase("hello world", "pascal")).toBe("HelloWorld");
    });

    it("should convert to snake_case", () => {
      expect(toCase("helloWorld", "snake")).toBe("hello_world");
      expect(toCase("Hello World", "snake")).toBe("hello_world");
    });

    it("should convert to kebab-case", () => {
      expect(toCase("helloWorld", "kebab")).toBe("hello-world");
    });

    it("should convert to UPPER", () => {
      expect(toCase("hello", "upper")).toBe("HELLO");
    });

    it("should convert to lower", () => {
      expect(toCase("HELLO", "lower")).toBe("hello");
    });

    it("should convert to Title Case", () => {
      expect(toCase("hello world", "title")).toBe("Hello World");
    });
  });

  describe("truncate", () => {
    it("should not truncate short strings", () => {
      expect(truncate("short", 10)).toBe("short");
    });

    it("should truncate long strings with default suffix", () => {
      expect(truncate("hello world", 8)).toBe("hello...");
    });

    it("should use custom suffix", () => {
      expect(truncate("hello world", 7, " →")).toBe("hello →");
    });

    it("should handle exact length", () => {
      expect(truncate("hello", 5)).toBe("hello");
    });
  });

  describe("slugify", () => {
    it("should create URL-safe slugs", () => {
      expect(slugify("Hello World!")).toBe("hello-world");
    });

    it("should handle multiple spaces", () => {
      expect(slugify("hello   world")).toBe("hello-world");
    });

    it("should handle special characters", () => {
      expect(slugify("C++ Programming")).toBe("c-programming");
    });
  });

  describe("countWords", () => {
    it("should count words", () => {
      expect(countWords("hello world foo")).toBe(3);
    });

    it("should handle extra whitespace", () => {
      expect(countWords("  hello   world  ")).toBe(2);
    });

    it("should return 0 for empty string", () => {
      expect(countWords("")).toBe(0);
    });
  });

  describe("extractNumbers", () => {
    it("should extract numbers from string", () => {
      expect(extractNumbers("There are 3 cats and 2 dogs")).toEqual([3, 2]);
    });

    it("should handle decimals", () => {
      expect(extractNumbers("Price: 9.99")).toEqual([9.99]);
    });

    it("should handle negative numbers", () => {
      expect(extractNumbers("temp is -5 degrees")).toEqual([-5]);
    });

    it("should return empty array for no numbers", () => {
      expect(extractNumbers("no numbers here")).toEqual([]);
    });
  });

  describe("interpolate", () => {
    it("should interpolate values", () => {
      expect(interpolate("Hello ${name}!", { name: "Alice" })).toBe("Hello Alice!");
    });

    it("should handle missing values", () => {
      expect(interpolate("Hello ${name}!", {})).toBe("Hello !");
    });

    it("should handle multiple values", () => {
      expect(interpolate("${a} + ${b} = ${c}", { a: 1, b: 2, c: 3 })).toBe("1 + 2 = 3");
    });
  });

  describe("isValidEmail", () => {
    it("should accept valid emails", () => {
      expect(isValidEmail("user@example.com")).toBe(true);
      expect(isValidEmail("user+tag@domain.co")).toBe(true);
    });

    it("should reject invalid emails", () => {
      expect(isValidEmail("not-an-email")).toBe(false);
      expect(isValidEmail("@no-user.com")).toBe(false);
      expect(isValidEmail("no-at-sign.com")).toBe(false);
    });
  });

  describe("isValidUrl", () => {
    it("should accept valid URLs", () => {
      expect(isValidUrl("https://example.com")).toBe(true);
      expect(isValidUrl("http://localhost:3000/path?q=1")).toBe(true);
    });

    it("should reject invalid URLs", () => {
      expect(isValidUrl("not a url")).toBe(false);
      expect(isValidUrl("")).toBe(false);
    });
  });

  describe("escapeHtml", () => {
    it("should escape HTML entities", () => {
      expect(escapeHtml("<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
      expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
      expect(escapeHtml("a & b")).toBe("a &amp; b");
    });
  });

  describe("stripHtml", () => {
    it("should strip HTML tags", () => {
      expect(stripHtml("<b>bold</b>")).toBe("bold");
      expect(stripHtml("<p>Hello <em>world</em></p>")).toBe("Hello world");
    });

    it("should handle plain text", () => {
      expect(stripHtml("plain text")).toBe("plain text");
    });
  });

  describe("randomString", () => {
    it("should generate string of correct length", () => {
      expect(randomString(10).length).toBe(10);
      expect(randomString(32).length).toBe(32);
    });

    it("should generate unique strings", () => {
      const strs = new Set(Array.from({ length: 20 }, () => randomString(16)));
      expect(strs.size).toBe(20);
    });

    it("should use hex charset", () => {
      const str = randomString(20, "hex");
      expect(/^[0-9a-f]+$/.test(str)).toBe(true);
    });

    it("should use numeric charset", () => {
      const str = randomString(10, "numeric");
      expect(/^[0-9]+$/.test(str)).toBe(true);
    });
  });
});
