import { describe, it, expect, vi } from "vitest";
// Test the undo/redo logic directly (not the hook, which needs React)

interface HistoryState {
  nodes: { id: string }[];
  edges: { id: string }[];
}

// Extract the core logic for testing
function createUndoRedoManager() {
  const past: HistoryState[] = [];
  const future: HistoryState[] = [];

  function takeSnapshot(nodes: { id: string }[], edges: { id: string }[]) {
    past.push({
      nodes: structuredClone(nodes),
      edges: structuredClone(edges),
    });
    future.length = 0;
    // Limit history
    if (past.length > 50) past.shift();
  }

  function undo(
    currentNodes: { id: string }[],
    currentEdges: { id: string }[],
  ): HistoryState | null {
    const previous = past.pop();
    if (!previous) return null;
    future.push({
      nodes: structuredClone(currentNodes),
      edges: structuredClone(currentEdges),
    });
    return previous;
  }

  function redo(
    currentNodes: { id: string }[],
    currentEdges: { id: string }[],
  ): HistoryState | null {
    const next = future.pop();
    if (!next) return null;
    past.push({
      nodes: structuredClone(currentNodes),
      edges: structuredClone(currentEdges),
    });
    return next;
  }

  return {
    takeSnapshot,
    undo,
    redo,
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    get pastLength() { return past.length; },
    get futureLength() { return future.length; },
  };
}

describe("UndoRedo logic", () => {
  it("should start with no undo/redo available", () => {
    const manager = createUndoRedoManager();
    expect(manager.canUndo).toBe(false);
    expect(manager.canRedo).toBe(false);
  });

  it("should allow undo after taking snapshot", () => {
    const manager = createUndoRedoManager();
    manager.takeSnapshot([{ id: "n1" }], []);
    expect(manager.canUndo).toBe(true);
  });

  it("should restore previous state on undo", () => {
    const manager = createUndoRedoManager();
    const initialNodes = [{ id: "n1" }];
    const initialEdges = [{ id: "e1" }];
    manager.takeSnapshot(initialNodes, initialEdges);

    const currentNodes = [{ id: "n1" }, { id: "n2" }];
    const currentEdges = [{ id: "e1" }, { id: "e2" }];

    const restored = manager.undo(currentNodes, currentEdges);
    expect(restored).not.toBeNull();
    expect(restored!.nodes).toEqual([{ id: "n1" }]);
    expect(restored!.edges).toEqual([{ id: "e1" }]);
  });

  it("should allow redo after undo", () => {
    const manager = createUndoRedoManager();
    manager.takeSnapshot([{ id: "n1" }], []);

    manager.undo([{ id: "n1" }, { id: "n2" }], []);
    expect(manager.canRedo).toBe(true);
  });

  it("should restore next state on redo", () => {
    const manager = createUndoRedoManager();
    manager.takeSnapshot([{ id: "n1" }], []);

    const afterChange = [{ id: "n1" }, { id: "n2" }];
    manager.undo(afterChange, []);

    const redone = manager.redo([{ id: "n1" }], []);
    expect(redone).not.toBeNull();
    expect(redone!.nodes).toEqual([{ id: "n1" }, { id: "n2" }]);
  });

  it("should clear future on new snapshot after undo", () => {
    const manager = createUndoRedoManager();
    manager.takeSnapshot([{ id: "n1" }], []);
    manager.undo([{ id: "n2" }], []);

    expect(manager.canRedo).toBe(true);

    // New action clears future
    manager.takeSnapshot([{ id: "n3" }], []);
    expect(manager.canRedo).toBe(false);
  });

  it("should return null when nothing to undo", () => {
    const manager = createUndoRedoManager();
    const result = manager.undo([], []);
    expect(result).toBeNull();
  });

  it("should return null when nothing to redo", () => {
    const manager = createUndoRedoManager();
    const result = manager.redo([], []);
    expect(result).toBeNull();
  });

  it("should handle multiple undo steps", () => {
    const manager = createUndoRedoManager();
    manager.takeSnapshot([{ id: "step1" }], []);
    manager.takeSnapshot([{ id: "step2" }], []);
    manager.takeSnapshot([{ id: "step3" }], []);

    expect(manager.pastLength).toBe(3);

    const step3 = manager.undo([{ id: "step4" }], []);
    expect(step3!.nodes).toEqual([{ id: "step3" }]);

    const step2 = manager.undo([{ id: "step3" }], []);
    expect(step2!.nodes).toEqual([{ id: "step2" }]);

    const step1 = manager.undo([{ id: "step2" }], []);
    expect(step1!.nodes).toEqual([{ id: "step1" }]);

    expect(manager.canUndo).toBe(false);
    expect(manager.futureLength).toBe(3);
  });
});
