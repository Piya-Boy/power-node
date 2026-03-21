"use client";

import { memo, useState } from "react";
import { useReactFlow, type NodeProps, type Node } from "@xyflow/react";
import { BaseTriggerNode } from "../base-trigger-node";
import { ClockIcon } from "lucide-react";

export const ScheduleTriggerNode = memo((props: NodeProps) => {
  return (
    <BaseTriggerNode
      {...props}
      icon={ClockIcon}
      name="Schedule"
      description="Runs on a schedule (cron)"
    />
  );
});

ScheduleTriggerNode.displayName = "ScheduleTriggerNode";
