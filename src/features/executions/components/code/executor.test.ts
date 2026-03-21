import { describe, it, expect } from "vitest";
import { codeExecutor } from "./executor";
import type { Realtime } from "@inngest/realtime";

function createParams(data: Record<string, unknown>, context: Record<string, unknown> = {}) {
  return {
    data,
    nodeId: "test-node",
    userId: "test-user",
    context,
    step: {} as any,
    publish: (() => {}) as unknown as Realtime.PublishFn,
  };
}

describe("codeExecutor", () => {
  it("should execute simple JavaScript and return result", async () => {
    const result = await codeExecutor(
      createParams(
        { variableName: "output", language: "javascript", code: "return 42;" },
      ),
    );
    expect(result.output).toBe(42);
  });

  it("should access context from previous nodes", async () => {
    const result = await codeExecutor(
      createParams(
        {
          variableName: "processed",
          language: "javascript",
          code: "return { doubled: context.count * 2 };",
        },
        { count: 5 },
      ),
    );
    expect(result.processed).toEqual({ doubled: 10 });
  });

  it("should return null when code is empty", async () => {
    const result = await codeExecutor(
      createParams({ variableName: "output", language: "javascript", code: "" }),
    );
    expect(result.output).toBeNull();
  });

  it("should preserve existing context", async () => {
    const result = await codeExecutor(
      createParams(
        { variableName: "newData", language: "javascript", code: "return 'hello';" },
        { existing: "data" },
      ),
    );
    expect(result.existing).toBe("data");
    expect(result.newData).toBe("hello");
  });

  it("should handle string manipulation", async () => {
    const result = await codeExecutor(
      createParams(
        {
          variableName: "result",
          language: "javascript",
          code: 'return context.name.toUpperCase();',
        },
        { name: "powernode" },
      ),
    );
    expect(result.result).toBe("POWERNODE");
  });

  it("should handle array operations", async () => {
    const result = await codeExecutor(
      createParams(
        {
          variableName: "result",
          language: "javascript",
          code: "return context.items.filter(i => i > 3);",
        },
        { items: [1, 2, 3, 4, 5] },
      ),
    );
    expect(result.result).toEqual([4, 5]);
  });

  it("should handle object creation", async () => {
    const result = await codeExecutor(
      createParams(
        {
          variableName: "result",
          language: "javascript",
          code: `
            const data = context.rawData;
            return {
              count: data.length,
              first: data[0],
              last: data[data.length - 1],
            };
          `,
        },
        { rawData: ["a", "b", "c"] },
      ),
    );
    expect(result.result).toEqual({ count: 3, first: "a", last: "c" });
  });

  it("should throw on invalid JavaScript", async () => {
    await expect(
      codeExecutor(
        createParams(
          { variableName: "output", language: "javascript", code: "invalid syntax {{{}}" },
        ),
      ),
    ).rejects.toThrow();
  });

  it("should use default variable name when not provided", async () => {
    const result = await codeExecutor(
      createParams({ language: "javascript", code: "return 1;" }),
    );
    expect(result.codeResult).toBe(1);
  });
});
