"use client";

import { type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { ServerIcon } from "lucide-react";
import { memo, useState } from "react";
import { BaseExecutionNode } from "../base-execution-node";
import { useNodeStatus } from "../../hooks/use-node-status";
import { MCP_SERVER_CHANNEL_NAME } from "@/inngest/channels/mcp-server";
import { fetchMcpServerRealtimeToken } from "./actions";

type McpServerNodeData = {
  variableName?: string;
  serverUrl?: string;
  toolName?: string;
  auth?: {
    type: "bearer" | "api_key" | "none";
    bearerToken?: string;
    apiKey?: string;
  };
  toolArgs?: string;
};

type McpServerNodeType = Node<McpServerNodeData>;

export const McpServerNode = memo((props: NodeProps<McpServerNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: MCP_SERVER_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchMcpServerRealtimeToken,
  });

  const handleOpenSettings = () => setDialogOpen(true);

  const nodeData = props.data;
  const description = nodeData?.toolName
    ? `${nodeData.toolName}${nodeData.serverUrl ? ` @ ${nodeData.serverUrl}` : ""}`
    : "Not configured";

  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={ServerIcon}
      name="MCP Server"
      status={nodeStatus}
      description={description}
      onSettings={handleOpenSettings}
      onDoubleClick={handleOpenSettings}
    />
  );
});

McpServerNode.displayName = "McpServerNode";
