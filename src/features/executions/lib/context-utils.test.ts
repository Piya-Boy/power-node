import { describe, it, expect } from "vitest";
import {
  mergeNodeOutput,
  createInitialContext,
  getUserVariables,
  serializeContext,
  isValidVariableName,
  sanitizeVariableName,
  resolveContextValue,
} from "./context-utils";

describe("Context Utilities", () => {
  describe("mergeNodeOutput", () => {
    it("should add output to context", () => {
      const ctx = { existing: "value" };
      const result = mergeNodeOutput(ctx, "httpResult", { status: 200 });
      expect(result.httpResult).toEqual({ status: 200 });
      expect(result.existing).toBe("value");
    });

    it("should not mutate original context", () => {
      const ctx = { a: 1 };
      mergeNodeOutput(ctx, "b", 2);
      expect(ctx).not.toHaveProperty("b");
    });

    it("should overwrite existing variable", () => {
      const ctx = { step1: "old" };
      const result = mergeNodeOutput(ctx, "step1", "new");
      expect(result.step1).toBe("new");
    });
  });

  describe("createInitialContext", () => {
    it("should include _workflowId", () => {
      const ctx = createInitialContext("wf_123");
      expect(ctx._workflowId).toBe("wf_123");
    });

    it("should include _startedAt as ISO string", () => {
      const ctx = createInitialContext("wf_123");
      expect(typeof ctx._startedAt).toBe("string");
      expect(() => new Date(ctx._startedAt as string)).not.toThrow();
    });

    it("should include initial data", () => {
      const ctx = createInitialContext("wf_123", { webhook: { body: "test" } });
      expect(ctx.webhook).toEqual({ body: "test" });
    });

    it("should include _env field", () => {
      const ctx = createInitialContext("wf_123");
      expect(ctx._env).toBeDefined();
    });
  });

  describe("getUserVariables", () => {
    it("should exclude _prefixed keys", () => {
      const ctx = {
        _workflowId: "wf_123",
        _startedAt: "2024-01-01",
        myVar: "value",
        anotherVar: 42,
      };
      const userVars = getUserVariables(ctx);
      expect(userVars).not.toHaveProperty("_workflowId");
      expect(userVars).not.toHaveProperty("_startedAt");
      expect(userVars.myVar).toBe("value");
      expect(userVars.anotherVar).toBe(42);
    });

    it("should return empty object for all-system context", () => {
      const ctx = { _a: 1, _b: 2 };
      expect(getUserVariables(ctx)).toEqual({});
    });
  });

  describe("serializeContext", () => {
    it("should serialize normal context to JSON", () => {
      const ctx = { a: 1, b: "hello" };
      const json = serializeContext(ctx);
      expect(JSON.parse(json)).toEqual(ctx);
    });

    it("should handle Date objects", () => {
      const date = new Date("2024-01-01T00:00:00Z");
      const json = serializeContext({ date });
      expect(JSON.parse(json).date).toBe("2024-01-01T00:00:00.000Z");
    });

    it("should handle BigInt", () => {
      const json = serializeContext({ big: BigInt(42) });
      expect(JSON.parse(json).big).toBe("42");
    });

    it("should handle circular references", () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj.self = obj;
      expect(() => serializeContext(obj)).not.toThrow();
      const parsed = JSON.parse(serializeContext(obj));
      expect(parsed.self).toBe("[Circular]");
    });

    it("should handle Error objects", () => {
      const err = new Error("test error");
      const json = serializeContext({ err });
      const parsed = JSON.parse(json);
      expect(parsed.err.message).toBe("test error");
    });
  });

  describe("isValidVariableName", () => {
    it("should accept simple names", () => {
      expect(isValidVariableName("myVar")).toBe(true);
      expect(isValidVariableName("result")).toBe(true);
      expect(isValidVariableName("step1")).toBe(true);
    });

    it("should accept names with underscores", () => {
      expect(isValidVariableName("my_var")).toBe(true);
    });

    it("should reject empty string", () => {
      expect(isValidVariableName("")).toBe(false);
    });

    it("should reject names starting with underscore", () => {
      expect(isValidVariableName("_private")).toBe(false);
    });

    it("should reject names starting with digit", () => {
      expect(isValidVariableName("1var")).toBe(false);
    });

    it("should reject names with special chars", () => {
      expect(isValidVariableName("my-var")).toBe(false);
      expect(isValidVariableName("my.var")).toBe(false);
      expect(isValidVariableName("my var")).toBe(false);
    });
  });

  describe("sanitizeVariableName", () => {
    it("should return valid name unchanged", () => {
      expect(sanitizeVariableName("myVar")).toBe("myVar");
    });

    it("should replace hyphens with underscores", () => {
      expect(sanitizeVariableName("my-var")).toBe("my_var");
    });

    it("should prefix digit-starting names", () => {
      expect(sanitizeVariableName("1var")).toBe("v_1var");
    });

    it("should prefix underscore-starting names", () => {
      expect(sanitizeVariableName("_private")).toBe("v_private");
    });

    it("should handle empty string", () => {
      expect(sanitizeVariableName("")).toBe("output");
    });

    it("should handle spaces", () => {
      expect(sanitizeVariableName("my var")).toBe("my_var");
    });
  });

  describe("resolveContextValue", () => {
    it("should resolve top-level key", () => {
      expect(resolveContextValue({ name: "Alice" }, "name")).toBe("Alice");
    });

    it("should resolve nested path", () => {
      expect(resolveContextValue({ user: { age: 30 } }, "user.age")).toBe(30);
    });

    it("should return undefined for missing key", () => {
      expect(resolveContextValue({}, "missing")).toBeUndefined();
    });

    it("should return undefined for null intermediate", () => {
      expect(resolveContextValue({ a: null } as any, "a.b")).toBeUndefined();
    });
  });
});
