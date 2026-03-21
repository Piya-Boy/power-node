"use client";

import { useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { BaseExecutionNode } from "../base-execution-node";
import { FilterIcon } from "lucide-react";

type FilterNodeData = {
  variableName?: string;
  field?: string;
  operator?: string;
  value?: string;
};

export const FilterNode = memo((props: NodeProps<Node<FilterNodeData>>) => {
  const nodeData = props.data;
  const description = nodeData?.field
    ? `Filter: ${nodeData.field} ${nodeData.operator} ${nodeData.value}`
    : "Not configured";

  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={FilterIcon}
      name="Filter"
      status="initial"
      description={description}
    />
  );
});

FilterNode.displayName = "FilterNode";
