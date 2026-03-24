import { describe, expect, it } from "vitest";
import {
  buildPinnedExecutionContext,
  type DebugExecutionConnection,
  type DebugExecutionNode,
  getReachableNodeIds,
  prepareExecutionPlan,
} from "./debug-execution";

const nodes: DebugExecutionNode[] = [
  { id: "trigger", data: null },
  { id: "fetch", data: { variableName: "apiResult" } },
  { id: "transform", data: { variableName: "formatted" } },
  { id: "notify", data: { variableName: "delivery" } },
];

const connections: DebugExecutionConnection[] = [
  { fromNodeId: "trigger", toNodeId: "fetch" },
  { fromNodeId: "fetch", toNodeId: "transform" },
  { fromNodeId: "transform", toNodeId: "notify" },
];

describe("debug execution helpers", () => {
  describe("buildPinnedExecutionContext", () => {
    it("maps pinned values to both node ids and variable aliases", () => {
      expect(
        buildPinnedExecutionContext(nodes, {
          fetch: { ok: true },
          transform: ["a", "b"],
        }),
      ).toEqual({
        fetch: { ok: true },
        apiResult: { ok: true },
        transform: ["a", "b"],
        formatted: ["a", "b"],
      });
    });

    it("ignores pinned values for unknown nodes", () => {
      expect(
        buildPinnedExecutionContext(nodes, {
          unknown: { ok: false },
        }),
      ).toEqual({});
    });
  });

  describe("getReachableNodeIds", () => {
    it("returns descendants for a debug start node", () => {
      expect(
        Array.from(getReachableNodeIds(connections, "fetch") ?? []),
      ).toEqual(["fetch", "transform", "notify"]);
    });

    it("returns null when there is no debug start node", () => {
      expect(getReachableNodeIds(connections, null)).toBeNull();
    });
  });

  describe("prepareExecutionPlan", () => {
    it("returns all nodes when debug options are empty", () => {
      const plan = prepareExecutionPlan(nodes, connections);

      expect(plan.nodes.map((node) => node.id)).toEqual([
        "trigger",
        "fetch",
        "transform",
        "notify",
      ]);
      expect(plan.initialContext).toEqual({});
      expect(plan.mockedNodeIds).toEqual([]);
    });

    it("skips pinned nodes while keeping their mocked outputs in context", () => {
      const plan = prepareExecutionPlan(nodes, connections, {
        pinnedData: {
          fetch: { status: 200 },
        },
      });

      expect(plan.nodes.map((node) => node.id)).toEqual([
        "trigger",
        "transform",
        "notify",
      ]);
      expect(plan.initialContext).toEqual({
        fetch: { status: 200 },
        apiResult: { status: 200 },
      });
      expect(plan.mockedNodeIds).toEqual(["fetch"]);
    });

    it("limits execution to the selected node and its descendants", () => {
      const plan = prepareExecutionPlan(nodes, connections, {
        startNodeId: "transform",
      });

      expect(plan.nodes.map((node) => node.id)).toEqual([
        "transform",
        "notify",
      ]);
    });

    it("keeps the debug start node executable even when it also has pinned data", () => {
      const plan = prepareExecutionPlan(nodes, connections, {
        startNodeId: "fetch",
        pinnedData: {
          fetch: { status: "stale" },
          transform: { items: 3 },
        },
      });

      expect(plan.nodes.map((node) => node.id)).toEqual(["fetch", "notify"]);
      expect(plan.initialContext).toEqual({
        fetch: { status: "stale" },
        apiResult: { status: "stale" },
        transform: { items: 3 },
        formatted: { items: 3 },
      });
    });

    it("throws for an unknown debug start node", () => {
      expect(() =>
        prepareExecutionPlan(nodes, connections, {
          startNodeId: "missing",
        }),
      ).toThrow("Unknown debug start node: missing");
    });
  });
});
