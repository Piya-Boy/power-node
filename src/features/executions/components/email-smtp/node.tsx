"use client";

import { type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { memo, useState } from "react";
import { Mail } from "lucide-react";
import { BaseExecutionNode } from "../base-execution-node";
import { EmailSmtpDialog, type EmailSmtpFormValues } from "./dialog";

type EmailSmtpNodeData = {
  variableName?: string;
  credentialId?: string;
  to?: string;
  subject?: string;
  body?: string;
  isHtml?: boolean;
};

type EmailSmtpNodeType = Node<EmailSmtpNodeData>;

export const EmailSmtpNode = memo((props: NodeProps<EmailSmtpNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const handleOpenSettings = () => setDialogOpen(true);
  const handleSubmit = (values: EmailSmtpFormValues) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === props.id ? { ...node, data: { ...node.data, ...values } } : node,
      ),
    );
  };

  const description = props.data?.to
    ? `To: ${props.data.to.slice(0, 30)}`
    : "Not configured";

  return (
    <>
      <EmailSmtpDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={props.data}
      />
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={Mail}
        name="Email (SMTP)"
        status="initial"
        description={description}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

EmailSmtpNode.displayName = "EmailSmtpNode";
