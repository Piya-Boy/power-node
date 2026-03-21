"use client";

import { type Node, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { Send } from "lucide-react";
import { BaseExecutionNode } from "../base-execution-node";
import { TelegramDialog, type TelegramFormValues } from "./dialog";
import { useReactFlow } from "@xyflow/react";

type TelegramNodeData = {
  variableName?: string;
  credentialId?: string;
  chatId?: string;
  message?: string;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
};

type TelegramNodeType = Node<TelegramNodeData>;

export const TelegramNode = memo((props: NodeProps<TelegramNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: TelegramFormValues) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === props.id
          ? { ...node, data: { ...node.data, ...values } }
          : node,
      ),
    );
  };

  const description = props.data?.chatId
    ? `Chat: ${props.data.chatId}`
    : "Not configured";

  return (
    <>
      <TelegramDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={props.data}
      />
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={Send}
        name="Telegram"
        status="initial"
        description={description}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

TelegramNode.displayName = "TelegramNode";
