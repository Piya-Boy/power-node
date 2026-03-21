"use client";

import { type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { BaseExecutionNode } from "../base-execution-node";
import { RepeatIcon } from "lucide-react";

export const LoopNode = memo((props: NodeProps) => {
  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={RepeatIcon}
      name="Loop"
      status="initial"
      description="Iterate over items"
    />
  );
});

LoopNode.displayName = "LoopNode";
