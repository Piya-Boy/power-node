"use client";

import { type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { memo, useState } from "react";
import { BaseExecutionNode } from "../base-execution-node";

type GitHubNodeData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
  owner?: string;
  repo?: string;
};

type GitHubNodeType = Node<GitHubNodeData>;

export const GitHubNode = memo((props: NodeProps<GitHubNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const handleOpenSettings = () => setDialogOpen(true);

  const description = props.data?.operation
    ? `${props.data.operation.replace(/_/g, " ")}${props.data.repo ? `: ${props.data.owner}/${props.data.repo}` : ""}`
    : "Not configured";

  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon="/logos/github.svg"
      name="GitHub"
      status="initial"
      description={description}
      onSettings={handleOpenSettings}
      onDoubleClick={handleOpenSettings}
    />
  );
});

GitHubNode.displayName = "GitHubNode";
