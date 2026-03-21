"use client";

import { type Node, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { Calendar } from "lucide-react";
import { BaseExecutionNode } from "../base-execution-node";

type GoogleCalendarNodeData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
};

type GoogleCalendarNodeType = Node<GoogleCalendarNodeData>;

export const GoogleCalendarNode = memo((props: NodeProps<GoogleCalendarNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const handleOpenSettings = () => setDialogOpen(true);

  const description = props.data?.operation
    ? `${props.data.operation.replace(/_/g, " ")}`
    : "Not configured";

  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={Calendar}
      name="Google Calendar"
      status="initial"
      description={description}
      onSettings={handleOpenSettings}
      onDoubleClick={handleOpenSettings}
    />
  );
});

GoogleCalendarNode.displayName = "GoogleCalendarNode";
