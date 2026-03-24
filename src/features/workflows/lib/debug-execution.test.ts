import {
  applyPinnedDataPatch,
  buildDebugExecutionPlan,
  getPinnedDataPatch,
  getPinnedDataState,
  setPinnedDataState,
} from "./debug-execution";

describe("pinned data helpers", () => {
  it("stores pinned data without losing existing node configuration", () => {
    const nextData = setPinnedDataState(
      { variableName: "repoData", operation: "list_repos" },
      {
        enabled: true,
        value: {
          repoData: [{ id: 1, name: "power-node" }],
        },
      },
    );

    expect(nextData.variableName).toBe("repoData");
    expect(nextData.operation).toBe("list_repos");
    expect(getPinnedDataState(nextData)).toEqual({
      enabled: true,
      value: {
        repoData: [{ id: 1, name: "power-node" }],
      },
    });
  });

  it("does not apply disabled pinned data to the execution context", () => {
    const nodeData = setPinnedDataState(
      { variableName: "repoData" },
      {
        enabled: false,
        value: {
          repoData: [{ id: 1 }],
        },
      },
    );

    expect(getPinnedDataPatch(nodeData)).toBeNull();
  });

  it("merges pinned data patches into the current context", () => {
    expect(
      applyPinnedDataPatch(
        { existing: true },
        { mocked: "value", existing: false },
      ),
    ).toEqual({
      existing: false,
      mocked: "value",
    });
  });
});

describe("buildDebugExecutionPlan", () => {
  const makeNode = (id: string, data: Record<string, unknown> = {}) => ({
    id,
    data,
  });

  it("starts execution from the requested node and seeds upstream pinned data", () => {
    const sortedNodes = [
      makeNode(
        "fetch-repos",
        setPinnedDataState(
          { variableName: "repoData" },
          {
            enabled: true,
            value: {
              repoData: [{ id: 1, name: "power-node" }],
            },
          },
        ),
      ),
      makeNode("filter-repos"),
      makeNode("notify"),
    ];

    const plan = buildDebugExecutionPlan(sortedNodes, {
      debugStartNodeId: "filter-repos",
      initialContext: { trigger: "manual" },
    });

    expect(plan.nodesToExecute.map((node) => node.id)).toEqual([
      "filter-repos",
      "notify",
    ]);
    expect(plan.initialContext).toEqual({
      trigger: "manual",
      repoData: [{ id: 1, name: "power-node" }],
    });
    expect(plan.resolvedDebugStartNodeId).toBe("filter-repos");
  });

  it("falls back to the full workflow when the debug start node is missing", () => {
    const sortedNodes = [makeNode("a"), makeNode("b")];

    const plan = buildDebugExecutionPlan(sortedNodes, {
      debugStartNodeId: "missing",
      initialContext: { trigger: "manual" },
    });

    expect(plan.nodesToExecute.map((node) => node.id)).toEqual(["a", "b"]);
    expect(plan.initialContext).toEqual({ trigger: "manual" });
    expect(plan.resolvedDebugStartNodeId).toBeNull();
  });
});
