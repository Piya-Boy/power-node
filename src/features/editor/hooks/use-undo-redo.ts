"use client";

import { useCallback, useRef } from "react";
import type { Node, Edge } from "@xyflow/react";

interface HistoryState {
  nodes: Node[];
  edges: Edge[];
}

const MAX_HISTORY = 50;

export function useUndoRedo(
  nodes: Node[],
  edges: Edge[],
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
) {
  const past = useRef<HistoryState[]>([]);
  const future = useRef<HistoryState[]>([]);
  const isUndoRedoing = useRef(false);

  const takeSnapshot = useCallback(() => {
    if (isUndoRedoing.current) return;

    past.current = [
      ...past.current.slice(-MAX_HISTORY),
      { nodes: structuredClone(nodes), edges: structuredClone(edges) },
    ];
    future.current = [];
  }, [nodes, edges]);

  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;

    isUndoRedoing.current = true;
    future.current.push({
      nodes: structuredClone(nodes),
      edges: structuredClone(edges),
    });
    setNodes(previous.nodes);
    setEdges(previous.edges);
    isUndoRedoing.current = false;
  }, [nodes, edges, setNodes, setEdges]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;

    isUndoRedoing.current = true;
    past.current.push({
      nodes: structuredClone(nodes),
      edges: structuredClone(edges),
    });
    setNodes(next.nodes);
    setEdges(next.edges);
    isUndoRedoing.current = false;
  }, [nodes, edges, setNodes, setEdges]);

  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;

  return { undo, redo, canUndo, canRedo, takeSnapshot };
}
