"use client";

import { useReactFlow } from "@xyflow/react";
import { ArrowUp, Loader2, Mic, Plus, XIcon } from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type GenerateWorkflowModelId,
  generateWorkflowFromPrompt,
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

const MODEL_OPTIONS: { id: GenerateWorkflowModelId; label: string }[] = [
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
];

export function AiWorkflowDialog({
  open,
  onOpenChange,
  apiKey,
}: AiWorkflowDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [modelId, setModelId] = useState<GenerateWorkflowModelId>("gpt-4o");
  const [examplesOpen, setExamplesOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { setNodes, setEdges } = useReactFlow();

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 44), 200)}px`;
  }, []);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(resizeTextarea);
    }
  }, [open, resizeTextarea]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a workflow description");
      return;
    }

    if (!apiKey) {
      toast.error(
        "OpenAI API key is required. Add an OpenAI credential first.",
      );
      return;
    }

    setIsGenerating(true);

    try {
      const workflow = await generateWorkflowFromPrompt(prompt, apiKey, {
        modelId,
      });

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
      toast.error(
        "Failed to generate workflow. Check your API key and try again.",
      );
    } finally {
      setIsGenerating(false);
    }
  }, [apiKey, modelId, onOpenChange, prompt, setEdges, setNodes]);

  const onTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isGenerating && prompt.trim()) {
        void handleGenerate();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="fixed top-auto bottom-6 left-1/2 z-50 flex w-[min(42rem,calc(100vw-2rem))] max-w-none -translate-x-1/2 translate-y-0 flex-col gap-3 border-0 bg-transparent p-0 shadow-none duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 sm:max-w-none"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          textareaRef.current?.focus();
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>AI Workflow Generator</DialogTitle>
          <DialogDescription>
            Describe what you want your workflow to do; AI will create nodes and
            connections. Press Enter to generate, Shift+Enter for a new line.
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex w-full flex-col items-stretch">
          <DialogClose asChild>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute -top-11 right-0 size-9 rounded-full shadow-md"
              aria-label="Close"
            >
              <XIcon className="size-4" />
            </Button>
          </DialogClose>

          <TooltipProvider delayDuration={300}>
            <section
              className="flex w-full items-end gap-1 rounded-3xl border bg-background px-2 py-2 shadow-lg sm:gap-2 sm:px-3 sm:py-2.5"
              aria-label="AI workflow composer"
            >
              <div className="flex shrink-0 items-center gap-0.5 pb-1 sm:gap-1">
                <Popover open={examplesOpen} onOpenChange={setExamplesOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0 rounded-full"
                      disabled={isGenerating}
                      aria-label="Try an example prompt"
                    >
                      <Plus className="size-5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-80 p-2"
                    align="start"
                    side="top"
                    sideOffset={8}
                  >
                    <p className="mb-2 px-2 text-xs font-medium text-muted-foreground">
                      Try an example
                    </p>
                    <ul className="max-h-64 space-y-1 overflow-y-auto">
                      {examplePrompts.map((example) => (
                        <li key={example}>
                          <button
                            type="button"
                            className="w-full rounded-md px-2 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                            onClick={() => {
                              setPrompt(example);
                              setExamplesOpen(false);
                              requestAnimationFrame(resizeTextarea);
                            }}
                          >
                            {example}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </PopoverContent>
                </Popover>
              </div>

              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  requestAnimationFrame(resizeTextarea);
                }}
                onKeyDown={onTextareaKeyDown}
                placeholder="What would you like to change or create?"
                disabled={isGenerating}
                rows={1}
                className="placeholder:text-muted-foreground/80 min-h-[44px] max-h-[200px] min-w-0 flex-1 resize-none border-0 bg-transparent py-2.5 text-sm leading-snug outline-none focus-visible:ring-0 disabled:opacity-50"
                aria-label="Workflow description"
              />

              <div className="flex shrink-0 items-center gap-0.5 pb-1 sm:gap-1">
                <Select
                  value={modelId}
                  onValueChange={(v) =>
                    setModelId(v as GenerateWorkflowModelId)
                  }
                  disabled={isGenerating}
                >
                  <SelectTrigger
                    size="sm"
                    className="h-8 max-w-[7.5rem] border-0 bg-muted/60 text-xs shadow-none sm:max-w-[9rem]"
                    aria-label="Model"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" side="top" align="end">
                    {MODEL_OPTIONS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0 rounded-full"
                        disabled
                        aria-label="Voice input (coming soon)"
                      >
                        <Mic className="size-5" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Coming soon</TooltipContent>
                </Tooltip>

                <Button
                  type="button"
                  size="icon"
                  className="size-10 shrink-0 rounded-full"
                  onClick={() => void handleGenerate()}
                  disabled={isGenerating || !prompt.trim()}
                  aria-label="Generate workflow"
                >
                  {isGenerating ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <ArrowUp className="size-5" />
                  )}
                </Button>
              </div>
            </section>
          </TooltipProvider>
        </div>
      </DialogContent>
    </Dialog>
  );
}
