"use client";

import { createId } from "@paralleldrive/cuid2";
import { useReactFlow } from "@xyflow/react";
import { type DragEvent, useCallback } from "react";
import { toast } from "sonner";
import { NodeType } from "@/generated/prisma";

export function useNodeDrop() {
  const { setNodes, getNodes, screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData(
        "application/powernode-type",
      ) as NodeType;
      if (!nodeType) return;

      if (nodeType === NodeType.MANUAL_TRIGGER) {
        const nodes = getNodes();
        if (nodes.some((n) => n.type === NodeType.MANUAL_TRIGGER)) {
          toast.error("Only one manual trigger is allowed per workflow");
          return;
        }
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      setNodes((nodes) => {
        const hasInitial = nodes.some((n) => n.type === NodeType.INITIAL);
        const newNode = {
          id: createId(),
          data: {},
          position,
          type: nodeType,
        };

        if (hasInitial) {
          return [newNode];
        }
        return [...nodes, newNode];
      });
    },
    [setNodes, getNodes, screenToFlowPosition],
  );

  return { onDragOver, onDrop };
}
