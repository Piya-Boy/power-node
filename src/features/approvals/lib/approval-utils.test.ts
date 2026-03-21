import { describe, it, expect } from "vitest";
import {
  isExpired,
  isEligibleApprover,
  hasAlreadyDecided,
  getApprovalSummary,
  applyDecision,
  cancelApproval,
  createApprovalRequest,
  getPendingForApprover,
  formatApprovalNotification,
  type ApprovalRequest,
} from "./approval-utils";

const makeRequest = (overrides: Partial<ApprovalRequest> = {}): ApprovalRequest => ({
  id: "approval-1",
  workflowId: "wf-1",
  executionId: "exec-1",
  nodeId: "n1",
  title: "Approve Deployment",
  description: "Please review and approve",
  requestedBy: "user-dev",
  approvers: ["user-manager", "user-admin"],
  requiredApprovals: 1,
  status: "pending",
  decisions: [],
  createdAt: new Date(),
  ...overrides,
});

describe("isExpired", () => {
  it("returns false when no expiry", () => {
    expect(isExpired(makeRequest())).toBe(false);
  });

  it("returns false when future expiry", () => {
    const req = makeRequest({ expiresAt: new Date(Date.now() + 3600_000) });
    expect(isExpired(req)).toBe(false);
  });

  it("returns true when past expiry", () => {
    const req = makeRequest({ expiresAt: new Date(Date.now() - 1000) });
    expect(isExpired(req)).toBe(true);
  });
});

describe("isEligibleApprover", () => {
  it("returns true for eligible approver", () => {
    expect(isEligibleApprover(makeRequest(), "user-manager")).toBe(true);
    expect(isEligibleApprover(makeRequest(), "user-admin")).toBe(true);
  });

  it("returns false for non-eligible user", () => {
    expect(isEligibleApprover(makeRequest(), "user-random")).toBe(false);
    expect(isEligibleApprover(makeRequest(), "user-dev")).toBe(false);
  });
});

describe("hasAlreadyDecided", () => {
  it("returns true when user already decided", () => {
    const req = makeRequest({
      decisions: [{ userId: "user-manager", decision: "approved", decidedAt: new Date() }],
    });
    expect(hasAlreadyDecided(req, "user-manager")).toBe(true);
  });

  it("returns false when user hasn't decided", () => {
    expect(hasAlreadyDecided(makeRequest(), "user-manager")).toBe(false);
  });
});

describe("getApprovalSummary", () => {
  it("returns pending summary for new request", () => {
    const summary = getApprovalSummary(makeRequest());
    expect(summary.status).toBe("pending");
    expect(summary.approvedCount).toBe(0);
    expect(summary.canApprove).toBe(true);
  });

  it("returns approved when enough approvals", () => {
    const req = makeRequest({
      decisions: [{ userId: "user-manager", decision: "approved", decidedAt: new Date() }],
    });
    const summary = getApprovalSummary(req);
    expect(summary.approvedCount).toBe(1);
    expect(summary.status).toBe("approved");
  });

  it("returns rejected when any rejection exists", () => {
    const req = makeRequest({
      decisions: [{ userId: "user-manager", decision: "rejected", decidedAt: new Date() }],
    });
    const summary = getApprovalSummary(req);
    expect(summary.status).toBe("rejected");
    expect(summary.canApprove).toBe(false);
  });

  it("returns expired for expired pending request", () => {
    const req = makeRequest({ expiresAt: new Date(Date.now() - 1000) });
    const summary = getApprovalSummary(req);
    expect(summary.status).toBe("expired");
  });
});

describe("applyDecision", () => {
  it("applies an approval decision", () => {
    const req = makeRequest();
    const { request, error } = applyDecision(req, "user-manager", "approved");
    expect(error).toBeUndefined();
    expect(request.decisions).toHaveLength(1);
    expect(request.status).toBe("approved"); // requiredApprovals = 1
  });

  it("applies a rejection", () => {
    const req = makeRequest();
    const { request, error } = applyDecision(req, "user-manager", "rejected", "Not safe");
    expect(error).toBeUndefined();
    expect(request.status).toBe("rejected");
    expect(request.decisions[0].comment).toBe("Not safe");
  });

  it("rejects non-eligible approver", () => {
    const { error } = applyDecision(makeRequest(), "user-nobody", "approved");
    expect(error).toContain("not an eligible");
  });

  it("rejects double decision", () => {
    const req = makeRequest({
      decisions: [{ userId: "user-manager", decision: "approved", decidedAt: new Date() }],
      requiredApprovals: 2,
    });
    const { error } = applyDecision(req, "user-manager", "approved");
    expect(error).toContain("already made");
  });

  it("rejects decision on non-pending request", () => {
    const req = makeRequest({ status: "cancelled" });
    const { error } = applyDecision(req, "user-manager", "approved");
    expect(error).toContain("cancelled");
  });

  it("rejects decision on expired request", () => {
    const req = makeRequest({ expiresAt: new Date(Date.now() - 1000) });
    const { error } = applyDecision(req, "user-manager", "approved");
    expect(error).toContain("expired");
  });

  it("stays pending until required approvals met", () => {
    const req = makeRequest({ requiredApprovals: 2 });
    const { request } = applyDecision(req, "user-manager", "approved");
    expect(request.status).toBe("pending"); // needs 2 approvals
  });
});

describe("cancelApproval", () => {
  it("cancels a pending request", () => {
    const cancelled = cancelApproval(makeRequest());
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.resolvedAt).toBeInstanceOf(Date);
  });

  it("does not cancel non-pending requests", () => {
    const req = makeRequest({ status: "approved" });
    expect(cancelApproval(req).status).toBe("approved");
  });
});

describe("createApprovalRequest", () => {
  it("creates a request with correct defaults", () => {
    const req = createApprovalRequest({
      workflowId: "wf-1",
      executionId: "exec-1",
      nodeId: "n1",
      title: "Deploy",
      description: "Approve?",
      requestedBy: "user-dev",
      approvers: ["user-mgr"],
    });
    expect(req.status).toBe("pending");
    expect(req.requiredApprovals).toBe(1);
    expect(req.decisions).toHaveLength(0);
    expect(req.id).toBeTruthy();
  });

  it("caps requiredApprovals at approvers count", () => {
    const req = createApprovalRequest({
      workflowId: "wf-1",
      executionId: "exec-1",
      nodeId: "n1",
      title: "Deploy",
      description: "Approve?",
      requestedBy: "user-dev",
      approvers: ["user-mgr"],
      requiredApprovals: 99,
    });
    expect(req.requiredApprovals).toBe(1); // capped at 1 approver
  });

  it("sets expiry when provided", () => {
    const req = createApprovalRequest({
      workflowId: "wf-1",
      executionId: "exec-1",
      nodeId: "n1",
      title: "Deploy",
      description: "Approve?",
      requestedBy: "user-dev",
      approvers: ["user-mgr"],
      expiresInHours: 24,
    });
    expect(req.expiresAt).toBeInstanceOf(Date);
  });
});

describe("getPendingForApprover", () => {
  it("returns pending requests for the approver", () => {
    const requests = [
      makeRequest({ id: "r1", approvers: ["user-1", "user-2"] }),
      makeRequest({ id: "r2", approvers: ["user-3"] }),
      makeRequest({ id: "r3", status: "approved", approvers: ["user-1"] }),
    ];
    const pending = getPendingForApprover(requests, "user-1");
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe("r1");
  });

  it("excludes already-decided requests", () => {
    const requests = [
      makeRequest({
        id: "r1",
        decisions: [{ userId: "user-1", decision: "approved", decidedAt: new Date() }],
        requiredApprovals: 2,
      }),
    ];
    expect(getPendingForApprover(requests, "user-1")).toHaveLength(0);
  });
});

describe("formatApprovalNotification", () => {
  it("formats notification message", () => {
    const req = makeRequest();
    const msg = formatApprovalNotification(req);
    expect(msg).toContain("Approve Deployment");
    expect(msg).toContain("approval(s)");
  });

  it("includes expiry when set", () => {
    const req = makeRequest({ expiresAt: new Date(Date.now() + 3600_000) });
    const msg = formatApprovalNotification(req);
    expect(msg).toContain("expires");
  });
});
