/**
 * Phase 35 — Human Approval / Multi-step Approval Workflow
 * Utilities for workflows that require human approval before proceeding.
 */

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "cancelled";

export type ApprovalDecision = "approved" | "rejected";

export interface ApprovalRequest {
  id: string;
  workflowId: string;
  executionId: string;
  nodeId: string;
  title: string;
  description: string;
  requestedBy: string;   // userId who triggered the workflow
  approvers: string[];   // userIds who can approve
  requiredApprovals: number; // number of approvals needed
  status: ApprovalStatus;
  decisions: ApprovalDecision_[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  expiresAt?: Date;
  resolvedAt?: Date;
}

export interface ApprovalDecision_ {
  userId: string;
  decision: ApprovalDecision;
  comment?: string;
  decidedAt: Date;
}

export interface ApprovalSummary {
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
  status: ApprovalStatus;
  canApprove: boolean; // true if still needs approvals
}

/**
 * Check if an approval request has expired.
 */
export function isExpired(request: ApprovalRequest): boolean {
  if (!request.expiresAt) return false;
  return new Date() > request.expiresAt;
}

/**
 * Check if a user is an eligible approver.
 */
export function isEligibleApprover(request: ApprovalRequest, userId: string): boolean {
  return request.approvers.includes(userId);
}

/**
 * Check if a user has already decided on a request.
 */
export function hasAlreadyDecided(request: ApprovalRequest, userId: string): boolean {
  return request.decisions.some((d) => d.userId === userId);
}

/**
 * Get the summary of decisions for an approval request.
 */
export function getApprovalSummary(request: ApprovalRequest): ApprovalSummary {
  const approvedCount = request.decisions.filter((d) => d.decision === "approved").length;
  const rejectedCount = request.decisions.filter((d) => d.decision === "rejected").length;
  const pendingCount = request.approvers.filter(
    (a) => !request.decisions.some((d) => d.userId === a)
  ).length;

  let status: ApprovalStatus = request.status;

  if (status === "pending") {
    if (isExpired(request)) {
      status = "expired";
    } else if (rejectedCount > 0) {
      status = "rejected";
    } else if (approvedCount >= request.requiredApprovals) {
      status = "approved";
    }
  }

  return {
    approvedCount,
    rejectedCount,
    pendingCount,
    status,
    canApprove: status === "pending" && approvedCount < request.requiredApprovals && rejectedCount === 0,
  };
}

/**
 * Apply a decision to an approval request. Returns updated request.
 */
export function applyDecision(
  request: ApprovalRequest,
  userId: string,
  decision: ApprovalDecision,
  comment?: string
): { request: ApprovalRequest; error?: string } {
  if (request.status !== "pending") {
    return { request, error: `Request is already ${request.status}` };
  }
  if (isExpired(request)) {
    return { request, error: "Request has expired" };
  }
  if (!isEligibleApprover(request, userId)) {
    return { request, error: "User is not an eligible approver" };
  }
  if (hasAlreadyDecided(request, userId)) {
    return { request, error: "User has already made a decision" };
  }

  const newDecision: ApprovalDecision_ = {
    userId,
    decision,
    comment,
    decidedAt: new Date(),
  };

  const newDecisions = [...request.decisions, newDecision];
  const approvedCount = newDecisions.filter((d) => d.decision === "approved").length;
  const rejectedCount = newDecisions.filter((d) => d.decision === "rejected").length;

  let newStatus: ApprovalStatus = "pending";
  let resolvedAt: Date | undefined;

  if (rejectedCount > 0) {
    newStatus = "rejected";
    resolvedAt = new Date();
  } else if (approvedCount >= request.requiredApprovals) {
    newStatus = "approved";
    resolvedAt = new Date();
  }

  return {
    request: {
      ...request,
      decisions: newDecisions,
      status: newStatus,
      resolvedAt,
    },
  };
}

/**
 * Cancel an approval request.
 */
export function cancelApproval(request: ApprovalRequest): ApprovalRequest {
  if (request.status !== "pending") return request;
  return { ...request, status: "cancelled", resolvedAt: new Date() };
}

/**
 * Create a new approval request.
 */
export function createApprovalRequest(params: {
  workflowId: string;
  executionId: string;
  nodeId: string;
  title: string;
  description: string;
  requestedBy: string;
  approvers: string[];
  requiredApprovals?: number;
  expiresInHours?: number;
  metadata?: Record<string, unknown>;
}): ApprovalRequest {
  const {
    workflowId, executionId, nodeId, title, description,
    requestedBy, approvers, expiresInHours, metadata,
  } = params;
  const requiredApprovals = params.requiredApprovals ?? 1;

  return {
    id: `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    workflowId,
    executionId,
    nodeId,
    title,
    description,
    requestedBy,
    approvers,
    requiredApprovals: Math.min(requiredApprovals, approvers.length),
    status: "pending",
    decisions: [],
    metadata,
    createdAt: new Date(),
    expiresAt: expiresInHours
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      : undefined,
  };
}

/**
 * Get pending approval requests for a specific approver.
 */
export function getPendingForApprover(
  requests: ApprovalRequest[],
  userId: string
): ApprovalRequest[] {
  return requests.filter(
    (r) =>
      r.status === "pending" &&
      !isExpired(r) &&
      isEligibleApprover(r, userId) &&
      !hasAlreadyDecided(r, userId)
  );
}

/**
 * Format an approval request as a notification message.
 */
export function formatApprovalNotification(request: ApprovalRequest): string {
  const expiry = request.expiresAt
    ? ` (expires ${request.expiresAt.toLocaleString()})`
    : "";
  return `Approval required: "${request.title}"\n${request.description}${expiry}\nRequires ${request.requiredApprovals} approval(s) from ${request.approvers.length} eligible approver(s).`;
}
