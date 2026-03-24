export interface ErrorTriggerNodeData {
  variableName?: string;
  sourceWorkflowId?: string;
  messageIncludes?: string;
}

export interface WorkflowFailurePayload {
  sourceWorkflowId: string;
  sourceWorkflowName?: string;
  sourceEventId?: string;
  errorMessage: string;
  errorStack?: string | null;
  failedAt: string;
}

function normalizeFilter(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function matchesErrorTrigger(
  nodeData: ErrorTriggerNodeData,
  payload: WorkflowFailurePayload,
): boolean {
  if (
    nodeData.sourceWorkflowId &&
    nodeData.sourceWorkflowId !== payload.sourceWorkflowId
  ) {
    return false;
  }

  const messageIncludes = normalizeFilter(nodeData.messageIncludes);
  if (!messageIncludes) {
    return true;
  }

  return payload.errorMessage.toLowerCase().includes(messageIncludes);
}

export function buildErrorTriggerInitialData(
  nodeData: ErrorTriggerNodeData,
  payload: WorkflowFailurePayload,
): Record<string, unknown> {
  const variableName =
    typeof nodeData.variableName === "string" &&
    nodeData.variableName.trim().length > 0
      ? nodeData.variableName.trim()
      : "error";

  return {
    errorTrigger: payload,
    [variableName]: payload,
  };
}
