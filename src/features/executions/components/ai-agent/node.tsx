"use client";

import { type Node, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { Bot } from "lucide-react";
import { BaseExecutionNode } from "../base-execution-node";

type AiAgentNodeData = {
  variableName?: string;
  credentialId?: string;
  userPrompt?: string;
  maxSteps?: number;
};

type AiAgentNodeType = Node<AiAgentNodeData>;

export const AiAgentNode = memo((props: NodeProps<AiAgentNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const handleOpenSettings = () => setDialogOpen(true);

  const description = props.data?.userPrompt
    ? `Agent: ${props.data.userPrompt.slice(0, 40)}...`
    : "Not configured";

  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={Bot}
      name="AI Agent"
      status="initial"
      description={description}
      onSettings={handleOpenSettings}
      onDoubleClick={handleOpenSettings}
    />
  );
});

AiAgentNode.displayName = "AiAgentNode";
