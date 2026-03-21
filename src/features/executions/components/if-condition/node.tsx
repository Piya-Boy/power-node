"use client";

import { useReactFlow, type Node, type NodeProps, Handle, Position } from "@xyflow/react";
import { memo, useState } from "react";
import { BaseNode } from "@/components/react-flow/base-node";
import { WorkflowNode } from "@/components/workflow-node";
import { IfConditionDialog, type IfConditionFormValues } from "./dialog";
import { GitBranchIcon } from "lucide-react";

type IfConditionNodeData = {
  variableName?: string;
  field?: string;
  operator?: string;
  value?: string;
};

type IfConditionNodeType = Node<IfConditionNodeData>;

export const IfConditionNode = memo((props: NodeProps<IfConditionNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: IfConditionFormValues) => {
    setNodes((nodes) => nodes.map((node) => {
      if (node.id === props.id) {
        return { ...node, data: { ...node.data, ...values } };
      }
      return node;
    }));
  };

  const handleDelete = () => {
    setNodes((nodes) => nodes.filter((node) => node.id !== props.id));
  };

  const nodeData = props.data;
  const description = nodeData?.field
    ? `${nodeData.field} ${nodeData.operator} ${nodeData.value}`
    : "Not configured";

  return (
    <>
      <IfConditionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
      />
      <WorkflowNode
        onSettings={handleOpenSettings}
        onDelete={handleDelete}
        name="IF"
        description={description}
      >
        <BaseNode status="initial">
          <Handle type="target" position={Position.Left} />
          <div
            className="flex items-center gap-2 p-2 cursor-pointer"
            onDoubleClick={handleOpenSettings}
          >
            <GitBranchIcon className="size-5 text-yellow-500" />
          </div>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            style={{ top: "30%" }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            style={{ top: "70%" }}
          />
        </BaseNode>
      </WorkflowNode>
    </>
  );
});

IfConditionNode.displayName = "IfConditionNode";
