import { describe, it, expect } from "vitest";
import {
  createNotification,
  markAsRead,
  markAllAsRead,
  filterNotifications,
  getUnreadCount,
  removeExpired,
  sortNotifications,
  groupByType,
  createExecutionSuccessNotification,
  createExecutionFailedNotification,
  createQuotaWarningNotification,
  type Notification,
} from "./notification-utils";

const makeNotification = (overrides: Partial<Notification> = {}): Notification => ({
  id: "notif-1",
  type: "execution.success",
  severity: "success",
  title: "Success",
  message: "Workflow completed",
  userId: "user-1",
  read: false,
  createdAt: new Date("2026-01-01T10:00:00Z"),
  ...overrides,
});

describe("createNotification", () => {
  it("creates notification with correct severity", () => {
    const n = createNotification({
      type: "execution.failed",
      title: "Failed",
      message: "Workflow failed",
      userId: "u1",
    });
    expect(n.severity).toBe("error");
    expect(n.read).toBe(false);
    expect(n.id).toBeTruthy();
  });

  it("sets expiry when provided", () => {
    const n = createNotification({
      type: "system.alert",
      title: "Alert",
      message: "System alert",
      userId: "u1",
      expiresInSeconds: 3600,
    });
    expect(n.expiresAt).toBeInstanceOf(Date);
    expect(n.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("markAsRead", () => {
  it("marks notification as read", () => {
    const n = makeNotification({ read: false });
    const updated = markAsRead(n);
    expect(updated.read).toBe(true);
    expect(n.read).toBe(false); // original unchanged
  });
});

describe("markAllAsRead", () => {
  it("marks all user notifications as read", () => {
    const ns = [
      makeNotification({ id: "1", userId: "user-1", read: false }),
      makeNotification({ id: "2", userId: "user-1", read: false }),
      makeNotification({ id: "3", userId: "user-2", read: false }),
    ];
    const updated = markAllAsRead(ns, "user-1");
    expect(updated[0].read).toBe(true);
    expect(updated[1].read).toBe(true);
    expect(updated[2].read).toBe(false); // other user unchanged
  });
});

describe("filterNotifications", () => {
  const ns = [
    makeNotification({ id: "1", read: false, severity: "success", type: "execution.success" }),
    makeNotification({ id: "2", read: true, severity: "error", type: "execution.failed" }),
    makeNotification({ id: "3", read: false, severity: "warning", type: "billing.quota_warning" }),
    makeNotification({ id: "4", read: false, expiresAt: new Date(Date.now() - 1000) }), // expired
  ];

  it("filters unread only", () => {
    const result = filterNotifications(ns, { unreadOnly: true });
    expect(result.every((n) => !n.read)).toBe(true);
    expect(result.find((n) => n.id === "1")).toBeDefined();
  });

  it("excludes expired notifications", () => {
    const result = filterNotifications(ns, {});
    expect(result.find((n) => n.id === "4")).toBeUndefined();
  });

  it("filters by type", () => {
    const result = filterNotifications(ns, { type: "execution.failed" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("filters by severity", () => {
    const result = filterNotifications(ns, { severity: "warning" });
    expect(result.every((n) => n.severity === "warning")).toBe(true);
  });
});

describe("getUnreadCount", () => {
  it("counts unread non-expired notifications", () => {
    const ns = [
      makeNotification({ userId: "user-1", read: false }),
      makeNotification({ userId: "user-1", read: true }),
      makeNotification({ userId: "user-1", read: false, expiresAt: new Date(Date.now() - 1000) }),
      makeNotification({ userId: "user-2", read: false }),
    ];
    expect(getUnreadCount(ns, "user-1")).toBe(1);
  });
});

describe("removeExpired", () => {
  it("removes expired notifications", () => {
    const ns = [
      makeNotification({ id: "1" }),
      makeNotification({ id: "2", expiresAt: new Date(Date.now() - 1000) }),
      makeNotification({ id: "3", expiresAt: new Date(Date.now() + 10000) }),
    ];
    const result = removeExpired(ns);
    expect(result).toHaveLength(2);
    expect(result.find((n) => n.id === "2")).toBeUndefined();
  });
});

describe("sortNotifications", () => {
  const ns = [
    makeNotification({ id: "1", createdAt: new Date("2026-01-01") }),
    makeNotification({ id: "2", createdAt: new Date("2026-01-03") }),
    makeNotification({ id: "3", createdAt: new Date("2026-01-02") }),
  ];

  it("sorts newest first by default", () => {
    const sorted = sortNotifications(ns);
    expect(sorted[0].id).toBe("2");
    expect(sorted[2].id).toBe("1");
  });

  it("sorts oldest first with asc", () => {
    const sorted = sortNotifications(ns, "asc");
    expect(sorted[0].id).toBe("1");
  });
});

describe("groupByType", () => {
  it("groups notifications by type", () => {
    const ns = [
      makeNotification({ type: "execution.success" }),
      makeNotification({ type: "execution.success" }),
      makeNotification({ type: "execution.failed" }),
    ];
    const groups = groupByType(ns);
    expect(groups["execution.success"]).toHaveLength(2);
    expect(groups["execution.failed"]).toHaveLength(1);
  });
});

describe("createExecutionSuccessNotification", () => {
  it("creates a success notification with correct type", () => {
    const n = createExecutionSuccessNotification({
      userId: "u1",
      workflowId: "wf-1",
      workflowName: "My WF",
      executionId: "exec-1",
    });
    expect(n.type).toBe("execution.success");
    expect(n.severity).toBe("success");
    expect(n.message).toContain("My WF");
    expect(n.actionUrl).toContain("exec-1");
  });
});

describe("createExecutionFailedNotification", () => {
  it("creates a failed notification including error message", () => {
    const n = createExecutionFailedNotification({
      userId: "u1",
      workflowId: "wf-1",
      workflowName: "My WF",
      executionId: "exec-1",
      error: "Connection timeout",
    });
    expect(n.type).toBe("execution.failed");
    expect(n.severity).toBe("error");
    expect(n.message).toContain("Connection timeout");
  });
});

describe("createQuotaWarningNotification", () => {
  it("creates a quota warning with percentage", () => {
    const n = createQuotaWarningNotification({ userId: "u1", used: 900, limit: 1000 });
    expect(n.type).toBe("billing.quota_warning");
    expect(n.message).toContain("90%");
    expect(n.actionUrl).toBe("/billing");
  });
});
