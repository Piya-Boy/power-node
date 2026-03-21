"use client";

import { type Node, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { FileSearch } from "lucide-react";
import { BaseExecutionNode } from "../base-execution-node";

type InfoExtractorNodeData = {
  variableName?: string;
  credentialId?: string;
  text?: string;
};

type InfoExtractorNodeType = Node<InfoExtractorNodeData>;

export const InformationExtractorNode = memo((props: NodeProps<InfoExtractorNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const handleOpenSettings = () => setDialogOpen(true);

  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={FileSearch}
      name="Info Extractor"
      status="initial"
      description="Extract structured data from text"
      onSettings={handleOpenSettings}
      onDoubleClick={handleOpenSettings}
    />
  );
});

InformationExtractorNode.displayName = "InformationExtractorNode";
