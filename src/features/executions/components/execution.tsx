"use client";

import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle2Icon,
  ClockIcon,
  Loader2Icon,
  SparklesIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCredentialsByType } from "@/features/credentials/hooks/use-credentials";
import {
  useAiAutoFixExecution,
  useSuspenseExecution,
} from "@/features/executions/hooks/use-executions";
import {
  type AiWorkflowModelId,
  useUpdateWorkflow,
} from "@/features/workflows/hooks/use-workflows";
import { CredentialType, ExecutionStatus } from "@/generated/prisma";

const MODEL_OPTIONS: { id: AiWorkflowModelId; label: string }[] = [
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
];

const getStatusIcon = (status: ExecutionStatus) => {
  switch (status) {
    case ExecutionStatus.SUCCESS:
      return <CheckCircle2Icon className="size-5 text-green-600" />;
    case ExecutionStatus.FAILED:
      return <XCircleIcon className="size-5 text-red-600" />;
    case ExecutionStatus.RUNNING:
      return <Loader2Icon className="size-5 animate-spin text-blue-600" />;
    default:
      return <ClockIcon className="size-5 text-muted-foreground" />;
  }
};

const formatStatus = (status: ExecutionStatus) => {
  return status.charAt(0) + status.slice(1).toLowerCase();
};

export const ExecutionView = ({ executionId }: { executionId: string }) => {
  const { data: execution } = useSuspenseExecution(executionId);
  const [showStackTrace, setShowStackTrace] = useState(false);
  const [credentialId, setCredentialId] = useState("");
  const [modelId, setModelId] = useState<AiWorkflowModelId>("gpt-4o");
  const [fixResult, setFixResult] = useState<{
    assistantMessage: string;
    fixes: string[];
    workflow: {
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
    };
    workflowId: string;
  } | null>(null);

  const { data: openAiCredentials } = useCredentialsByType(
    CredentialType.OPENAI,
  );
  const autoFixExecution = useAiAutoFixExecution();
  const updateWorkflow = useUpdateWorkflow();

  useEffect(() => {
    if (!credentialId && openAiCredentials?.[0]?.id) {
      setCredentialId(openAiCredentials[0].id);
    }
  }, [credentialId, openAiCredentials]);

  const duration = execution.completedAt
    ? Math.round(
        (new Date(execution.completedAt).getTime() -
          new Date(execution.startedAt).getTime()) /
          1000,
      )
    : null;

  const handleAutoFix = async () => {
    if (!credentialId) {
      return;
    }

    const result = await autoFixExecution.mutateAsync({
      id: execution.id,
      credentialId,
      modelId,
    });

    setFixResult(result);
  };

  const handleApplyFix = async () => {
    if (!fixResult) {
      return;
    }

    await updateWorkflow.mutateAsync({
      id: fixResult.workflowId,
      nodes: fixResult.workflow.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
      })),
      edges: fixResult.workflow.connections.map((connection) => ({
        source: connection.fromNodeId,
        target: connection.toNodeId,
        sourceHandle: connection.fromOutput,
        targetHandle: connection.toInput,
      })),
    });
  };

  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex items-center gap-3">
          {getStatusIcon(execution.status)}
          <div>
            <CardTitle>{formatStatus(execution.status)}</CardTitle>
            <CardDescription>
              Execution for {execution.workflow.name}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Workflow
            </p>
            <Link
              prefetch
              className="text-sm text-primary hover:underline"
              href={`/workflows/${execution.workflowId}`}
            >
              {execution.workflow.name}
            </Link>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground">Status</p>
            <p className="text-sm">{formatStatus(execution.status)}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground">Started</p>
            <p className="text-sm">
              {formatDistanceToNow(execution.startedAt, { addSuffix: true })}
            </p>
          </div>

          {execution.completedAt ? (
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Completed
              </p>
              <p className="text-sm">
                {formatDistanceToNow(execution.completedAt, {
                  addSuffix: true,
                })}
              </p>
            </div>
          ) : null}

          {duration !== null ? (
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Duration
              </p>
              <p className="text-sm">{duration}s</p>
            </div>
          ) : null}

          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Event ID
            </p>
            <p className="text-sm">{execution.inngestEventId}</p>
          </div>
        </div>

        {execution.error ? (
          <div className="mt-6 space-y-3 rounded-md bg-red-50 p-4">
            <div>
              <p className="mb-2 text-sm font-medium text-red-900">Error</p>
              <p className="font-mono text-sm text-red-800">
                {execution.error}
              </p>
            </div>

            {execution.errorStack ? (
              <Collapsible
                open={showStackTrace}
                onOpenChange={setShowStackTrace}
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-900 hover:bg-red-100"
                  >
                    {showStackTrace ? "Hide stack trace" : "Show stack trace"}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-2 overflow-auto bg-red-100 p-2 text-xs font-mono text-red-800">
                    {execution.errorStack}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            ) : null}

            <div className="rounded-md border border-red-200 bg-white/70 p-3">
              <div className="mb-3 flex items-center gap-2">
                <SparklesIcon className="size-4 text-red-700" />
                <p className="text-sm font-medium text-red-950">
                  Auto-fix with AI
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={credentialId} onValueChange={setCredentialId}>
                  <SelectTrigger className="sm:w-[14rem]">
                    <SelectValue placeholder="OpenAI credential" />
                  </SelectTrigger>
                  <SelectContent>
                    {openAiCredentials?.map((credential) => (
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
                >
                  <SelectTrigger className="sm:w-[10rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  onClick={() => void handleAutoFix()}
                  disabled={!credentialId || autoFixExecution.isPending}
                >
                  {autoFixExecution.isPending ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <SparklesIcon className="size-4" />
                  )}
                  Analyze
                </Button>
              </div>

              {fixResult ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-foreground">
                    {fixResult.assistantMessage}
                  </p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {fixResult.fixes.map((fix) => (
                      <li
                        key={fix}
                        className="rounded-md bg-muted/40 px-3 py-2"
                      >
                        {fix}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => void handleApplyFix()}
                      disabled={updateWorkflow.isPending}
                    >
                      Apply fix to workflow
                    </Button>
                    <Button type="button" variant="outline" asChild>
                      <Link
                        prefetch
                        href={`/workflows/${execution.workflowId}`}
                      >
                        Review in editor
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {execution.output ? (
          <div className="mt-6 rounded-md bg-muted p-4">
            <p className="mb-2 text-sm font-medium">Output</p>
            <pre className="overflow-auto text-xs font-mono">
              {JSON.stringify(execution.output, null, 2)}
            </pre>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
