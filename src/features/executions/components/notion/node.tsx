"use client";

import { type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { memo, useState } from "react";
import { BookOpen } from "lucide-react";
import { BaseExecutionNode } from "../base-execution-node";
import { NotionDialog, type NotionFormValues } from "./dialog";

type NotionNodeData = {
  variableName?: string;
  credentialId?: string;
  operation?: "query_database" | "create_page" | "update_page" | "get_page";
  databaseId?: string;
  pageId?: string;
  filter?: string;
  properties?: string;
};

type NotionNodeType = Node<NotionNodeData>;

export const NotionNode = memo((props: NodeProps<NotionNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const handleOpenSettings = () => setDialogOpen(true);
  const handleSubmit = (values: NotionFormValues) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === props.id ? { ...node, data: { ...node.data, ...values } } : node,
      ),
    );
  };

  const description = props.data?.operation
    ? `${props.data.operation.replace(/_/g, " ")}`
    : "Not configured";

  return (
    <>
      <NotionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={props.data}
      />
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={BookOpen}
        name="Notion"
        status="initial"
        description={description}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

NotionNode.displayName = "NotionNode";
