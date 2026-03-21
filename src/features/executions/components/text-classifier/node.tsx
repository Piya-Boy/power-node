"use client";

import { type Node, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { Tags } from "lucide-react";
import { BaseExecutionNode } from "../base-execution-node";

type TextClassifierNodeData = {
  variableName?: string;
  credentialId?: string;
  categories?: string;
};

type TextClassifierNodeType = Node<TextClassifierNodeData>;

export const TextClassifierNode = memo((props: NodeProps<TextClassifierNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const handleOpenSettings = () => setDialogOpen(true);

  const description = props.data?.categories
    ? `Categories: ${props.data.categories.slice(0, 40)}`
    : "Not configured";

  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={Tags}
      name="Text Classifier"
      status="initial"
      description={description}
      onSettings={handleOpenSettings}
      onDoubleClick={handleOpenSettings}
    />
  );
});

TextClassifierNode.displayName = "TextClassifierNode";
