"use client";

import { type Node, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";
import { MessageCircle } from "lucide-react";
import { BaseNode, BaseNodeContent } from "@/components/react-flow/base-node";
import { BaseHandle } from "@/components/react-flow/base-handle";
import { WorkflowNode } from "@/components/workflow-node";

type ChatTriggerNodeData = Record<string, unknown>;
type ChatTriggerNodeType = Node<ChatTriggerNodeData>;

export const ChatTriggerNode = memo((props: NodeProps<ChatTriggerNodeType>) => {
  return (
    <WorkflowNode name="Chat Trigger" description="Runs when a chat message is received">
      <BaseNode>
        <BaseNodeContent>
          <MessageCircle className="size-4 text-muted-foreground" />
          <BaseHandle
            id="source-1"
            type="source"
            position={Position.Right}
          />
        </BaseNodeContent>
      </BaseNode>
    </WorkflowNode>
  );
});

ChatTriggerNode.displayName = "ChatTriggerNode";
