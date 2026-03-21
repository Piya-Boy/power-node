"use client";

import { type Node, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { Cpu } from "lucide-react";
import { BaseExecutionNode } from "../base-execution-node";

type OllamaNodeData = {
  variableName?: string;
  model?: string;
  userPrompt?: string;
};

type OllamaNodeType = Node<OllamaNodeData>;

export const OllamaNode = memo((props: NodeProps<OllamaNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const handleOpenSettings = () => setDialogOpen(true);

  const description = props.data?.model
    ? `${props.data.model}`
    : "llama3.2 (default)";

  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={Cpu}
      name="Ollama"
      status="initial"
      description={description}
      onSettings={handleOpenSettings}
      onDoubleClick={handleOpenSettings}
    />
  );
});

OllamaNode.displayName = "OllamaNode";
