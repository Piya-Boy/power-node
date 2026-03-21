"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseTriggerNode } from "../base-trigger-node";
import { WebhookIcon } from "lucide-react";

export const WebhookTriggerNode = memo((props: NodeProps) => {
  return (
    <BaseTriggerNode
      {...props}
      icon={WebhookIcon}
      name="Webhook"
      description="Receives HTTP webhook requests"
    />
  );
});

WebhookTriggerNode.displayName = "WebhookTriggerNode";
