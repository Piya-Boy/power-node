"use client";

import { type Node, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { HardDrive } from "lucide-react";
import { BaseExecutionNode } from "../base-execution-node";

type GoogleDriveNodeData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
};

type GoogleDriveNodeType = Node<GoogleDriveNodeData>;

export const GoogleDriveNode = memo((props: NodeProps<GoogleDriveNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const handleOpenSettings = () => setDialogOpen(true);

  const description = props.data?.operation
    ? `${props.data.operation.replace(/_/g, " ")}`
    : "Not configured";

  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={HardDrive}
      name="Google Drive"
      status="initial"
      description={description}
      onSettings={handleOpenSettings}
      onDoubleClick={handleOpenSettings}
    />
  );
});

GoogleDriveNode.displayName = "GoogleDriveNode";
