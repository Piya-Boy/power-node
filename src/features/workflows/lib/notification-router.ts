/**
 * Phase 87 — Workflow Notification Router
 * Pure utilities for routing workflow notifications to the right channels
 * based on event type, severity, recipient preferences, and routing rules.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ChannelType =
  | "email"
  | "slack"
  | "webhook"
  | "sms"
  | "push"
  | "pagerduty"
  | "teams"
  | "discord";

export type NotificationSeverity = "info" | "warning" | "error" | "critical";
export type NotificationStatus = "pending" | "sent" | "failed" | "suppressed" | "queued";

export interface NotificationEvent {
  id: string;
  type: string;                 // e.g. "workflow.failed", "node.completed"
  severity: NotificationSeverity;
  title: string;
  body: string;
  workflowId?: string;
  nodeId?: string;
  executionId?: string;
  tags: string[];
  metadata: Record<string, unknown>;
  timestamp: number;
}

export interface ChannelConfig {
  id: string;
  type: ChannelType;
  name: string;
  enabled: boolean;
  target: string;               // email address, Slack channel, webhook URL, etc.
  rateLimit?: {
    maxPerHour: number;
    maxPerDay: number;
  };
  minSeverity?: NotificationSeverity;
}

export interface RecipientPreferences {
  userId: string;
  channels: string[];           // channel IDs the user subscribes to
  mutedEventTypes?: string[];
  mutedSeverities?: NotificationSeverity[];
  quietHours?: { start: number; end: number }; // hours 0-23
  digest?: boolean;             // bundle into digest instead of instant
}

export interface RoutingRule {
  id: string;
  priority: number;             // lower = higher priority
  matchEventType?: string[];
  matchSeverity?: NotificationSeverity[];
  matchTags?: string[];
  matchWorkflowId?: string;
  targetChannelIds: string[];
  targetUserIds?: string[];
  transform?: (event: NotificationEvent) => NotificationEvent;
  stop?: boolean;               // stop processing further rules
}

export interface NotificationRecord {
  id: string;
  eventId: string;
  channelId: string;
  recipientId?: string;
  status: NotificationStatus;
  sentAt?: number;
  error?: string;
  retryCount: number;
}

export interface RouteResult {
  records: NotificationRecord[];
  suppressed: number;
  routed: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Severity Ordering
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: NotificationSeverity[] = ["info", "warning", "error", "critical"];

export function severityIndex(s: NotificationSeverity): number {
  return SEVERITY_ORDER.indexOf(s);
}

export function isSeverityAtLeast(
  actual: NotificationSeverity,
  min: NotificationSeverity
): boolean {
  return severityIndex(actual) >= severityIndex(min);
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Building
// ─────────────────────────────────────────────────────────────────────────────

let _idSeq = 0;
export function resetIdSeq(): void { _idSeq = 0; }

export function createEvent(
  type: string,
  severity: NotificationSeverity,
  title: string,
  body: string,
  options: Partial<Omit<NotificationEvent, "id" | "type" | "severity" | "title" | "body">> & { timestamp?: number } = {}
): NotificationEvent {
  return {
    id: `evt_${++_idSeq}`,
    type,
    severity,
    title,
    body,
    tags: [],
    metadata: {},
    timestamp: Date.now(),
    ...options,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule Matching
// ─────────────────────────────────────────────────────────────────────────────

export function matchesRule(event: NotificationEvent, rule: RoutingRule): boolean {
  if (rule.matchEventType && !rule.matchEventType.includes(event.type)) return false;
  if (rule.matchSeverity && !rule.matchSeverity.includes(event.severity)) return false;
  if (rule.matchTags && !rule.matchTags.some((t) => event.tags.includes(t))) return false;
  if (rule.matchWorkflowId && event.workflowId !== rule.matchWorkflowId) return false;
  return true;
}

export function getMatchingRules(
  event: NotificationEvent,
  rules: RoutingRule[]
): RoutingRule[] {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  const matched: RoutingRule[] = [];
  for (const rule of sorted) {
    if (matchesRule(event, rule)) {
      matched.push(rule);
      if (rule.stop) break;
    }
  }
  return matched;
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel Filtering
// ─────────────────────────────────────────────────────────────────────────────

export function isChannelEligible(
  channel: ChannelConfig,
  event: NotificationEvent
): boolean {
  if (!channel.enabled) return false;
  if (channel.minSeverity && !isSeverityAtLeast(event.severity, channel.minSeverity)) return false;
  return true;
}

export function filterEligibleChannels(
  channels: ChannelConfig[],
  event: NotificationEvent
): ChannelConfig[] {
  return channels.filter((c) => isChannelEligible(c, event));
}

// ─────────────────────────────────────────────────────────────────────────────
// Recipient Preference Filtering
// ─────────────────────────────────────────────────────────────────────────────

export function isEventMutedForRecipient(
  event: NotificationEvent,
  prefs: RecipientPreferences,
  currentHour?: number
): boolean {
  if (prefs.mutedEventTypes?.includes(event.type)) return true;
  if (prefs.mutedSeverities?.includes(event.severity)) return true;
  if (prefs.quietHours && currentHour !== undefined) {
    const { start, end } = prefs.quietHours;
    if (start <= end) {
      if (currentHour >= start && currentHour < end) return true;
    } else {
      // Wraps midnight
      if (currentHour >= start || currentHour < end) return true;
    }
  }
  return false;
}

export function getRecipientChannels(
  prefs: RecipientPreferences,
  channels: ChannelConfig[]
): ChannelConfig[] {
  const channelMap = new Map(channels.map((c) => [c.id, c]));
  return prefs.channels.map((id) => channelMap.get(id)).filter((c): c is ChannelConfig => c !== undefined);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiting
// ─────────────────────────────────────────────────────────────────────────────

export interface RateWindow {
  channelId: string;
  hourStart: number;
  dayStart: number;
  countThisHour: number;
  countThisDay: number;
}

export function createRateWindow(channelId: string, now = Date.now()): RateWindow {
  const d = new Date(now);
  const hourStart = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()).getTime();
  const dayStart = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime();
  return { channelId, hourStart, dayStart, countThisHour: 0, countThisDay: 0 };
}

export function checkRateLimit(
  window: RateWindow,
  channel: ChannelConfig,
  now = Date.now()
): { allowed: boolean; window: RateWindow } {
  if (!channel.rateLimit) return { allowed: true, window };

  const d = new Date(now);
  const hourStart = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()).getTime();
  const dayStart = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime();

  // Reset counters if windows have changed
  let { countThisHour, countThisDay } = window;
  if (hourStart > window.hourStart) { countThisHour = 0; }
  if (dayStart > window.dayStart) { countThisDay = 0; }

  if (countThisHour >= channel.rateLimit.maxPerHour) return { allowed: false, window: { ...window, hourStart, dayStart, countThisHour, countThisDay } };
  if (countThisDay >= channel.rateLimit.maxPerDay) return { allowed: false, window: { ...window, hourStart, dayStart, countThisHour, countThisDay } };

  return {
    allowed: true,
    window: { ...window, hourStart, dayStart, countThisHour: countThisHour + 1, countThisDay: countThisDay + 1 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification Record Management
// ─────────────────────────────────────────────────────────────────────────────

export function createRecord(
  eventId: string,
  channelId: string,
  recipientId?: string
): NotificationRecord {
  return {
    id: `rec_${++_idSeq}`,
    eventId,
    channelId,
    recipientId,
    status: "pending",
    retryCount: 0,
  };
}

export function markSent(record: NotificationRecord, sentAt: number): NotificationRecord {
  return { ...record, status: "sent", sentAt };
}

export function markFailed(record: NotificationRecord, error: string): NotificationRecord {
  return { ...record, status: "failed", error, retryCount: record.retryCount + 1 };
}

export function markSuppressed(record: NotificationRecord): NotificationRecord {
  return { ...record, status: "suppressed" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Router
// ─────────────────────────────────────────────────────────────────────────────

export function routeEvent(
  event: NotificationEvent,
  rules: RoutingRule[],
  channels: ChannelConfig[],
  recipients: RecipientPreferences[] = [],
  currentHour?: number
): RouteResult {
  const channelMap = new Map(channels.map((c) => [c.id, c]));
  const records: NotificationRecord[] = [];
  let suppressed = 0;

  const matchedRules = getMatchingRules(event, rules);

  // Collect target channel IDs from all matched rules
  const targetChannelIds = new Set<string>();
  for (const rule of matchedRules) {
    for (const cid of rule.targetChannelIds) targetChannelIds.add(cid);
  }

  // For each target channel, create notification records
  for (const channelId of targetChannelIds) {
    const channel = channelMap.get(channelId);
    if (!channel || !isChannelEligible(channel, event)) {
      suppressed++;
      continue;
    }

    // Check if we have specific recipients for this channel
    const targetUserIds = matchedRules
      .filter((r) => r.targetChannelIds.includes(channelId) && r.targetUserIds)
      .flatMap((r) => r.targetUserIds ?? []);

    if (targetUserIds.length > 0) {
      for (const userId of targetUserIds) {
        const prefs = recipients.find((r) => r.userId === userId);
        if (prefs && isEventMutedForRecipient(event, prefs, currentHour)) {
          suppressed++;
          continue;
        }
        records.push(createRecord(event.id, channelId, userId));
      }
    } else {
      records.push(createRecord(event.id, channelId));
    }
  }

  return { records, suppressed, routed: records.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification Stats
// ─────────────────────────────────────────────────────────────────────────────

export interface NotificationStats {
  total: number;
  byStatus: Record<NotificationStatus, number>;
  byChannel: Record<string, number>;
  successRate: number;
  failedIds: string[];
}

export function computeNotificationStats(records: NotificationRecord[]): NotificationStats {
  const byStatus: Record<NotificationStatus, number> = {
    pending: 0, sent: 0, failed: 0, suppressed: 0, queued: 0,
  };
  const byChannel: Record<string, number> = {};
  const failedIds: string[] = [];

  for (const r of records) {
    byStatus[r.status]++;
    byChannel[r.channelId] = (byChannel[r.channelId] ?? 0) + 1;
    if (r.status === "failed") failedIds.push(r.id);
  }

  const resolved = byStatus.sent + byStatus.failed;
  return {
    total: records.length,
    byStatus,
    byChannel,
    successRate: resolved === 0 ? 0 : byStatus.sent / resolved,
    failedIds,
  };
}

export function getFailedRecords(records: NotificationRecord[]): NotificationRecord[] {
  return records.filter((r) => r.status === "failed");
}

export function getPendingRecords(records: NotificationRecord[]): NotificationRecord[] {
  return records.filter((r) => r.status === "pending");
}
