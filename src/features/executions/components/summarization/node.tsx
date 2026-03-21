"use client";

import { type Node, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { FileText } from "lucide-react";
import { BaseExecutionNode } from "../base-execution-node";

type SummarizationNodeData = {
  variableName?: string;
  credentialId?: string;
  style?: string;
};

type SummarizationNodeType = Node<SummarizationNodeData>;

export const SummarizationNode = memo((props: NodeProps<SummarizationNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const handleOpenSettings = () => setDialogOpen(true);

  const description = props.data?.style
    ? `Style: ${props.data.style}`
    : "Brief summary (default)";

  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={FileText}
      name="Summarize"
      status="initial"
      description={description}
      onSettings={handleOpenSettings}
      onDoubleClick={handleOpenSettings}
    />
  );
});

SummarizationNode.displayName = "SummarizationNode";
