/**
 * Phase 28 — Advanced UX: Notification Center utilities
 */

export type NotificationType =
  | "execution.success"
  | "execution.failed"
  | "execution.waiting_approval"
  | "workflow.activated"
  | "workflow.deactivated"
  | "project.member.invited"
  | "project.member.joined"
  | "system.alert"
  | "billing.quota_warning"
  | "billing.quota_exceeded";

export type NotificationSeverity = "info" | "warning" | "error" | "success";

export interface Notification {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  userId: string;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  expiresAt?: Date;
}

export interface NotificationFilter {
  unreadOnly?: boolean;
  type?: NotificationType;
  severity?: NotificationSeverity;
  from?: Date;
  to?: Date;
}

const TYPE_SEVERITY: Record<NotificationType, NotificationSeverity> = {
  "execution.success": "success",
  "execution.failed": "error",
  "execution.waiting_approval": "info",
  "workflow.activated": "success",
  "workflow.deactivated": "info",
  "project.member.invited": "info",
  "project.member.joined": "info",
  "system.alert": "warning",
  "billing.quota_warning": "warning",
  "billing.quota_exceeded": "error",
};

let _notifIdCounter = 0;
function generateId(): string {
  return `notif-${Date.now()}-${++_notifIdCounter}`;
}

/**
 * Create a notification.
 */
export function createNotification(params: {
  type: NotificationType;
  title: string;
  message: string;
  userId: string;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
  expiresInSeconds?: number;
}): Notification {
  return {
    id: generateId(),
    type: params.type,
    severity: TYPE_SEVERITY[params.type],
    title: params.title,
    message: params.message,
    userId: params.userId,
    read: false,
    actionUrl: params.actionUrl,
    actionLabel: params.actionLabel,
    metadata: params.metadata,
    createdAt: new Date(),
    expiresAt: params.expiresInSeconds
      ? new Date(Date.now() + params.expiresInSeconds * 1000)
      : undefined,
  };
}

/**
 * Mark a notification as read. Returns updated notification.
 */
export function markAsRead(notification: Notification): Notification {
  return { ...notification, read: true };
}

/**
 * Mark all notifications as read for a user.
 */
export function markAllAsRead(notifications: Notification[], userId: string): Notification[] {
  return notifications.map((n) =>
    n.userId === userId ? { ...n, read: true } : n
  );
}

/**
 * Filter notifications.
 */
export function filterNotifications(
  notifications: Notification[],
  filter: NotificationFilter
): Notification[] {
  const now = new Date();
  return notifications.filter((n) => {
    if (filter.unreadOnly && n.read) return false;
    if (filter.type && n.type !== filter.type) return false;
    if (filter.severity && n.severity !== filter.severity) return false;
    if (filter.from && n.createdAt < filter.from) return false;
    if (filter.to && n.createdAt > filter.to) return false;
    // Exclude expired notifications
    if (n.expiresAt && n.expiresAt < now) return false;
    return true;
  });
}

/**
 * Get unread count for a user.
 */
export function getUnreadCount(notifications: Notification[], userId: string): number {
  const now = new Date();
  return notifications.filter(
    (n) =>
      n.userId === userId &&
      !n.read &&
      (!n.expiresAt || n.expiresAt >= now)
  ).length;
}

/**
 * Remove expired notifications.
 */
export function removeExpired(notifications: Notification[]): Notification[] {
  const now = new Date();
  return notifications.filter((n) => !n.expiresAt || n.expiresAt >= now);
}

/**
 * Sort notifications by createdAt (newest first by default).
 */
export function sortNotifications(
  notifications: Notification[],
  order: "asc" | "desc" = "desc"
): Notification[] {
  return [...notifications].sort((a, b) => {
    const diff = a.createdAt.getTime() - b.createdAt.getTime();
    return order === "desc" ? -diff : diff;
  });
}

/**
 * Group notifications by type.
 */
export function groupByType(
  notifications: Notification[]
): Record<string, Notification[]> {
  const groups: Record<string, Notification[]> = {};
  for (const n of notifications) {
    if (!groups[n.type]) groups[n.type] = [];
    groups[n.type].push(n);
  }
  return groups;
}

/**
 * Create common workflow execution notifications.
 */
export function createExecutionSuccessNotification(params: {
  userId: string;
  workflowId: string;
  workflowName: string;
  executionId: string;
}): Notification {
  return createNotification({
    type: "execution.success",
    title: "Workflow completed",
    message: `"${params.workflowName}" executed successfully.`,
    userId: params.userId,
    actionUrl: `/executions/${params.executionId}`,
    actionLabel: "View execution",
    metadata: { workflowId: params.workflowId, executionId: params.executionId },
  });
}

export function createExecutionFailedNotification(params: {
  userId: string;
  workflowId: string;
  workflowName: string;
  executionId: string;
  error?: string;
}): Notification {
  return createNotification({
    type: "execution.failed",
    title: "Workflow failed",
    message: `"${params.workflowName}" failed${params.error ? `: ${params.error}` : "."}`,
    userId: params.userId,
    actionUrl: `/executions/${params.executionId}`,
    actionLabel: "View details",
    metadata: { workflowId: params.workflowId, executionId: params.executionId, error: params.error },
  });
}

export function createQuotaWarningNotification(params: {
  userId: string;
  used: number;
  limit: number;
}): Notification {
  const pct = Math.round((params.used / params.limit) * 100);
  return createNotification({
    type: "billing.quota_warning",
    title: "Approaching execution limit",
    message: `You've used ${pct}% of your monthly execution quota (${params.used}/${params.limit}).`,
    userId: params.userId,
    actionUrl: "/billing",
    actionLabel: "View billing",
    metadata: { used: params.used, limit: params.limit },
  });
}
