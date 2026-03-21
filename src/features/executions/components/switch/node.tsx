"use client";

import { type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { BaseExecutionNode } from "../base-execution-node";
import { RouteIcon } from "lucide-react";

export const SwitchNode = memo((props: NodeProps) => {
  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={RouteIcon}
      name="Switch"
      status="initial"
      description="Route based on value"
    />
  );
});

SwitchNode.displayName = "SwitchNode";
