// Phase 53 — Notification Template Engine

export type NotificationChannel =
  | "email"
  | "slack"
  | "webhook"
  | "sms"
  | "in-app"
  | "push";

export type NotificationTrigger =
  | "workflow_failed"
  | "workflow_success"
  | "quota_exceeded"
  | "member_invited"
  | "comment_added"
  | "execution_slow"
  | "api_key_expiring";

export type NotificationSeverity = "info" | "warning" | "error" | "critical";

export interface NotificationTemplate {
  id: string;
  name: string;
  channel: NotificationChannel;
  trigger: NotificationTrigger;
  severity: NotificationSeverity;
  subject?: string;    // email subject
  body: string;        // template with {{variables}}
  metadata?: Record<string, unknown>;
  enabled: boolean;
  version: string;
}

export interface RenderedNotification {
  channel: NotificationChannel;
  subject?: string;
  body: string;
  severity: NotificationSeverity;
  variables: Record<string, unknown>;
  missingVariables: string[];
  renderedAt: Date;
}

export interface NotificationPreference {
  userId: string;
  channel: NotificationChannel;
  trigger: NotificationTrigger;
  enabled: boolean;
  minSeverity: NotificationSeverity;
  schedule?: "immediate" | "digest-daily" | "digest-weekly";
}

// ─── Severity Ordering ───────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<NotificationSeverity, number> = {
  info: 1,
  warning: 2,
  error: 3,
  critical: 4,
};

// ─── Template Creation ───────────────────────────────────────────────────────

/**
 * Create a notification template with sensible defaults.
 */
export function createTemplate(params: {
  id: string;
  name: string;
  channel: NotificationChannel;
  trigger: NotificationTrigger;
  body: string;
  severity?: NotificationSeverity;
  subject?: string;
  metadata?: Record<string, unknown>;
  enabled?: boolean;
  version?: string;
}): NotificationTemplate {
  return {
    id: params.id,
    name: params.name,
    channel: params.channel,
    trigger: params.trigger,
    severity: params.severity ?? "info",
    subject: params.subject,
    body: params.body,
    metadata: params.metadata,
    enabled: params.enabled ?? true,
    version: params.version ?? "1.0.0",
  };
}

// ─── Variable Extraction ─────────────────────────────────────────────────────

/**
 * Extract all {{variable}} references from a template string.
 */
export function detectVariables(template: NotificationTemplate): string[] {
  const combined = [template.body, template.subject ?? ""].join(" ");
  const matches = combined.match(/\{\{(\w+)\}\}/g) ?? [];
  const names = matches.map((m) => m.replace(/^\{\{|\}\}$/g, ""));
  // deduplicate, preserve order
  return [...new Set(names)];
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function interpolate(
  text: string,
  variables: Record<string, unknown>
): { result: string; missing: string[] } {
  const missing: string[] = [];
  const result = text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (key in variables && variables[key] !== undefined && variables[key] !== null) {
      return String(variables[key]);
    }
    missing.push(key);
    return `{{${key}}}`;
  });
  return { result, missing };
}

/**
 * Render a notification template with variable substitution.
 */
export function renderNotification(
  template: NotificationTemplate,
  variables: Record<string, unknown>
): RenderedNotification {
  const bodyResult = interpolate(template.body, variables);
  const allMissing = new Set<string>(bodyResult.missing);

  let renderedSubject: string | undefined;
  if (template.subject) {
    const subjectResult = interpolate(template.subject, variables);
    renderedSubject = subjectResult.result;
    for (const m of subjectResult.missing) allMissing.add(m);
  }

  return {
    channel: template.channel,
    subject: renderedSubject,
    body: bodyResult.result,
    severity: template.severity,
    variables,
    missingVariables: [...allMissing],
    renderedAt: new Date(),
  };
}

/**
 * Render only the subject line of a template.
 */
export function renderSubject(
  subject: string,
  variables: Record<string, unknown>
): string {
  return subject.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (key in variables && variables[key] !== undefined && variables[key] !== null) {
      return String(variables[key]);
    }
    return `{{${key}}}`;
  });
}

// ─── Validation ──────────────────────────────────────────────────────────────

const VALID_CHANNELS: NotificationChannel[] = [
  "email",
  "slack",
  "webhook",
  "sms",
  "in-app",
  "push",
];

const VALID_TRIGGERS: NotificationTrigger[] = [
  "workflow_failed",
  "workflow_success",
  "quota_exceeded",
  "member_invited",
  "comment_added",
  "execution_slow",
  "api_key_expiring",
];

const VALID_SEVERITIES: NotificationSeverity[] = [
  "info",
  "warning",
  "error",
  "critical",
];

/**
 * Validate a notification template structure.
 */
export function validateTemplate(template: NotificationTemplate): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!template.id || template.id.trim() === "") {
    errors.push("id is required");
  }

  if (!template.name || template.name.trim() === "") {
    errors.push("name is required");
  }

  if (!VALID_CHANNELS.includes(template.channel)) {
    errors.push(`Invalid channel: ${template.channel}`);
  }

  if (!VALID_TRIGGERS.includes(template.trigger)) {
    errors.push(`Invalid trigger: ${template.trigger}`);
  }

  if (!VALID_SEVERITIES.includes(template.severity)) {
    errors.push(`Invalid severity: ${template.severity}`);
  }

  if (!template.body || template.body.trim() === "") {
    errors.push("body is required");
  }

  if (!template.version || template.version.trim() === "") {
    errors.push("version is required");
  }

  return { valid: errors.length === 0, errors };
}

// ─── Default Templates ───────────────────────────────────────────────────────

const DEFAULT_TEMPLATES: Array<
  Pick<NotificationTemplate, "trigger" | "channel"> &
    Partial<NotificationTemplate>
> = [
  {
    id: "default-workflow-failed-email",
    name: "Workflow Failed (Email)",
    trigger: "workflow_failed",
    channel: "email",
    severity: "error",
    subject: "Workflow {{workflowName}} failed",
    body: "Your workflow {{workflowName}} failed at {{failedAt}}.\n\nError: {{errorMessage}}",
    enabled: true,
    version: "1.0.0",
  },
  {
    id: "default-workflow-failed-slack",
    name: "Workflow Failed (Slack)",
    trigger: "workflow_failed",
    channel: "slack",
    severity: "error",
    body: ":x: Workflow *{{workflowName}}* failed at {{failedAt}}.\nError: {{errorMessage}}",
    enabled: true,
    version: "1.0.0",
  },
  {
    id: "default-workflow-success-email",
    name: "Workflow Succeeded (Email)",
    trigger: "workflow_success",
    channel: "email",
    severity: "info",
    subject: "Workflow {{workflowName}} completed",
    body: "Your workflow {{workflowName}} completed successfully at {{completedAt}}.",
    enabled: true,
    version: "1.0.0",
  },
  {
    id: "default-quota-exceeded-email",
    name: "Quota Exceeded (Email)",
    trigger: "quota_exceeded",
    channel: "email",
    severity: "warning",
    subject: "Quota exceeded for {{quotaType}}",
    body: "You have exceeded your {{quotaType}} quota ({{usageAmount}} / {{limitAmount}}).",
    enabled: true,
    version: "1.0.0",
  },
  {
    id: "default-member-invited-email",
    name: "Member Invited (Email)",
    trigger: "member_invited",
    channel: "email",
    severity: "info",
    subject: "You have been invited to {{teamName}}",
    body: "{{inviterName}} has invited you to join {{teamName}}. Click here to accept: {{inviteUrl}}",
    enabled: true,
    version: "1.0.0",
  },
  {
    id: "default-api-key-expiring-email",
    name: "API Key Expiring (Email)",
    trigger: "api_key_expiring",
    channel: "email",
    severity: "warning",
    subject: "Your API key expires in {{daysLeft}} days",
    body: "Your API key {{keyName}} will expire on {{expiresAt}}. Please rotate it soon.",
    enabled: true,
    version: "1.0.0",
  },
  {
    id: "default-execution-slow-slack",
    name: "Execution Slow (Slack)",
    trigger: "execution_slow",
    channel: "slack",
    severity: "warning",
    body: ":warning: Workflow *{{workflowName}}* is running slowly ({{durationMs}}ms).",
    enabled: true,
    version: "1.0.0",
  },
  {
    id: "default-comment-added-in-app",
    name: "Comment Added (In-App)",
    trigger: "comment_added",
    channel: "in-app",
    severity: "info",
    body: "{{commenterName}} commented on {{resourceName}}: {{commentPreview}}",
    enabled: true,
    version: "1.0.0",
  },
];

/**
 * Return a built-in default template for a given trigger and channel, or null.
 */
export function getDefaultTemplate(
  trigger: NotificationTrigger,
  channel: NotificationChannel
): NotificationTemplate | null {
  const template = DEFAULT_TEMPLATES.find(
    (t) => t.trigger === trigger && t.channel === channel
  );
  if (!template) return null;
  return template as NotificationTemplate;
}

// ─── Preference Filtering ────────────────────────────────────────────────────

/**
 * Determine if a notification should be sent based on user preferences.
 */
export function shouldNotify(
  preference: NotificationPreference,
  trigger: NotificationTrigger,
  severity: NotificationSeverity
): boolean {
  if (!preference.enabled) return false;
  if (preference.trigger !== trigger) return false;
  return SEVERITY_ORDER[severity] >= SEVERITY_ORDER[preference.minSeverity];
}

/**
 * Filter templates based on a list of user notification preferences.
 */
export function filterByPreferences(
  templates: NotificationTemplate[],
  preferences: NotificationPreference[]
): NotificationTemplate[] {
  return templates.filter((template) => {
    return preferences.some((pref) =>
      shouldNotify(pref, template.trigger, template.severity) &&
      pref.channel === template.channel
    );
  });
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

/**
 * Group templates by notification channel.
 */
export function groupByChannel(
  templates: NotificationTemplate[]
): Record<NotificationChannel, NotificationTemplate[]> {
  const result: Record<NotificationChannel, NotificationTemplate[]> = {
    email: [],
    slack: [],
    webhook: [],
    sms: [],
    "in-app": [],
    push: [],
  };
  for (const t of templates) {
    result[t.channel].push(t);
  }
  return result;
}

/**
 * Group templates by notification trigger.
 */
export function groupByTrigger(
  templates: NotificationTemplate[]
): Record<NotificationTrigger, NotificationTemplate[]> {
  const result: Record<NotificationTrigger, NotificationTemplate[]> = {
    workflow_failed: [],
    workflow_success: [],
    quota_exceeded: [],
    member_invited: [],
    comment_added: [],
    execution_slow: [],
    api_key_expiring: [],
  };
  for (const t of templates) {
    result[t.trigger].push(t);
  }
  return result;
}

// ─── Channel Formatters ──────────────────────────────────────────────────────

/**
 * Format a rendered notification as Slack Block Kit blocks.
 */
export function formatSlackBlocks(notification: RenderedNotification): object[] {
  const emoji = severityToEmoji(notification.severity);
  const blocks: object[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} ${notification.body}`,
      },
    },
  ];

  if (notification.missingVariables.length > 0) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `_Missing variables: ${notification.missingVariables.join(", ")}_`,
        },
      ],
    });
  }

  return blocks;
}

/**
 * Format a rendered notification as a minimal HTML email.
 */
export function formatEmailHtml(notification: RenderedNotification): string {
  const emoji = severityToEmoji(notification.severity);
  const subject = notification.subject
    ? `<h2>${escapeHtml(notification.subject)}</h2>`
    : "";
  const body = escapeHtml(notification.body).replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
${subject}
<p>${emoji} ${body}</p>
</body>
</html>`.trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Severity Helpers ────────────────────────────────────────────────────────

/**
 * Map severity to an emoji.
 */
export function severityToEmoji(severity: NotificationSeverity): string {
  switch (severity) {
    case "info":
      return "ℹ️";
    case "warning":
      return "⚠️";
    case "error":
      return "❌";
    case "critical":
      return "🚨";
  }
}

// ─── Statistics ───────────────────────────────────────────────────────────────

/**
 * Compute statistics across a collection of templates.
 */
export function computeTemplateStats(templates: NotificationTemplate[]): {
  total: number;
  byChannel: Record<NotificationChannel, number>;
  byTrigger: Record<NotificationTrigger, number>;
  bySeverity: Record<NotificationSeverity, number>;
  enabled: number;
} {
  const byChannel: Record<NotificationChannel, number> = {
    email: 0,
    slack: 0,
    webhook: 0,
    sms: 0,
    "in-app": 0,
    push: 0,
  };

  const byTrigger: Record<NotificationTrigger, number> = {
    workflow_failed: 0,
    workflow_success: 0,
    quota_exceeded: 0,
    member_invited: 0,
    comment_added: 0,
    execution_slow: 0,
    api_key_expiring: 0,
  };

  const bySeverity: Record<NotificationSeverity, number> = {
    info: 0,
    warning: 0,
    error: 0,
    critical: 0,
  };

  let enabled = 0;

  for (const t of templates) {
    byChannel[t.channel] = (byChannel[t.channel] ?? 0) + 1;
    byTrigger[t.trigger] = (byTrigger[t.trigger] ?? 0) + 1;
    bySeverity[t.severity] = (bySeverity[t.severity] ?? 0) + 1;
    if (t.enabled) enabled++;
  }

  return {
    total: templates.length,
    byChannel,
    byTrigger,
    bySeverity,
    enabled,
  };
}
