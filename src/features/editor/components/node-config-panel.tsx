"use client";

import { useAtom } from "jotai";
import { selectedNodeAtom } from "../store/atoms";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NodeType } from "@/generated/prisma";

const nodeTypeLabels: Record<string, string> = {
  [NodeType.MANUAL_TRIGGER]: "Manual Trigger",
  [NodeType.GOOGLE_FORM_TRIGGER]: "Google Form Trigger",
  [NodeType.STRIPE_TRIGGER]: "Stripe Trigger",
  [NodeType.HTTP_REQUEST]: "HTTP Request",
  [NodeType.OPENAI]: "OpenAI",
  [NodeType.ANTHROPIC]: "Anthropic",
  [NodeType.GEMINI]: "Gemini",
  [NodeType.DISCORD]: "Discord",
  [NodeType.SLACK]: "Slack",
};

export function NodeConfigPanel() {
  const [selectedNode, setSelectedNode] = useAtom(selectedNodeAtom);

  if (!selectedNode) return null;

  const nodeLabel = nodeTypeLabels[selectedNode.type as string] || selectedNode.type;

  return (
    <div className="w-80 border-l bg-background flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold">{nodeLabel}</h3>
          <p className="text-xs text-muted-foreground">Node ID: {selectedNode.id.slice(0, 8)}...</p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => setSelectedNode(null)}
        >
          <XIcon className="size-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Type</p>
            <p className="text-sm">{nodeLabel}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Position</p>
            <p className="text-sm">
              x: {Math.round(selectedNode.position.x)}, y: {Math.round(selectedNode.position.y)}
            </p>
          </div>
          {selectedNode.data && Object.keys(selectedNode.data).length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Configuration</p>
              <div className="space-y-2">
                {Object.entries(selectedNode.data).map(([key, value]) => (
                  <div key={key} className="text-sm">
                    <span className="font-medium text-muted-foreground">{key}: </span>
                    <span className="break-all">
                      {typeof value === "string"
                        ? value.length > 100
                          ? `${value.slice(0, 100)}...`
                          : value
                        : JSON.stringify(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="pt-2">
            <p className="text-xs text-muted-foreground">
              Double-click or use the settings button on the node to configure it.
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
