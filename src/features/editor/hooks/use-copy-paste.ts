"use client";

import { useCallback, useRef } from "react";
import { useReactFlow, type Node, type Edge } from "@xyflow/react";
import { createId } from "@paralleldrive/cuid2";

interface ClipboardData {
  nodes: Node[];
  edges: Edge[];
}

export function useCopyPaste() {
  const { getNodes, getEdges, setNodes, setEdges, screenToFlowPosition } =
    useReactFlow();
  const clipboard = useRef<ClipboardData | null>(null);

  const copy = useCallback(() => {
    const selectedNodes = getNodes().filter((n) => n.selected);
    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
    const selectedEdges = getEdges().filter(
      (e) => selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target),
    );

    if (selectedNodes.length === 0) return;

    clipboard.current = {
      nodes: structuredClone(selectedNodes),
      edges: structuredClone(selectedEdges),
    };
  }, [getNodes, getEdges]);

  const paste = useCallback(() => {
    if (!clipboard.current) return;

    const idMap = new Map<string, string>();
    const offset = 50;

    const newNodes = clipboard.current.nodes.map((node) => {
      const newId = createId();
      idMap.set(node.id, newId);
      return {
        ...node,
        id: newId,
        position: {
          x: node.position.x + offset,
          y: node.position.y + offset,
        },
        selected: true,
      };
    });

    const newEdges = clipboard.current.edges.map((edge) => ({
      ...edge,
      id: createId(),
      source: idMap.get(edge.source) ?? edge.source,
      target: idMap.get(edge.target) ?? edge.target,
    }));

    // Deselect existing nodes
    setNodes((nodes) => [
      ...nodes.map((n) => ({ ...n, selected: false })),
      ...newNodes,
    ]);
    setEdges((edges) => [...edges, ...newEdges]);
  }, [setNodes, setEdges]);

  const cut = useCallback(() => {
    copy();
    const selectedIds = new Set(
      getNodes()
        .filter((n) => n.selected)
        .map((n) => n.id),
    );
    setNodes((nodes) => nodes.filter((n) => !selectedIds.has(n.id)));
    setEdges((edges) =>
      edges.filter(
        (e) => !selectedIds.has(e.source) && !selectedIds.has(e.target),
      ),
    );
  }, [copy, getNodes, setNodes, setEdges]);

  return { copy, paste, cut };
}
