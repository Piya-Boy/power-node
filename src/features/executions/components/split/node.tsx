"use client";

import { type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { BaseExecutionNode } from "../base-execution-node";
import { SplitIcon } from "lucide-react";

export const SplitNode = memo((props: NodeProps) => {
  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={SplitIcon}
      name="Split"
      status="initial"
      description="Split array into items"
    />
  );
});

SplitNode.displayName = "SplitNode";
