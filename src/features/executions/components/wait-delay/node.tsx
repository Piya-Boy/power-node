"use client";

import { type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { BaseExecutionNode } from "../base-execution-node";
import { TimerIcon } from "lucide-react";

export const WaitDelayNode = memo((props: NodeProps) => {
  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={TimerIcon}
      name="Wait / Delay"
      status="initial"
      description="Wait before continuing"
    />
  );
});

WaitDelayNode.displayName = "WaitDelayNode";
