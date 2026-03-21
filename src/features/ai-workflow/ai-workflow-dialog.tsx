"use client";

import { useState } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  generateWorkflowFromPrompt,
  type GeneratedWorkflow,
} from "./generate-workflow";

interface AiWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: string;
}

const examplePrompts = [
  "When a webhook is received, classify the text sentiment and send a Slack notification if negative",
  "Every day at 9am, fetch GitHub issues, summarize them with AI, and email the report",
  "When a form is submitted, save to Google Sheets and send a Telegram confirmation",
  "Fetch data from an API, transform it with AI, and post results to Discord",
];

export function AiWorkflowDialog({
  open,
  onOpenChange,
  apiKey,
}: AiWorkflowDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const { setNodes, setEdges } = useReactFlow();

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a workflow description");
      return;
    }

    if (!apiKey) {
      toast.error("OpenAI API key is required. Add an OpenAI credential first.");
      return;
    }

    setIsGenerating(true);

    try {
      const workflow = await generateWorkflowFromPrompt(prompt, apiKey);

      // Convert generated workflow to React Flow nodes and edges
      const nodes = workflow.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
      }));

      const edges = workflow.connections.map((conn, i) => ({
        id: `edge_${i}`,
        source: conn.fromNodeId,
        target: conn.toNodeId,
        sourceHandle: `source-1`,
        targetHandle: `target-1`,
      }));

      setNodes(nodes);
      setEdges(edges);

      toast.success(`Workflow generated: ${workflow.summary}`);
      onOpenChange(false);
      setPrompt("");
    } catch (error) {
      console.error("Failed to generate workflow:", error);
      toast.error("Failed to generate workflow. Check your API key and try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-yellow-500" />
            AI Workflow Generator
          </DialogTitle>
          <DialogDescription>
            Describe what you want your workflow to do and AI will create it for
            you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            placeholder="Describe your workflow... e.g., 'When a webhook is received, analyze sentiment and send a Slack notification'"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[120px] font-mono text-sm"
            disabled={isGenerating}
          />

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">
              Try an example:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {examplePrompts.map((example, i) => (
                <button
                  key={i}
                  onClick={() => setPrompt(example)}
                  className="text-xs text-muted-foreground bg-muted rounded-md px-2 py-1 hover:bg-accent transition-colors text-left"
                  disabled={isGenerating}
                >
                  {example.slice(0, 60)}...
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
          >
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()}>
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 size-4" />
                Generate Workflow
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
