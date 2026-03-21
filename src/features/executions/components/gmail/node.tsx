"use client";

import { type Node, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { Mail } from "lucide-react";
import { BaseExecutionNode } from "../base-execution-node";

type GmailNodeData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
};

type GmailNodeType = Node<GmailNodeData>;

export const GmailNode = memo((props: NodeProps<GmailNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const handleOpenSettings = () => setDialogOpen(true);

  const description = props.data?.operation
    ? `${props.data.operation}`
    : "Not configured";

  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={Mail}
      name="Gmail"
      status="initial"
      description={description}
      onSettings={handleOpenSettings}
      onDoubleClick={handleOpenSettings}
    />
  );
});

GmailNode.displayName = "GmailNode";
