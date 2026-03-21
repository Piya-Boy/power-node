"use client";

import { type Node, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { Database } from "lucide-react";
import { BaseExecutionNode } from "../base-execution-node";

type MysqlNodeData = {
  variableName?: string;
  credentialId?: string;
  query?: string;
};

type MysqlNodeType = Node<MysqlNodeData>;

export const MysqlNode = memo((props: NodeProps<MysqlNodeType>) => {
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
      name="MySQL"
      status="initial"
      description={description}
      onSettings={handleOpenSettings}
      onDoubleClick={handleOpenSettings}
    />
  );
});

MysqlNode.displayName = "MysqlNode";
