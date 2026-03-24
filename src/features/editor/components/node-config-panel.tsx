"use client";

import { useAtom } from "jotai";
import { BugIcon, PinIcon, PlayIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  getPinnedDataState,
  setPinnedDataState,
  stringifyPinnedData,
} from "@/features/workflows/lib/debug-execution";
import { NodeType } from "@/generated/prisma";
import { selectedNodeAtom } from "../store/atoms";

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

const isJsonObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const parsePinnedData = (
  value: string,
): {
  data: Record<string, unknown> | null;
  error: string | null;
} => {
  const trimmed = value.trim();

  if (!trimmed) {
    return { data: {}, error: null };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isJsonObject(parsed)) {
      return {
        data: null,
        error:
          "Pinned data must be a JSON object so it can be merged into the workflow context.",
      };
    }

    return {
      data: parsed,
      error: null,
    };
  } catch {
    return {
      data: null,
      error: "Pinned data must be valid JSON.",
    };
  }
};

export function NodeConfigPanel({
  debugStartNodeId,
  isExecuting,
  onExecuteFromNode,
  onSetDebugStartNode,
  onUpdateNodeData,
}: {
  debugStartNodeId: string | null;
  isExecuting: boolean;
  onExecuteFromNode: (nodeId: string) => void;
  onSetDebugStartNode: (nodeId: string | null) => void;
  onUpdateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
}) {
  const [selectedNode, setSelectedNode] = useAtom(selectedNodeAtom);
  const pinnedDataState = getPinnedDataState(selectedNode?.data);
  const [pinnedDataText, setPinnedDataText] = useState(
    stringifyPinnedData(pinnedDataState.value),
  );
  const [pinnedDataError, setPinnedDataError] = useState<string | null>(null);

  useEffect(() => {
    setPinnedDataText(stringifyPinnedData(pinnedDataState.value));
    setPinnedDataError(null);
  }, [pinnedDataState.value]);

  if (!selectedNode) return null;

  const nodeLabel =
    nodeTypeLabels[selectedNode.type as string] || selectedNode.type;
  const isDebugStartNode = debugStartNodeId === selectedNode.id;

  const persistPinnedData = (nextText: string, enabled: boolean): boolean => {
    const parsedPinnedData = parsePinnedData(nextText);
    setPinnedDataError(parsedPinnedData.error);

    if (!parsedPinnedData.data) {
      return false;
    }

    onUpdateNodeData(
      selectedNode.id,
      setPinnedDataState(selectedNode.data, {
        enabled,
        value: parsedPinnedData.data,
      }),
    );

    return true;
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
        <div className="p-4 space-y-6">
          <div className="space-y-4">
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
                  {Object.entries(selectedNode.data)
                    .filter(([key]) => key !== "__powernode")
                    .map(([key, value]) => (
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
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <PinIcon className="size-4" />
                  Pinned Mock Data
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Skip this node&apos;s live execution and merge fixed JSON into
                  the workflow context.
                </p>
              </div>
              <Switch
                checked={pinnedDataState.enabled}
                onCheckedChange={(checked) => {
                  persistPinnedData(pinnedDataText, checked);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="pinned-data-json"
                className="text-xs text-muted-foreground"
              >
                Context patch JSON
              </Label>
              <Textarea
                id="pinned-data-json"
                className="min-h-40 font-mono text-xs"
                value={pinnedDataText}
                onChange={(event) => {
                  const nextText = event.target.value;
                  setPinnedDataText(nextText);
                  persistPinnedData(nextText, pinnedDataState.enabled);
                }}
                placeholder={`{\n  "repoData": {\n    "items": []\n  }\n}`}
              />
              {pinnedDataError ? (
                <p className="text-xs text-destructive">{pinnedDataError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Use an object keyed by the variables downstream nodes expect.
                </p>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                setPinnedDataText("{}");
                setPinnedDataError(null);
                onUpdateNodeData(
                  selectedNode.id,
                  setPinnedDataState(selectedNode.data, null),
                );
              }}
            >
              Clear pinned data
            </Button>
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <BugIcon className="size-4" />
                Debug Mode
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Start execution from this node. Upstream pinned data is
                preloaded automatically.
              </p>
            </div>

            {isDebugStartNode && (
              <Alert>
                <AlertTitle>Debug start node</AlertTitle>
                <AlertDescription>
                  This node is currently the entry point for debug runs.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button
                variant={isDebugStartNode ? "secondary" : "outline"}
                className="flex-1"
                onClick={() =>
                  onSetDebugStartNode(isDebugStartNode ? null : selectedNode.id)
                }
              >
                {isDebugStartNode ? "Clear debug start" : "Set as debug start"}
              </Button>
              <Button
                className="flex-1"
                disabled={isExecuting || Boolean(pinnedDataError)}
                onClick={() => {
                  onSetDebugStartNode(selectedNode.id);
                  onExecuteFromNode(selectedNode.id);
                }}
              >
                <PlayIcon className="size-4" />
                Run from here
              </Button>
            </div>
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
