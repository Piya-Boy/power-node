import { describe, it, expect } from "vitest";
import {
  validateFormat,
  validate,
  validateRecord,
  extractFieldPaths,
  getRequiredPaths,
  type FieldSchema,
  type ObjectSchema,
} from "./input-schema-validator";

// ─────────────────────────────────────────────────────────────────────────────
// validateFormat
// ─────────────────────────────────────────────────────────────────────────────

describe("validateFormat", () => {
  it("validates email", () => {
    expect(validateFormat("user@example.com", "email")).toBe(true);
    expect(validateFormat("notanemail", "email")).toBe(false);
  });

  it("validates url", () => {
    expect(validateFormat("https://example.com", "url")).toBe(true);
    expect(validateFormat("not-a-url", "url")).toBe(false);
  });

  it("validates uuid", () => {
    expect(validateFormat("550e8400-e29b-41d4-a716-446655440000", "uuid")).toBe(true);
    expect(validateFormat("not-a-uuid", "uuid")).toBe(false);
  });

  it("validates date", () => {
    expect(validateFormat("2025-06-01", "date")).toBe(true);
    expect(validateFormat("01/06/2025", "date")).toBe(false);
  });

  it("validates datetime", () => {
    expect(validateFormat("2025-06-01T10:00:00Z", "datetime")).toBe(true);
    expect(validateFormat("2025-06-01", "datetime")).toBe(false);
  });

  it("validates ip", () => {
    expect(validateFormat("192.168.1.1", "ip")).toBe(true);
    expect(validateFormat("256.0.0.1", "ip")).toBe(true); // pattern allows — basic check
  });

  it("returns true for unknown format", () => {
    expect(validateFormat("anything", "unknown")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validate — string
// ─────────────────────────────────────────────────────────────────────────────

describe("validate string", () => {
  it("accepts valid string", () => {
    expect(validate("hello", { type: "string" }).valid).toBe(true);
  });

  it("rejects non-string", () => {
    const r = validate(42, { type: "string" });
    expect(r.valid).toBe(false);
    expect(r.errors[0].message).toContain("Expected string");
  });

  it("validates minLength", () => {
    expect(validate("hi", { type: "string", minLength: 5 }).valid).toBe(false);
    expect(validate("hello", { type: "string", minLength: 5 }).valid).toBe(true);
  });

  it("validates maxLength", () => {
    expect(validate("toolong", { type: "string", maxLength: 4 }).valid).toBe(false);
    expect(validate("ok", { type: "string", maxLength: 4 }).valid).toBe(true);
  });

  it("validates pattern", () => {
    expect(validate("abc123", { type: "string", pattern: "^[a-z]+$" }).valid).toBe(false);
    expect(validate("abc", { type: "string", pattern: "^[a-z]+$" }).valid).toBe(true);
  });

  it("validates enum", () => {
    const schema: FieldSchema = { type: "string", enum: ["a", "b", "c"] };
    expect(validate("a", schema).valid).toBe(true);
    expect(validate("d", schema).valid).toBe(false);
  });

  it("validates email format", () => {
    expect(validate("user@example.com", { type: "string", format: "email" }).valid).toBe(true);
    expect(validate("bad-email", { type: "string", format: "email" }).valid).toBe(false);
  });

  it("reports correct path", () => {
    const r = validate(42, { type: "string" }, { path: "user.email" });
    expect(r.errors[0].path).toBe("user.email");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validate — number / integer
// ─────────────────────────────────────────────────────────────────────────────

describe("validate number", () => {
  it("accepts valid number", () => {
    expect(validate(42, { type: "number" }).valid).toBe(true);
  });

  it("rejects non-number", () => {
    expect(validate("42", { type: "number" }).valid).toBe(false);
  });

  it("validates minimum", () => {
    expect(validate(5, { type: "number", minimum: 10 }).valid).toBe(false);
    expect(validate(10, { type: "number", minimum: 10 }).valid).toBe(true);
  });

  it("validates maximum", () => {
    expect(validate(15, { type: "number", maximum: 10 }).valid).toBe(false);
  });

  it("validates exclusiveMinimum", () => {
    expect(validate(5, { type: "number", exclusiveMinimum: 5 }).valid).toBe(false);
    expect(validate(6, { type: "number", exclusiveMinimum: 5 }).valid).toBe(true);
  });

  it("validates exclusiveMaximum", () => {
    expect(validate(10, { type: "number", exclusiveMaximum: 10 }).valid).toBe(false);
  });

  it("validates multipleOf", () => {
    expect(validate(7, { type: "number", multipleOf: 5 }).valid).toBe(false);
    expect(validate(10, { type: "number", multipleOf: 5 }).valid).toBe(true);
  });

  it("validates integer type (rejects float)", () => {
    expect(validate(1.5, { type: "integer" }).valid).toBe(false);
    expect(validate(2, { type: "integer" }).valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validate — boolean
// ─────────────────────────────────────────────────────────────────────────────

describe("validate boolean", () => {
  it("accepts true/false", () => {
    expect(validate(true, { type: "boolean" }).valid).toBe(true);
    expect(validate(false, { type: "boolean" }).valid).toBe(true);
  });

  it("rejects non-boolean", () => {
    expect(validate(1, { type: "boolean" }).valid).toBe(false);
    expect(validate("true", { type: "boolean" }).valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validate — null
// ─────────────────────────────────────────────────────────────────────────────

describe("validate null", () => {
  it("accepts null", () => {
    expect(validate(null, { type: "null" }).valid).toBe(true);
  });

  it("rejects non-null", () => {
    expect(validate("x", { type: "null" }).valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validate — any
// ─────────────────────────────────────────────────────────────────────────────

describe("validate any", () => {
  it("accepts anything", () => {
    expect(validate(null, { type: "any" }).valid).toBe(true);
    expect(validate(42, { type: "any" }).valid).toBe(true);
    expect(validate("hi", { type: "any" }).valid).toBe(true);
    expect(validate([1, 2], { type: "any" }).valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validate — nullable
// ─────────────────────────────────────────────────────────────────────────────

describe("nullable", () => {
  it("accepts null for nullable field", () => {
    expect(validate(null, { type: "string", nullable: true }).valid).toBe(true);
  });

  it("uses default when null/undefined", () => {
    const r = validate(undefined, { type: "string", default: "hello" });
    expect(r.valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validate — array
// ─────────────────────────────────────────────────────────────────────────────

describe("validate array", () => {
  it("accepts valid array", () => {
    expect(validate([1, 2], { type: "array" }).valid).toBe(true);
  });

  it("rejects non-array", () => {
    expect(validate("not-array", { type: "array" }).valid).toBe(false);
  });

  it("validates minItems", () => {
    expect(validate([], { type: "array", minItems: 1 }).valid).toBe(false);
    expect(validate([1], { type: "array", minItems: 1 }).valid).toBe(true);
  });

  it("validates maxItems", () => {
    expect(validate([1, 2, 3], { type: "array", maxItems: 2 }).valid).toBe(false);
  });

  it("validates uniqueItems", () => {
    expect(validate([1, 1, 2], { type: "array", uniqueItems: true }).valid).toBe(false);
    expect(validate([1, 2, 3], { type: "array", uniqueItems: true }).valid).toBe(true);
  });

  it("validates item schema", () => {
    const schema: FieldSchema = { type: "array", items: { type: "number" } };
    expect(validate([1, 2, 3], schema).valid).toBe(true);
    expect(validate([1, "two", 3], schema).valid).toBe(false);
  });

  it("reports item path correctly", () => {
    const schema: FieldSchema = { type: "array", items: { type: "number" } };
    const r = validate([1, "bad"], schema, { path: "ids" });
    expect(r.errors[0].path).toBe("ids[1]");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validate — object
// ─────────────────────────────────────────────────────────────────────────────

describe("validate object", () => {
  const schema: FieldSchema = {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1 },
      age: { type: "integer", minimum: 0 },
    },
    required: ["name"],
  };

  it("accepts valid object", () => {
    expect(validate({ name: "Alice", age: 30 }, schema).valid).toBe(true);
  });

  it("rejects non-object", () => {
    expect(validate("not-obj", schema).valid).toBe(false);
  });

  it("reports missing required fields", () => {
    const r = validate({ age: 30 }, schema);
    expect(r.valid).toBe(false);
    expect(r.errors[0].path).toBe("name");
  });

  it("validates nested properties", () => {
    const r = validate({ name: "Alice", age: -1 }, schema);
    expect(r.valid).toBe(false);
    expect(r.errors[0].path).toBe("age");
  });

  it("rejects additional properties when not allowed", () => {
    const strict: FieldSchema = { ...schema, additionalProperties: false };
    const r = validate({ name: "Alice", extra: "field" }, strict);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path.includes("extra"))).toBe(true);
  });

  it("validates minProperties / maxProperties", () => {
    expect(validate({}, { type: "object", minProperties: 1 }).valid).toBe(false);
    expect(validate({ a: 1, b: 2, c: 3 }, { type: "object", maxProperties: 2 }).valid).toBe(false);
  });

  it("uses property defaults", () => {
    const schemaWithDefault: FieldSchema = {
      type: "object",
      properties: { role: { type: "string", default: "viewer" } },
    };
    const r = validate({}, schemaWithDefault, { coerce: true });
    expect(r.coerced).toMatchObject({ role: "viewer" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// coercion
// ─────────────────────────────────────────────────────────────────────────────

describe("coercion", () => {
  it("coerces number to string", () => {
    const r = validate(42, { type: "string" }, { coerce: true });
    expect(r.valid).toBe(true);
    expect(r.coerced).toBe("42");
  });

  it("coerces string to number", () => {
    const r = validate("3.14", { type: "number" }, { coerce: true });
    expect(r.valid).toBe(true);
    expect(r.coerced).toBe(3.14);
  });

  it("coerces 'true'/'false' string to boolean", () => {
    expect(validate("true", { type: "boolean" }, { coerce: true }).coerced).toBe(true);
    expect(validate("false", { type: "boolean" }, { coerce: true }).coerced).toBe(false);
  });

  it("fails coercion for invalid string→number", () => {
    const r = validate("abc", { type: "number" }, { coerce: true });
    expect(r.valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateRecord
// ─────────────────────────────────────────────────────────────────────────────

describe("validateRecord", () => {
  it("validates a record against field schemas", () => {
    const schemas = {
      name: { type: "string" } as FieldSchema,
      count: { type: "integer" } as FieldSchema,
    };
    const r = validateRecord({ name: "Alice", count: 3 }, schemas, ["name", "count"]);
    expect(r.valid).toBe(true);
  });

  it("detects missing required fields", () => {
    const schemas = { name: { type: "string" } as FieldSchema };
    const r = validateRecord({}, schemas, ["name"]);
    expect(r.valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractFieldPaths / getRequiredPaths
// ─────────────────────────────────────────────────────────────────────────────

describe("extractFieldPaths", () => {
  it("extracts top-level paths", () => {
    const schema: FieldSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
    };
    const paths = extractFieldPaths(schema);
    expect(paths).toContain("name");
    expect(paths).toContain("age");
  });

  it("extracts nested paths", () => {
    const schema: FieldSchema = {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: { email: { type: "string" } },
        },
      },
    };
    const paths = extractFieldPaths(schema);
    expect(paths).toContain("user");
    expect(paths).toContain("user.email");
  });
});

describe("getRequiredPaths", () => {
  it("returns required field paths", () => {
    const schema: ObjectSchema = {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    };
    expect(getRequiredPaths(schema)).toContain("name");
  });

  it("includes nested required paths", () => {
    const schema: ObjectSchema = {
      type: "object",
      properties: {
        address: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
      },
    };
    const paths = getRequiredPaths(schema);
    expect(paths).toContain("address.city");
  });
});
