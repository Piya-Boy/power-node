"use client";

import { type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { memo, useState } from "react";
import { Table } from "lucide-react";
import { BaseExecutionNode } from "../base-execution-node";

type GoogleSheetsNodeData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
  spreadsheetId?: string;
  range?: string;
};

type GoogleSheetsNodeType = Node<GoogleSheetsNodeData>;

export const GoogleSheetsNode = memo((props: NodeProps<GoogleSheetsNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const handleOpenSettings = () => setDialogOpen(true);

  const description = props.data?.operation
    ? `${props.data.operation}: ${props.data.range || "..."}`
    : "Not configured";

  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={Table}
      name="Google Sheets"
      status="initial"
      description={description}
      onSettings={handleOpenSettings}
      onDoubleClick={handleOpenSettings}
    />
  );
});

GoogleSheetsNode.displayName = "GoogleSheetsNode";
