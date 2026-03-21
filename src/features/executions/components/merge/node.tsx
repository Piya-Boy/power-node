"use client";

import { type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { BaseExecutionNode } from "../base-execution-node";
import { MergeIcon } from "lucide-react";

export const MergeNode = memo((props: NodeProps) => {
  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={MergeIcon}
      name="Merge"
      status="initial"
      description="Merge multiple inputs"
    />
  );
});

MergeNode.displayName = "MergeNode";
