"use client";

import { type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { BaseExecutionNode } from "../base-execution-node";
import { ArrowUpDownIcon } from "lucide-react";

export const SortNode = memo((props: NodeProps) => {
  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={ArrowUpDownIcon}
      name="Sort"
      status="initial"
      description="Sort items"
    />
  );
});

SortNode.displayName = "SortNode";
