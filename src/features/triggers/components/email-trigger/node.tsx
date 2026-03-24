"use client";

import { type Node, type NodeProps, useReactFlow } from "@xyflow/react";
import { MailIcon } from "lucide-react";
import { memo, useState } from "react";
import { BaseTriggerNode } from "../base-trigger-node";
import { EmailTriggerDialog, type EmailTriggerFormValues } from "./dialog";

type EmailTriggerNodeData = {
  variableName?: string;
  credentialId?: string;
  mailbox?: string;
  from?: string;
  subject?: string;
  unseenOnly?: boolean;
  markAsSeen?: boolean;
  maxMessages?: number;
};

type EmailTriggerNodeType = Node<EmailTriggerNodeData>;

export const EmailTriggerNode = memo(
  (props: NodeProps<EmailTriggerNodeType>) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const { setNodes } = useReactFlow();

    const handleSubmit = (values: EmailTriggerFormValues) => {
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

    const summary = [
      props.data?.mailbox || "INBOX",
      props.data?.from ? `from ${props.data.from}` : null,
      props.data?.subject ? `subject ${props.data.subject}` : null,
    ]
      .filter(Boolean)
      .join(" • ");

    return (
      <>
        <EmailTriggerDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSubmit={handleSubmit}
          defaultValues={props.data}
        />
        <BaseTriggerNode
          {...props}
          icon={MailIcon}
          name="On New Email"
          description={summary || "Polls an IMAP inbox"}
          onSettings={() => setDialogOpen(true)}
          onDoubleClick={() => setDialogOpen(true)}
        />
      </>
    );
  },
);

EmailTriggerNode.displayName = "EmailTriggerNode";
