"use client";

import { type Node, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { Heart } from "lucide-react";
import { BaseExecutionNode } from "../base-execution-node";

type SentimentNodeData = {
  variableName?: string;
  credentialId?: string;
  text?: string;
};

type SentimentNodeType = Node<SentimentNodeData>;

export const SentimentAnalysisNode = memo((props: NodeProps<SentimentNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const handleOpenSettings = () => setDialogOpen(true);

  const description = props.data?.text
    ? `Analyzing: ${props.data.text.slice(0, 30)}...`
    : "Not configured";

  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={Heart}
      name="Sentiment Analysis"
      status="initial"
      description={description}
      onSettings={handleOpenSettings}
      onDoubleClick={handleOpenSettings}
    />
  );
});

SentimentAnalysisNode.displayName = "SentimentAnalysisNode";
