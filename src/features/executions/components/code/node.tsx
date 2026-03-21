"use client";

import { useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { BaseExecutionNode } from "../base-execution-node";
import { CodeDialog, type CodeFormValues } from "./dialog";
import { CodeIcon } from "lucide-react";

type CodeNodeData = {
  variableName?: string;
  language?: string;
  code?: string;
};

type CodeNodeType = Node<CodeNodeData>;

export const CodeNode = memo((props: NodeProps<CodeNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: CodeFormValues) => {
    setNodes((nodes) => nodes.map((node) => {
      if (node.id === props.id) {
        return { ...node, data: { ...node.data, ...values } };
      }
      return node;
    }));
  };

  const nodeData = props.data;
  const description = nodeData?.language
    ? `${nodeData.language}: ${(nodeData.code || "").slice(0, 30)}...`
    : "Not configured";

  return (
    <>
      <CodeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
      />
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={CodeIcon}
        name="Code"
        status="initial"
        description={description}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

CodeNode.displayName = "CodeNode";
