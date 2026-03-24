"use client";

import type { Edge, Node } from "@xyflow/react";
import {
  ArrowUp,
  Loader2,
  MessageSquareText,
  Mic,
  Plus,
  Sparkles,
  WandSparkles,
  XIcon,
} from "lucide-react";
import {
  type KeyboardEvent,
  startTransition,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCredentialsByType } from "@/features/credentials/hooks/use-credentials";
import {
  type AiWorkflowModelId,
  useAiGenerateWorkflow,
  useAiWorkflowChat,
  useAiWorkflowSuggestions,
} from "@/features/workflows/hooks/use-workflows";
import { CredentialType } from "@/generated/prisma";

interface AiWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: Node[];
  edges: Edge[];
  onApplyWorkflow: (workflow: { nodes: Node[]; edges: Edge[] }) => void;
}

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const examplePrompts = [
  "When a webhook is received, classify the text sentiment and send a Slack notification if negative",
  "Every day at 9am, fetch GitHub issues, summarize them with AI, and email the report",
  "When a form is submitted, save to Google Sheets and send a Telegram confirmation",
  "Fetch data from an API, transform it with AI, and post results to Discord",
];

const MODEL_OPTIONS: { id: AiWorkflowModelId; label: string }[] = [
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
];

function mapAiWorkflowToCanvas(workflow: {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  connections: Array<{
    fromNodeId: string;
    toNodeId: string;
    fromOutput: string;
    toInput: string;
  }>;
}) {
  return {
    nodes: workflow.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
    })),
    edges: workflow.connections.map((connection, index) => ({
      id: `edge_${connection.fromNodeId}_${connection.toNodeId}_${index}`,
      source: connection.fromNodeId,
      target: connection.toNodeId,
      sourceHandle: connection.fromOutput,
      targetHandle: connection.toInput,
    })),
  };
}

export function AiWorkflowDialog({
  open,
  onOpenChange,
  nodes,
  edges,
  onApplyWorkflow,
}: AiWorkflowDialogProps) {
  const [tab, setTab] = useState<"generate" | "suggest" | "chat">("generate");
  const [prompt, setPrompt] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [suggestionSummary, setSuggestionSummary] = useState<string | null>(
    null,
  );
  const [suggestions, setSuggestions] = useState<
    Array<{
      title: string;
      description: string;
      nodeType: string;
      prompt: string;
    }>
  >([]);
  const [pendingWorkflow, setPendingWorkflow] = useState<{
    nodes: Node[];
    edges: Edge[];
  } | null>(null);
  const [pendingWorkflowSummary, setPendingWorkflowSummary] = useState<
    string | null
  >(null);
  const [modelId, setModelId] = useState<AiWorkflowModelId>("gpt-4o");
  const [credentialId, setCredentialId] = useState("");
  const [examplesOpen, setExamplesOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const generateWorkflow = useAiGenerateWorkflow();
  const getSuggestions = useAiWorkflowSuggestions();
  const chatWithAi = useAiWorkflowChat();
  const { data: credentials, isLoading: credentialsLoading } =
    useCredentialsByType(CredentialType.OPENAI);

  const isBusy =
    generateWorkflow.isPending ||
    getSuggestions.isPending ||
    chatWithAi.isPending;

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  }, [open]);

  useEffect(() => {
    if (!credentialId && credentials?.[0]?.id) {
      setCredentialId(credentials[0].id);
    }
  }, [credentialId, credentials]);

  const applyWorkflow = useCallback(
    (workflow: { nodes: Node[]; edges: Edge[] }, successMessage: string) => {
      startTransition(() => {
        onApplyWorkflow(workflow);
      });
      setPendingWorkflow(null);
      toast.success(successMessage);
    },
    [onApplyWorkflow],
  );

  const requireCredential = useCallback(() => {
    if (credentialId) {
      return true;
    }

    toast.error("OpenAI credential is required. Add one in Credentials first.");
    return false;
  }, [credentialId]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a workflow description");
      return;
    }

    if (!requireCredential()) {
      return;
    }

    const workflow = await generateWorkflow.mutateAsync({
      prompt: prompt.trim(),
      credentialId,
      modelId,
    });

    applyWorkflow(
      mapAiWorkflowToCanvas(workflow),
      `Workflow generated: ${workflow.summary}`,
    );
    setPrompt("");
    onOpenChange(false);
  }, [
    applyWorkflow,
    credentialId,
    generateWorkflow,
    modelId,
    onOpenChange,
    prompt,
    requireCredential,
  ]);

  const handleFetchSuggestions = useCallback(async () => {
    if (!requireCredential()) {
      return;
    }

    const result = await getSuggestions.mutateAsync({
      credentialId,
      modelId,
      nodes: nodes.map((node) => ({
        id: node.id,
        type: String(node.type || ""),
        position: node.position,
        data: (node.data as Record<string, unknown>) || {},
      })),
      edges: edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
    });

    setSuggestionSummary(result.summary);
    setSuggestions(result.suggestions);
  }, [credentialId, edges, getSuggestions, modelId, nodes, requireCredential]);

  const handleSendChat = useCallback(async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a message for the workflow assistant");
      return;
    }

    if (!requireCredential()) {
      return;
    }

    const userMessage: ChatMessage = {
      role: "user",
      content: prompt.trim(),
    };

    const history = [...chatMessages, userMessage];
    setChatMessages(history);
    setPrompt("");

    const result = await chatWithAi.mutateAsync({
      prompt: userMessage.content,
      credentialId,
      modelId,
      history,
      nodes: nodes.map((node) => ({
        id: node.id,
        type: String(node.type || ""),
        position: node.position,
        data: (node.data as Record<string, unknown>) || {},
      })),
      edges: edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
    });

    setChatMessages((current) => [
      ...current,
      { role: "assistant", content: result.assistantMessage },
    ]);
    setPendingWorkflow(mapAiWorkflowToCanvas(result.workflow));
    setPendingWorkflowSummary(result.assistantMessage);
  }, [
    chatMessages,
    chatWithAi,
    credentialId,
    edges,
    modelId,
    nodes,
    prompt,
    requireCredential,
  ]);

  const handleComposerSubmit = () => {
    if (tab === "generate") {
      void handleGenerate();
      return;
    }

    if (tab === "chat") {
      void handleSendChat();
      return;
    }

    void handleFetchSuggestions();
  };

  const onTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isBusy) {
        handleComposerSubmit();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="fixed bottom-6 left-1/2 top-auto z-50 flex w-[min(52rem,calc(100vw-2rem))] max-w-none -translate-x-1/2 translate-y-0 flex-col gap-3 border-0 bg-transparent p-0 shadow-none duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 sm:max-w-none"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>AI Workflow Assistant</DialogTitle>
          <DialogDescription>
            Generate workflows, ask for suggestions, or chat with AI about
            workflow changes.
          </DialogDescription>
        </DialogHeader>

        <DialogClose asChild>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute -top-11 right-0 z-10 size-9 rounded-full shadow-md"
            aria-label="Close"
          >
            <XIcon className="size-4" />
          </Button>
        </DialogClose>

        <Tabs
          value={tab}
          onValueChange={(value) =>
            setTab(value as "generate" | "suggest" | "chat")
          }
          className="rounded-[2rem] border bg-background p-3 shadow-lg"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList className="grid w-full grid-cols-3 sm:w-[20rem]">
              <TabsTrigger value="generate" className="gap-1">
                <Sparkles className="size-4" />
                Generate
              </TabsTrigger>
              <TabsTrigger value="suggest" className="gap-1">
                <WandSparkles className="size-4" />
                Suggestions
              </TabsTrigger>
              <TabsTrigger value="chat" className="gap-1">
                <MessageSquareText className="size-4" />
                Chat
              </TabsTrigger>
            </TabsList>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                value={credentialId}
                onValueChange={setCredentialId}
                disabled={credentialsLoading || isBusy}
              >
                <SelectTrigger className="h-9 min-w-[12rem] bg-muted/60 text-xs shadow-none">
                  <SelectValue placeholder="OpenAI credential" />
                </SelectTrigger>
                <SelectContent>
                  {credentials?.map((credential) => (
                    <SelectItem key={credential.id} value={credential.id}>
                      {credential.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={modelId}
                onValueChange={(value) =>
                  setModelId(value as AiWorkflowModelId)
                }
                disabled={isBusy}
              >
                <SelectTrigger className="h-9 min-w-[8rem] bg-muted/60 text-xs shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" side="top" align="end">
                  {MODEL_OPTIONS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <TabsContent value="generate" className="mt-3 space-y-3">
            <div className="rounded-2xl border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
              Describe the workflow you want from scratch. AI will generate a
              fresh canvas and replace the current nodes when you submit.
            </div>
          </TabsContent>

          <TabsContent value="suggest" className="mt-3 space-y-3">
            <div className="rounded-2xl border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
              Ask AI to review the current workflow and suggest the most useful
              next steps. Click a suggestion to continue in chat.
            </div>

            {suggestionSummary ? (
              <div className="rounded-2xl border bg-muted/20 p-3 text-sm">
                {suggestionSummary}
              </div>
            ) : null}

            {suggestions.length > 0 ? (
              <div className="grid gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.title}-${suggestion.nodeType}`}
                    type="button"
                    className="rounded-2xl border p-3 text-left transition-colors hover:bg-accent"
                    onClick={() => {
                      setTab("chat");
                      setPrompt(suggestion.prompt);
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{suggestion.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {suggestion.description}
                        </p>
                      </div>
                      <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium">
                        {suggestion.nodeType}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="chat" className="mt-3 space-y-3">
            <div className="rounded-2xl border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
              Tell AI how to improve the current workflow. It will return a
              suggested workflow update that you can review and apply.
            </div>

            {chatMessages.length > 0 ? (
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border bg-muted/20 p-3">
                {chatMessages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      message.role === "assistant"
                        ? "bg-background"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {message.content}
                  </div>
                ))}
              </div>
            ) : null}

            {pendingWorkflow ? (
              <div className="rounded-2xl border bg-background p-3">
                <div className="mb-3">
                  <p className="font-medium">Suggested workflow update</p>
                  {pendingWorkflowSummary ? (
                    <p className="text-sm text-muted-foreground">
                      {pendingWorkflowSummary}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  onClick={() =>
                    applyWorkflow(
                      pendingWorkflow,
                      "Applied AI workflow changes to the canvas",
                    )
                  }
                >
                  Apply changes
                </Button>
              </div>
            ) : null}
          </TabsContent>

          <TooltipProvider delayDuration={300}>
            <section
              className="mt-3 flex w-full items-end gap-2 rounded-3xl border bg-background px-3 py-2.5"
              aria-label="AI workflow composer"
            >
              <div className="flex shrink-0 items-center gap-1 pb-1">
                <Popover open={examplesOpen} onOpenChange={setExamplesOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0 rounded-full"
                      disabled={isBusy || tab !== "generate"}
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

              <Textarea
                ref={textareaRef}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={onTextareaKeyDown}
                placeholder={
                  tab === "generate"
                    ? "What would you like to create?"
                    : tab === "suggest"
                      ? "Press Enter to review the current workflow"
                      : "What would you like to change in this workflow?"
                }
                disabled={
                  isBusy || (tab === "suggest" && suggestions.length > 0)
                }
                rows={1}
                className="min-h-[44px] max-h-[200px] flex-1 resize-none border-0 bg-transparent py-2.5 text-sm leading-snug shadow-none outline-none focus-visible:ring-0"
                aria-label="Workflow assistant prompt"
              />

              <div className="flex shrink-0 items-center gap-1 pb-1">
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
                  onClick={handleComposerSubmit}
                  disabled={
                    isBusy ||
                    !credentialId ||
                    (tab !== "suggest" && !prompt.trim())
                  }
                  aria-label="Run AI workflow action"
                >
                  {isBusy ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <ArrowUp className="size-5" />
                  )}
                </Button>
              </div>
            </section>
          </TooltipProvider>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
