"use client";

import { type Node, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { Braces } from "lucide-react";
import { BaseExecutionNode } from "../base-execution-node";

type GraphQLNodeData = {
  variableName?: string;
  endpoint?: string;
  query?: string;
};

type GraphQLNodeType = Node<GraphQLNodeData>;

export const GraphQLNode = memo((props: NodeProps<GraphQLNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const handleOpenSettings = () => setDialogOpen(true);

  const description = props.data?.endpoint
    ? `${props.data.endpoint.slice(0, 40)}`
    : "Not configured";

  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={Braces}
      name="GraphQL"
      status="initial"
      description={description}
      onSettings={handleOpenSettings}
      onDoubleClick={handleOpenSettings}
    />
  );
});

GraphQLNode.displayName = "GraphQLNode";
