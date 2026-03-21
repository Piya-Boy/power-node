import { describe, it, expect } from "vitest";
import { ifConditionExecutor } from "./executor";
import type { WorkflowContext } from "../../types";
import type { Realtime } from "@inngest/realtime";

// Helper to create mock executor params
function createParams(data: Record<string, unknown>, context: WorkflowContext = {}) {
  return {
    data,
    nodeId: "test-node",
    userId: "test-user",
    context,
    step: {} as any,
    publish: (() => {}) as unknown as Realtime.PublishFn,
  };
}

describe("ifConditionExecutor", () => {
  describe("equals operator", () => {
    it("should return true when field equals value", async () => {
      const result = await ifConditionExecutor(
        createParams(
          { variableName: "result", field: "{{status}}", operator: "equals", value: "200" },
          { status: "200" },
        ),
      );
      expect(result.result).toEqual({ result: true, field: "200", operator: "equals", value: "200" });
    });

    it("should return false when field does not equal value", async () => {
      const result = await ifConditionExecutor(
        createParams(
          { variableName: "result", field: "{{status}}", operator: "equals", value: "200" },
          { status: "404" },
        ),
      );
      expect(result.result).toEqual(expect.objectContaining({ result: false }));
    });
  });

  describe("not_equals operator", () => {
    it("should return true when field does not equal value", async () => {
      const result = await ifConditionExecutor(
        createParams(
          { variableName: "check", field: "{{code}}", operator: "not_equals", value: "error" },
          { code: "success" },
        ),
      );
      expect(result.check).toEqual(expect.objectContaining({ result: true }));
    });
  });

  describe("contains operator", () => {
    it("should return true when field contains value", async () => {
      const result = await ifConditionExecutor(
        createParams(
          { variableName: "r", field: "{{msg}}", operator: "contains", value: "hello" },
          { msg: "say hello world" },
        ),
      );
      expect(result.r).toEqual(expect.objectContaining({ result: true }));
    });

    it("should return false when field does not contain value", async () => {
      const result = await ifConditionExecutor(
        createParams(
          { variableName: "r", field: "{{msg}}", operator: "contains", value: "goodbye" },
          { msg: "say hello world" },
        ),
      );
      expect(result.r).toEqual(expect.objectContaining({ result: false }));
    });
  });

  describe("not_contains operator", () => {
    it("should return true when field does not contain value", async () => {
      const result = await ifConditionExecutor(
        createParams(
          { variableName: "r", field: "{{msg}}", operator: "not_contains", value: "error" },
          { msg: "all good" },
        ),
      );
      expect(result.r).toEqual(expect.objectContaining({ result: true }));
    });
  });

  describe("greater_than operator", () => {
    it("should return true when field is greater than value", async () => {
      const result = await ifConditionExecutor(
        createParams(
          { variableName: "r", field: "{{count}}", operator: "greater_than", value: "5" },
          { count: "10" },
        ),
      );
      expect(result.r).toEqual(expect.objectContaining({ result: true }));
    });

    it("should return false when field is less than value", async () => {
      const result = await ifConditionExecutor(
        createParams(
          { variableName: "r", field: "{{count}}", operator: "greater_than", value: "10" },
          { count: "3" },
        ),
      );
      expect(result.r).toEqual(expect.objectContaining({ result: false }));
    });
  });

  describe("less_than operator", () => {
    it("should return true when field is less than value", async () => {
      const result = await ifConditionExecutor(
        createParams(
          { variableName: "r", field: "{{count}}", operator: "less_than", value: "10" },
          { count: "3" },
        ),
      );
      expect(result.r).toEqual(expect.objectContaining({ result: true }));
    });
  });

  describe("is_empty operator", () => {
    it("should return true when field is empty string", async () => {
      const result = await ifConditionExecutor(
        createParams(
          { variableName: "r", field: "{{val}}", operator: "is_empty", value: "" },
          { val: "" },
        ),
      );
      expect(result.r).toEqual(expect.objectContaining({ result: true }));
    });

    it("should return false when field has value", async () => {
      const result = await ifConditionExecutor(
        createParams(
          { variableName: "r", field: "{{val}}", operator: "is_empty", value: "" },
          { val: "something" },
        ),
      );
      expect(result.r).toEqual(expect.objectContaining({ result: false }));
    });
  });

  describe("is_not_empty operator", () => {
    it("should return true when field has value", async () => {
      const result = await ifConditionExecutor(
        createParams(
          { variableName: "r", field: "{{val}}", operator: "is_not_empty", value: "" },
          { val: "something" },
        ),
      );
      expect(result.r).toEqual(expect.objectContaining({ result: true }));
    });
  });

  describe("starts_with operator", () => {
    it("should return true when field starts with value", async () => {
      const result = await ifConditionExecutor(
        createParams(
          { variableName: "r", field: "{{url}}", operator: "starts_with", value: "https" },
          { url: "https://example.com" },
        ),
      );
      expect(result.r).toEqual(expect.objectContaining({ result: true }));
    });
  });

  describe("ends_with operator", () => {
    it("should return true when field ends with value", async () => {
      const result = await ifConditionExecutor(
        createParams(
          { variableName: "r", field: "{{file}}", operator: "ends_with", value: ".json" },
          { file: "data.json" },
        ),
      );
      expect(result.r).toEqual(expect.objectContaining({ result: true }));
    });
  });

  describe("context preservation", () => {
    it("should preserve existing context values", async () => {
      const result = await ifConditionExecutor(
        createParams(
          { variableName: "myCheck", field: "{{status}}", operator: "equals", value: "ok" },
          { status: "ok", previousData: { foo: "bar" } },
        ),
      );
      expect(result.previousData).toEqual({ foo: "bar" });
      expect(result.status).toBe("ok");
      expect(result.myCheck).toBeDefined();
    });
  });

  describe("default values", () => {
    it("should use default variable name when not provided", async () => {
      const result = await ifConditionExecutor(
        createParams(
          { field: "test", operator: "equals", value: "test" },
          {},
        ),
      );
      expect(result.ifResult).toBeDefined();
    });
  });
});
