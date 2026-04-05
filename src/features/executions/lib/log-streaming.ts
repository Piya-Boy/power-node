export type WorkflowLogStreamingLevel = "info" | "warn" | "error";

export interface WorkflowLogStreamingSettings {
  enabled: boolean;
  url?: string | null;
  minLevel?: WorkflowLogStreamingLevel;
}

export type WorkflowExecutionLifecycle = "started" | "completed" | "failed";

export interface StreamExecutionLogInput {
  workflowId: string;
  workflowName: string;
  executionId: string;
  inngestEventId: string;
  lifecycle: WorkflowExecutionLifecycle;
  status: "RUNNING" | "SUCCESS" | "FAILED";
  timestamp?: Date;
  durationMs?: number;
  error?: string | null;
  errorStack?: string | null;
  output?: unknown;
}

export interface StreamExecutionLogResult {
  sent: boolean;
  reason?:
    | "disabled"
    | "missing_url"
    | "filtered"
    | "invalid_url"
    | "request_failed";
  status?: number;
}

const LOG_LEVEL_ORDER: Record<WorkflowLogStreamingLevel, number> = {
  info: 0,
  warn: 1,
  error: 2,
};

export function getExecutionLifecycleLevel(
  lifecycle: WorkflowExecutionLifecycle,
): WorkflowLogStreamingLevel {
  switch (lifecycle) {
    case "failed":
      return "error";
    default:
      return "info";
  }
}

export function shouldStreamExecutionLog(
  settings: WorkflowLogStreamingSettings,
  lifecycle: WorkflowExecutionLifecycle,
): boolean {
  if (!settings.enabled) {
    return false;
  }

  if (!settings.url) {
    return false;
  }

  const minLevel = settings.minLevel ?? "info";
  const eventLevel = getExecutionLifecycleLevel(lifecycle);

  return LOG_LEVEL_ORDER[eventLevel] >= LOG_LEVEL_ORDER[minLevel];
}

export function buildExecutionLogPayload(input: StreamExecutionLogInput) {
  const timestamp = input.timestamp ?? new Date();

  return {
    event: `workflow.execution.${input.lifecycle}`,
    level: getExecutionLifecycleLevel(input.lifecycle),
    timestamp: timestamp.toISOString(),
    workflowId: input.workflowId,
    workflowName: input.workflowName,
    executionId: input.executionId,
    inngestEventId: input.inngestEventId,
    status: input.status,
    durationMs: input.durationMs,
    error: input.error ?? undefined,
    errorStack: input.errorStack ?? undefined,
    output: input.output,
  };
}

export async function streamExecutionLog(
  settings: WorkflowLogStreamingSettings,
  input: StreamExecutionLogInput,
  fetchImpl: typeof fetch = fetch,
): Promise<StreamExecutionLogResult> {
  if (!settings.enabled) {
    return { sent: false, reason: "disabled" };
  }

  if (!settings.url) {
    return { sent: false, reason: "missing_url" };
  }

  if (!shouldStreamExecutionLog(settings, input.lifecycle)) {
    return { sent: false, reason: "filtered" };
  }

  let targetUrl: URL;

  try {
    targetUrl = new URL(settings.url);
  } catch {
    return { sent: false, reason: "invalid_url" };
  }

  const payload = buildExecutionLogPayload(input);

  try {
    const response = await fetchImpl(targetUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "powernode-log-streamer",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });

    return {
      sent: response.ok,
      reason: response.ok ? undefined : "request_failed",
      status: response.status,
    };
  } catch {
    return {
      sent: false,
      reason: "request_failed",
    };
  }
}
