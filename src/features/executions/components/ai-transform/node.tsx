"use client";

import { type Node, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { Sparkles } from "lucide-react";
import { BaseExecutionNode } from "../base-execution-node";

type AiTransformNodeData = {
  variableName?: string;
  credentialId?: string;
  instruction?: string;
  outputFormat?: string;
};

type AiTransformNodeType = Node<AiTransformNodeData>;

export const AiTransformNode = memo((props: NodeProps<AiTransformNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const handleOpenSettings = () => setDialogOpen(true);

  const description = props.data?.instruction
    ? `${props.data.instruction.slice(0, 40)}...`
    : "Not configured";

  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={Sparkles}
      name="AI Transform"
      status="initial"
      description={description}
      onSettings={handleOpenSettings}
      onDoubleClick={handleOpenSettings}
    />
  );
});

AiTransformNode.displayName = "AiTransformNode";
