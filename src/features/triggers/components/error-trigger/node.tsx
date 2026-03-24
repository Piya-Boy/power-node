"use client";

import { type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { BugIcon } from "lucide-react";
import { memo, useState } from "react";
import { BaseTriggerNode } from "../base-trigger-node";
import { ErrorTriggerDialog, type ErrorTriggerFormValues } from "./dialog";

type ErrorTriggerNodeData = {
  variableName?: string;
  sourceWorkflowId?: string;
  messageIncludes?: string;
};

type ErrorTriggerNodeType = Node<ErrorTriggerNodeData>;

export const ErrorTriggerNode = memo(
  (props: NodeProps<ErrorTriggerNodeType>) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const { setNodes } = useReactFlow();

    const handleSubmit = (values: ErrorTriggerFormValues) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== props.id) {
            return node;
          }

          return {
            ...node,
            data: {
              ...node.data,
              ...values,
            },
          };
        }),
      );
    };

    const summary =
      props.data?.sourceWorkflowId || props.data?.messageIncludes
        ? [
            props.data?.sourceWorkflowId
              ? `Workflow: ${props.data.sourceWorkflowId}`
              : null,
            props.data?.messageIncludes
              ? `Message: ${props.data.messageIncludes}`
              : null,
          ]
            .filter(Boolean)
            .join(" • ")
        : "Runs when another workflow fails";

    return (
      <>
        <ErrorTriggerDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSubmit={handleSubmit}
          defaultValues={props.data}
        />
        <BaseTriggerNode
          {...props}
          icon={BugIcon}
          name="On Workflow Error"
          description={summary}
          onSettings={() => setDialogOpen(true)}
          onDoubleClick={() => setDialogOpen(true)}
        />
      </>
    );
  },
);

ErrorTriggerNode.displayName = "ErrorTriggerNode";
