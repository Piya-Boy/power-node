import { describe, it, expect } from "vitest";
import { getExecutor, executorRegistry } from "./executor-registry";
import { NodeType } from "@/generated/prisma";

describe("executorRegistry", () => {
  it("should have an executor for every NodeType", () => {
    const allNodeTypes = Object.values(NodeType);
    for (const nodeType of allNodeTypes) {
      expect(
        executorRegistry[nodeType],
        `Missing executor for NodeType: ${nodeType}`,
      ).toBeDefined();
    }
  });

  it("should return executor for known types", () => {
    expect(getExecutor(NodeType.OPENAI)).toBeDefined();
    expect(getExecutor(NodeType.HTTP_REQUEST)).toBeDefined();
    expect(getExecutor(NodeType.MANUAL_TRIGGER)).toBeDefined();
    expect(getExecutor(NodeType.IF_CONDITION)).toBeDefined();
    expect(getExecutor(NodeType.CODE)).toBeDefined();
  });

  it("should have all Phase 2 node types registered", () => {
    const phase2Types = [
      NodeType.WEBHOOK_TRIGGER,
      NodeType.SCHEDULE_TRIGGER,
      NodeType.IF_CONDITION,
      NodeType.SWITCH,
      NodeType.FILTER,
      NodeType.LOOP,
      NodeType.MERGE,
      NodeType.SPLIT,
      NodeType.WAIT_DELAY,
      NodeType.STOP_ERROR,
      NodeType.SUB_WORKFLOW,
      NodeType.CODE,
      NodeType.TRANSFORM,
      NodeType.AGGREGATE,
      NodeType.SORT,
      NodeType.REMOVE_DUPLICATES,
      NodeType.DATE_TIME,
      NodeType.CRYPTO,
      NodeType.MARKDOWN_HTML,
      NodeType.COMPRESS,
    ];

    for (const type of phase2Types) {
      expect(executorRegistry[type], `Missing Phase 2 executor: ${type}`).toBeDefined();
    }
  });

  it("noop executors should pass through context unchanged", async () => {
    const noopTypes = [
      NodeType.STICKY_NOTE,
      NodeType.SWITCH,
      NodeType.FILTER,
      NodeType.LOOP,
    ];

    for (const type of noopTypes) {
      const executor = getExecutor(type);
      const context = { existing: "data", count: 42 };
      const result = await executor({
        data: {},
        nodeId: "test",
        userId: "test",
        context,
        step: {} as any,
        publish: (() => {}) as any,
      });
      expect(result, `Noop executor for ${type} should pass through context`).toEqual(context);
    }
  });
});
