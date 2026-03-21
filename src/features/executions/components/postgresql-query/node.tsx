"use client";

import { type Node, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { Database } from "lucide-react";
import { BaseExecutionNode } from "../base-execution-node";

type PostgresNodeData = {
  variableName?: string;
  credentialId?: string;
  query?: string;
};

type PostgresNodeType = Node<PostgresNodeData>;

export const PostgresqlNode = memo((props: NodeProps<PostgresNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const handleOpenSettings = () => setDialogOpen(true);

  const description = props.data?.query
    ? `${props.data.query.slice(0, 40)}...`
    : "Not configured";

  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={Database}
      name="PostgreSQL"
      status="initial"
      description={description}
      onSettings={handleOpenSettings}
      onDoubleClick={handleOpenSettings}
    />
  );
});

PostgresqlNode.displayName = "PostgresqlNode";
