"use client";

import { type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { BaseExecutionNode } from "../base-execution-node";
import { WandIcon } from "lucide-react";

export const TransformNode = memo((props: NodeProps) => {
  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={WandIcon}
      name="Transform"
      status="initial"
      description="Transform data structure"
    />
  );
});

TransformNode.displayName = "TransformNode";
