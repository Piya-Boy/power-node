"use client";

import { useAtom } from "jotai";
import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { NodeType } from "@/generated/prisma";
import {
  debugStartNodeAtom,
  pinnedDataAtom,
  selectedNodeAtom,
} from "../store/atoms";

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
  const [pinnedData, setPinnedData] = useAtom(pinnedDataAtom);
  const [debugStartNode, setDebugStartNode] = useAtom(debugStartNodeAtom);
  const [mockDataDraft, setMockDataDraft] = useState("");
  const pinnedValue = selectedNode ? pinnedData[selectedNode.id] : undefined;

  useEffect(() => {
    if (pinnedValue === undefined) {
      setMockDataDraft("");
      return;
    }

    setMockDataDraft(JSON.stringify(pinnedValue, null, 2));
  }, [pinnedValue]);

  if (!selectedNode) return null;

  const nodeLabel =
    nodeTypeLabels[selectedNode.type as string] || selectedNode.type;
  const isDebugStartNode = debugStartNode === selectedNode.id;

  const handleSavePinnedData = () => {
    const value = mockDataDraft.trim();

    if (!value) {
      setPinnedData((current) => {
        const next = { ...current };
        delete next[selectedNode.id];
        return next;
      });
      toast.success(`Cleared pinned output for ${nodeLabel}`);
      return;
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      setPinnedData((current) => ({
        ...current,
        [selectedNode.id]: parsed,
      }));
      toast.success(`Pinned mock output saved for ${nodeLabel}`);
    } catch {
      toast.error("Mock output must be valid JSON");
    }
  };

  const handleClearPinnedData = () => {
    setPinnedData((current) => {
      const next = { ...current };
      delete next[selectedNode.id];
      return next;
    });
    setMockDataDraft("");
    toast.success(`Removed pinned output for ${nodeLabel}`);
  };

  const handleToggleDebugStartNode = () => {
    setDebugStartNode((current) =>
      current === selectedNode.id ? null : selectedNode.id,
    );
    toast.success(
      isDebugStartNode
        ? "Debug start node cleared"
        : `Debug runs will start from ${nodeLabel}`,
    );
  };

  return (
    <div className="w-80 border-l bg-background flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold">{nodeLabel}</h3>
          <p className="text-xs text-muted-foreground">
            Node ID: {selectedNode.id.slice(0, 8)}...
          </p>
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
          <div className="flex flex-wrap gap-2">
            {isDebugStartNode && <Badge variant="secondary">Debug start</Badge>}
            {pinnedValue !== undefined && (
              <Badge variant="outline">Pinned output</Badge>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Type
            </p>
            <p className="text-sm">{nodeLabel}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Position
            </p>
            <p className="text-sm">
              x: {Math.round(selectedNode.position.x)}, y:{" "}
              {Math.round(selectedNode.position.y)}
            </p>
          </div>
          {selectedNode.data && Object.keys(selectedNode.data).length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Configuration
              </p>
              <div className="space-y-2">
                {Object.entries(selectedNode.data).map(([key, value]) => (
                  <div key={key} className="text-sm">
                    <span className="font-medium text-muted-foreground">
                      {key}:{" "}
                    </span>
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
          <div className="space-y-3 rounded-lg border p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Debug mode</p>
              <p className="text-xs text-muted-foreground">
                Re-run the workflow from this node onward.
              </p>
            </div>
            <Button
              size="sm"
              variant={isDebugStartNode ? "secondary" : "outline"}
              className="w-full"
              onClick={handleToggleDebugStartNode}
            >
              {isDebugStartNode
                ? "Clear debug start node"
                : "Start debug run here"}
            </Button>
          </div>
          <div className="space-y-3 rounded-lg border p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Pinned mock output</p>
              <p className="text-xs text-muted-foreground">
                Skip this node during execution and inject the JSON below as its
                output.
              </p>
            </div>
            <Textarea
              value={mockDataDraft}
              onChange={(event) => setMockDataDraft(event.target.value)}
              placeholder={`{\n  "ok": true\n}`}
              className="min-h-32 font-mono text-xs"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={handleSavePinnedData}
              >
                Save mock output
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={handleClearPinnedData}
                disabled={
                  pinnedValue === undefined && mockDataDraft.length === 0
                }
              >
                Clear
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Mocked data is exposed through the node id and its{" "}
              <code>variableName</code> when present.
            </p>
          </div>
          <div className="pt-2">
            <p className="text-xs text-muted-foreground">
              Double-click or use the settings button on the node to configure
              it.
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
