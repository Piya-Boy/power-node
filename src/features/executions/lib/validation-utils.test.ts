import { describe, it, expect } from "vitest";
import {
  validate,
  required,
  minLength,
  maxLength,
  pattern,
  minValue,
  maxValue,
  isEmail,
  isUrl,
  isCuid,
  validateObject,
  combineResults,
  sanitizeString,
  type ValidationRule,
} from "./validation-utils";

describe("validate", () => {
  it("should pass when all rules pass", () => {
    const rules: ValidationRule<string>[] = [
      minLength(3),
      maxLength(10),
    ];
    const result = validate("hello", rules);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should fail when one rule fails", () => {
    const rules: ValidationRule<string>[] = [
      minLength(3),
      maxLength(5),
    ];
    const result = validate("toolongstring", rules);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it("should fail with multiple errors when multiple rules fail", () => {
    const rules: ValidationRule<string>[] = [
      minLength(5),
      pattern(/^\d+$/, "Must be numeric"),
    ];
    const result = validate("ab", rules);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  it("should return error messages from failing rules", () => {
    const rule: ValidationRule<string> = {
      validate: () => false,
      message: "Custom error message",
    };
    const result = validate("anything", [rule]);
    expect(result.errors[0]).toBe("Custom error message");
  });
});

describe("required", () => {
  it("should return false for null", () => {
    expect(required(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(required(undefined)).toBe(false);
  });

  it("should return false for empty string", () => {
    expect(required("")).toBe(false);
  });

  it("should return false for whitespace-only string", () => {
    expect(required("   ")).toBe(false);
  });

  it("should return true for a non-empty string", () => {
    expect(required("hello")).toBe(true);
  });

  it("should return true for zero (0)", () => {
    expect(required(0)).toBe(true);
  });

  it("should return true for false boolean", () => {
    expect(required(false)).toBe(true);
  });

  it("should return true for an object", () => {
    expect(required({})).toBe(true);
  });
});

describe("minLength", () => {
  it("should pass when string equals min length", () => {
    const rule = minLength(3);
    expect(rule.validate("abc")).toBe(true);
  });

  it("should pass when string exceeds min length", () => {
    const rule = minLength(3);
    expect(rule.validate("abcdef")).toBe(true);
  });

  it("should fail when string is shorter than min", () => {
    const rule = minLength(3);
    expect(rule.validate("ab")).toBe(false);
  });

  it("should fail for empty string with minLength(1)", () => {
    const rule = minLength(1);
    expect(rule.validate("")).toBe(false);
  });

  it("should include min in error message", () => {
    const rule = minLength(5);
    expect(rule.message).toContain("5");
  });
});

describe("maxLength", () => {
  it("should pass when string equals max length", () => {
    const rule = maxLength(5);
    expect(rule.validate("abcde")).toBe(true);
  });

  it("should pass when string is shorter than max", () => {
    const rule = maxLength(10);
    expect(rule.validate("hello")).toBe(true);
  });

  it("should fail when string exceeds max", () => {
    const rule = maxLength(3);
    expect(rule.validate("toolong")).toBe(false);
  });

  it("should include max in error message", () => {
    const rule = maxLength(100);
    expect(rule.message).toContain("100");
  });
});

describe("pattern", () => {
  it("should pass when string matches pattern", () => {
    const rule = pattern(/^\d{4}$/, "Must be 4 digits");
    expect(rule.validate("1234")).toBe(true);
  });

  it("should fail when string does not match pattern", () => {
    const rule = pattern(/^\d{4}$/, "Must be 4 digits");
    expect(rule.validate("abcd")).toBe(false);
  });

  it("should use the provided message", () => {
    const rule = pattern(/abc/, "Custom message here");
    expect(rule.message).toBe("Custom message here");
  });
});

describe("minValue", () => {
  it("should pass when value equals min", () => {
    const rule = minValue(0);
    expect(rule.validate(0)).toBe(true);
  });

  it("should pass when value exceeds min", () => {
    const rule = minValue(5);
    expect(rule.validate(10)).toBe(true);
  });

  it("should fail when value is below min", () => {
    const rule = minValue(10);
    expect(rule.validate(9)).toBe(false);
  });

  it("should include min in error message", () => {
    const rule = minValue(42);
    expect(rule.message).toContain("42");
  });
});

describe("maxValue", () => {
  it("should pass when value equals max", () => {
    const rule = maxValue(100);
    expect(rule.validate(100)).toBe(true);
  });

  it("should pass when value is below max", () => {
    const rule = maxValue(100);
    expect(rule.validate(50)).toBe(true);
  });

  it("should fail when value exceeds max", () => {
    const rule = maxValue(100);
    expect(rule.validate(101)).toBe(false);
  });

  it("should include max in error message", () => {
    const rule = maxValue(99);
    expect(rule.message).toContain("99");
  });
});

describe("isEmail", () => {
  it("should return true for valid email", () => {
    expect(isEmail("user@example.com")).toBe(true);
  });

  it("should return true for email with subdomain", () => {
    expect(isEmail("user@mail.example.co.uk")).toBe(true);
  });

  it("should return true for email with plus sign", () => {
    expect(isEmail("user+tag@example.com")).toBe(true);
  });

  it("should return false for missing @", () => {
    expect(isEmail("userexample.com")).toBe(false);
  });

  it("should return false for missing domain", () => {
    expect(isEmail("user@")).toBe(false);
  });

  it("should return false for missing TLD", () => {
    expect(isEmail("user@example")).toBe(false);
  });

  it("should return false for empty string", () => {
    expect(isEmail("")).toBe(false);
  });

  it("should return false for email with spaces", () => {
    expect(isEmail("user @example.com")).toBe(false);
  });
});

describe("isUrl", () => {
  it("should return true for http URL", () => {
    expect(isUrl("http://example.com")).toBe(true);
  });

  it("should return true for https URL", () => {
    expect(isUrl("https://example.com/path?q=1")).toBe(true);
  });

  it("should return false for ftp URL", () => {
    expect(isUrl("ftp://example.com")).toBe(false);
  });

  it("should return false for plain string", () => {
    expect(isUrl("not a url")).toBe(false);
  });

  it("should return false for empty string", () => {
    expect(isUrl("")).toBe(false);
  });

  it("should return false for URL without protocol", () => {
    expect(isUrl("example.com")).toBe(false);
  });
});

describe("isCuid", () => {
  it("should return true for a valid cuid2 (20 chars, starts with letter)", () => {
    expect(isCuid("clh9p7k2n0000qzrmn9w")).toBe(true);
  });

  it("should return true for a 25 character cuid", () => {
    expect(isCuid("clh9p7k2n0000qzrmn9w12345")).toBe(true);
  });

  it("should return false for string shorter than 20 chars", () => {
    expect(isCuid("clh9p7k2n")).toBe(false);
  });

  it("should return false for string longer than 30 chars", () => {
    expect(isCuid("clh9p7k2n0000qzrmn9w123456789abc")).toBe(false);
  });

  it("should return false for string starting with a number", () => {
    expect(isCuid("0lh9p7k2n0000qzrmn9w")).toBe(false);
  });

  it("should return false for string with special characters", () => {
    expect(isCuid("clh9p7k2n000-qzrmn9w")).toBe(false);
  });

  it("should return false for empty string", () => {
    expect(isCuid("")).toBe(false);
  });
});

describe("validateObject", () => {
  it("should return valid results when all fields pass", () => {
    const obj = { name: "Alice", age: 25 };
    const schema = {
      name: [minLength(2)] as ValidationRule<unknown>[],
      age: [minValue(18)] as ValidationRule<unknown>[],
    };

    const results = validateObject(obj, schema);

    expect(results.name.valid).toBe(true);
    expect(results.age.valid).toBe(true);
  });

  it("should return invalid results for failing fields", () => {
    const obj = { name: "A", age: 15 };
    const schema = {
      name: [minLength(2)] as ValidationRule<unknown>[],
      age: [minValue(18)] as ValidationRule<unknown>[],
    };

    const results = validateObject(obj, schema);

    expect(results.name.valid).toBe(false);
    expect(results.age.valid).toBe(false);
  });

  it("should only validate fields present in schema", () => {
    const obj = { name: "Alice", extra: "ignored" };
    const schema = {
      name: [minLength(1)] as ValidationRule<unknown>[],
    };

    const results = validateObject(obj as Record<string, unknown>, schema as Record<string, ValidationRule<unknown>[]>);
    expect(results.name.valid).toBe(true);
  });
});

describe("combineResults", () => {
  it("should return valid when all results are valid", () => {
    const results = [
      { valid: true, errors: [] },
      { valid: true, errors: [] },
    ];
    const combined = combineResults(results);
    expect(combined.valid).toBe(true);
    expect(combined.errors).toHaveLength(0);
  });

  it("should return invalid when any result has errors", () => {
    const results = [
      { valid: true, errors: [] },
      { valid: false, errors: ["Error 1"] },
    ];
    const combined = combineResults(results);
    expect(combined.valid).toBe(false);
    expect(combined.errors).toContain("Error 1");
  });

  it("should aggregate all errors from all results", () => {
    const results = [
      { valid: false, errors: ["Error A", "Error B"] },
      { valid: false, errors: ["Error C"] },
    ];
    const combined = combineResults(results);
    expect(combined.valid).toBe(false);
    expect(combined.errors).toHaveLength(3);
    expect(combined.errors).toContain("Error A");
    expect(combined.errors).toContain("Error B");
    expect(combined.errors).toContain("Error C");
  });

  it("should return valid for empty array", () => {
    const combined = combineResults([]);
    expect(combined.valid).toBe(true);
    expect(combined.errors).toHaveLength(0);
  });
});

describe("sanitizeString", () => {
  it("should trim by default", () => {
    expect(sanitizeString("  hello  ")).toBe("hello");
  });

  it("should not trim when trim is false", () => {
    expect(sanitizeString("  hello  ", { trim: false })).toBe("  hello  ");
  });

  it("should convert to lowercase when lowercase is true", () => {
    expect(sanitizeString("Hello World", { lowercase: true })).toBe("hello world");
  });

  it("should truncate to maxLength", () => {
    expect(sanitizeString("hello world", { maxLength: 5 })).toBe("hello");
  });

  it("should trim before checking maxLength", () => {
    const result = sanitizeString("  hello  ", { maxLength: 5, trim: true });
    expect(result).toBe("hello");
  });

  it("should apply all options together", () => {
    const result = sanitizeString("  HELLO WORLD  ", {
      trim: true,
      lowercase: true,
      maxLength: 5,
    });
    expect(result).toBe("hello");
  });

  it("should return empty string unchanged", () => {
    expect(sanitizeString("")).toBe("");
  });

  it("should not truncate when string is within maxLength", () => {
    expect(sanitizeString("hi", { maxLength: 10 })).toBe("hi");
  });
});
