import { describe, it, expect } from "vitest";
import {
  createTemplate,
  renderNotification,
  renderSubject,
  validateTemplate,
  detectVariables,
  getDefaultTemplate,
  shouldNotify,
  filterByPreferences,
  groupByChannel,
  groupByTrigger,
  formatSlackBlocks,
  formatEmailHtml,
  severityToEmoji,
  computeTemplateStats,
  type NotificationTemplate,
  type NotificationPreference,
} from "./notification-templates";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTemplate(
  overrides: Partial<NotificationTemplate> = {}
): NotificationTemplate {
  return createTemplate({
    id: "tmpl-1",
    name: "Test Template",
    channel: "email",
    trigger: "workflow_failed",
    body: "Workflow {{workflowName}} failed.",
    subject: "Failure: {{workflowName}}",
    severity: "error",
    enabled: true,
    ...overrides,
  });
}

// ─── createTemplate ───────────────────────────────────────────────────────────

describe("createTemplate", () => {
  it("creates a template with required fields", () => {
    const t = createTemplate({
      id: "t1",
      name: "My Template",
      channel: "slack",
      trigger: "workflow_success",
      body: "Done!",
    });
    expect(t.id).toBe("t1");
    expect(t.name).toBe("My Template");
    expect(t.channel).toBe("slack");
    expect(t.trigger).toBe("workflow_success");
    expect(t.body).toBe("Done!");
  });

  it("defaults severity to info", () => {
    const t = createTemplate({
      id: "t2",
      name: "N",
      channel: "email",
      trigger: "workflow_success",
      body: "x",
    });
    expect(t.severity).toBe("info");
  });

  it("defaults enabled to true", () => {
    const t = createTemplate({
      id: "t3",
      name: "N",
      channel: "sms",
      trigger: "quota_exceeded",
      body: "x",
    });
    expect(t.enabled).toBe(true);
  });

  it("defaults version to 1.0.0", () => {
    const t = createTemplate({
      id: "t4",
      name: "N",
      channel: "push",
      trigger: "comment_added",
      body: "x",
    });
    expect(t.version).toBe("1.0.0");
  });

  it("accepts custom severity, version, metadata", () => {
    const t = createTemplate({
      id: "t5",
      name: "N",
      channel: "webhook",
      trigger: "api_key_expiring",
      body: "x",
      severity: "critical",
      version: "2.0.0",
      metadata: { foo: "bar" },
    });
    expect(t.severity).toBe("critical");
    expect(t.version).toBe("2.0.0");
    expect(t.metadata).toEqual({ foo: "bar" });
  });
});

// ─── detectVariables ─────────────────────────────────────────────────────────

describe("detectVariables", () => {
  it("extracts variables from body", () => {
    const t = makeTemplate({ body: "Hello {{name}}, your {{thing}} is ready." });
    const vars = detectVariables(t);
    expect(vars).toContain("name");
    expect(vars).toContain("thing");
  });

  it("extracts variables from subject", () => {
    const t = makeTemplate({ subject: "Alert: {{alertType}}", body: "No vars here" });
    const vars = detectVariables(t);
    expect(vars).toContain("alertType");
  });

  it("deduplicates variables", () => {
    const t = makeTemplate({ body: "{{name}} and {{name}} again", subject: "{{name}}" });
    const vars = detectVariables(t);
    expect(vars.filter((v) => v === "name")).toHaveLength(1);
  });

  it("returns empty array for template with no variables", () => {
    const t = makeTemplate({ body: "No variables here.", subject: "No vars" });
    expect(detectVariables(t)).toEqual([]);
  });
});

// ─── renderNotification ──────────────────────────────────────────────────────

describe("renderNotification", () => {
  it("substitutes variables in body", () => {
    const t = makeTemplate({ body: "Workflow {{workflowName}} failed." });
    const rendered = renderNotification(t, { workflowName: "My WF" });
    expect(rendered.body).toBe("Workflow My WF failed.");
  });

  it("substitutes variables in subject", () => {
    const t = makeTemplate({ subject: "Failure: {{workflowName}}", body: "x" });
    const rendered = renderNotification(t, { workflowName: "My WF" });
    expect(rendered.subject).toBe("Failure: My WF");
  });

  it("reports missing variables", () => {
    const t = makeTemplate({ body: "Hello {{name}}, error: {{errorMessage}}" });
    const rendered = renderNotification(t, {});
    expect(rendered.missingVariables).toContain("name");
    expect(rendered.missingVariables).toContain("errorMessage");
  });

  it("leaves placeholder for missing variables", () => {
    const t = makeTemplate({ body: "Hello {{name}}" });
    const rendered = renderNotification(t, {});
    expect(rendered.body).toBe("Hello {{name}}");
  });

  it("sets renderedAt to a Date", () => {
    const t = makeTemplate({ body: "x" });
    const rendered = renderNotification(t, {});
    expect(rendered.renderedAt).toBeInstanceOf(Date);
  });

  it("carries over channel and severity", () => {
    const t = makeTemplate({ channel: "slack", severity: "critical" });
    const rendered = renderNotification(t, {});
    expect(rendered.channel).toBe("slack");
    expect(rendered.severity).toBe("critical");
  });

  it("returns empty missingVariables when all vars provided", () => {
    const t = makeTemplate({ body: "{{a}} and {{b}}", subject: "{{c}}" });
    const rendered = renderNotification(t, { a: "1", b: "2", c: "3" });
    expect(rendered.missingVariables).toHaveLength(0);
  });
});

// ─── renderSubject ────────────────────────────────────────────────────────────

describe("renderSubject", () => {
  it("substitutes variables", () => {
    expect(renderSubject("Hello {{name}}", { name: "Alice" })).toBe("Hello Alice");
  });

  it("leaves missing variables as placeholder", () => {
    expect(renderSubject("Hello {{name}}", {})).toBe("Hello {{name}}");
  });

  it("handles no variables", () => {
    expect(renderSubject("Hello World", {})).toBe("Hello World");
  });
});

// ─── validateTemplate ─────────────────────────────────────────────────────────

describe("validateTemplate", () => {
  it("passes for a valid template", () => {
    const result = validateTemplate(makeTemplate());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when id is empty", () => {
    const result = validateTemplate(makeTemplate({ id: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("id"))).toBe(true);
  });

  it("fails when name is empty", () => {
    const result = validateTemplate(makeTemplate({ name: "" }));
    expect(result.valid).toBe(false);
  });

  it("fails for invalid channel", () => {
    const result = validateTemplate(makeTemplate({ channel: "fax" as never }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("channel"))).toBe(true);
  });

  it("fails for invalid trigger", () => {
    const result = validateTemplate(makeTemplate({ trigger: "bad_trigger" as never }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("trigger"))).toBe(true);
  });

  it("fails for invalid severity", () => {
    const result = validateTemplate(makeTemplate({ severity: "debug" as never }));
    expect(result.valid).toBe(false);
  });

  it("fails when body is empty", () => {
    const result = validateTemplate(makeTemplate({ body: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("body"))).toBe(true);
  });

  it("fails when version is empty", () => {
    const result = validateTemplate(makeTemplate({ version: "" }));
    expect(result.valid).toBe(false);
  });
});

// ─── getDefaultTemplate ──────────────────────────────────────────────────────

describe("getDefaultTemplate", () => {
  it("returns a template for workflow_failed + email", () => {
    const t = getDefaultTemplate("workflow_failed", "email");
    expect(t).not.toBeNull();
    expect(t!.trigger).toBe("workflow_failed");
    expect(t!.channel).toBe("email");
  });

  it("returns a template for workflow_failed + slack", () => {
    const t = getDefaultTemplate("workflow_failed", "slack");
    expect(t).not.toBeNull();
    expect(t!.channel).toBe("slack");
  });

  it("returns null for unimplemented trigger+channel combo", () => {
    const t = getDefaultTemplate("workflow_success", "sms");
    expect(t).toBeNull();
  });

  it("returns a template for member_invited + email", () => {
    const t = getDefaultTemplate("member_invited", "email");
    expect(t).not.toBeNull();
  });

  it("returns a template for api_key_expiring + email", () => {
    const t = getDefaultTemplate("api_key_expiring", "email");
    expect(t).not.toBeNull();
    expect(t!.severity).toBe("warning");
  });

  it("returns a template for comment_added + in-app", () => {
    const t = getDefaultTemplate("comment_added", "in-app");
    expect(t).not.toBeNull();
  });
});

// ─── shouldNotify ─────────────────────────────────────────────────────────────

describe("shouldNotify", () => {
  const pref: NotificationPreference = {
    userId: "u1",
    channel: "email",
    trigger: "workflow_failed",
    enabled: true,
    minSeverity: "warning",
  };

  it("returns true when trigger matches and severity meets minimum", () => {
    expect(shouldNotify(pref, "workflow_failed", "error")).toBe(true);
  });

  it("returns true when severity equals minimum", () => {
    expect(shouldNotify(pref, "workflow_failed", "warning")).toBe(true);
  });

  it("returns false when severity below minimum", () => {
    expect(shouldNotify(pref, "workflow_failed", "info")).toBe(false);
  });

  it("returns false when trigger does not match", () => {
    expect(shouldNotify(pref, "quota_exceeded", "error")).toBe(false);
  });

  it("returns false when preference is disabled", () => {
    const disabled: NotificationPreference = { ...pref, enabled: false };
    expect(shouldNotify(disabled, "workflow_failed", "error")).toBe(false);
  });

  it("returns true for critical severity when minSeverity is info", () => {
    const infoMin: NotificationPreference = { ...pref, minSeverity: "info" };
    expect(shouldNotify(infoMin, "workflow_failed", "critical")).toBe(true);
  });
});

// ─── filterByPreferences ─────────────────────────────────────────────────────

describe("filterByPreferences", () => {
  it("returns only templates matching preferences", () => {
    const templates = [
      makeTemplate({ trigger: "workflow_failed", channel: "email", severity: "error" }),
      makeTemplate({ trigger: "quota_exceeded", channel: "slack", severity: "warning" }),
    ];
    const prefs: NotificationPreference[] = [
      {
        userId: "u1",
        channel: "email",
        trigger: "workflow_failed",
        enabled: true,
        minSeverity: "error",
      },
    ];
    const result = filterByPreferences(templates, prefs);
    expect(result).toHaveLength(1);
    expect(result[0]!.trigger).toBe("workflow_failed");
  });

  it("returns empty when no preferences match", () => {
    const templates = [makeTemplate()];
    const result = filterByPreferences(templates, []);
    expect(result).toHaveLength(0);
  });
});

// ─── groupByChannel ───────────────────────────────────────────────────────────

describe("groupByChannel", () => {
  it("groups templates by channel", () => {
    const templates = [
      makeTemplate({ channel: "email" }),
      makeTemplate({ channel: "slack" }),
      makeTemplate({ channel: "email" }),
    ];
    const groups = groupByChannel(templates);
    expect(groups.email).toHaveLength(2);
    expect(groups.slack).toHaveLength(1);
    expect(groups.webhook).toHaveLength(0);
  });

  it("includes all channels in result even if empty", () => {
    const groups = groupByChannel([]);
    expect(Object.keys(groups)).toContain("email");
    expect(Object.keys(groups)).toContain("sms");
    expect(Object.keys(groups)).toContain("in-app");
  });
});

// ─── groupByTrigger ───────────────────────────────────────────────────────────

describe("groupByTrigger", () => {
  it("groups templates by trigger", () => {
    const templates = [
      makeTemplate({ trigger: "workflow_failed" }),
      makeTemplate({ trigger: "workflow_success" }),
      makeTemplate({ trigger: "workflow_failed" }),
    ];
    const groups = groupByTrigger(templates);
    expect(groups.workflow_failed).toHaveLength(2);
    expect(groups.workflow_success).toHaveLength(1);
    expect(groups.quota_exceeded).toHaveLength(0);
  });
});

// ─── formatSlackBlocks ────────────────────────────────────────────────────────

describe("formatSlackBlocks", () => {
  it("returns an array of blocks", () => {
    const t = makeTemplate({ channel: "slack", body: "Test message" });
    const rendered = renderNotification(t, {});
    const blocks = formatSlackBlocks(rendered);
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks.length).toBeGreaterThan(0);
  });

  it("includes severity emoji in block text", () => {
    const t = makeTemplate({ channel: "slack", severity: "error", body: "Oops" });
    const rendered = renderNotification(t, {});
    const blocks = formatSlackBlocks(rendered);
    const firstBlock = blocks[0] as { text?: { text?: string } };
    expect(firstBlock.text?.text).toContain("❌");
  });

  it("adds context block for missing variables", () => {
    const t = makeTemplate({ channel: "slack", body: "{{missing}}" });
    const rendered = renderNotification(t, {});
    expect(rendered.missingVariables).toContain("missing");
    const blocks = formatSlackBlocks(rendered);
    expect(blocks.length).toBeGreaterThan(1);
  });
});

// ─── formatEmailHtml ─────────────────────────────────────────────────────────

describe("formatEmailHtml", () => {
  it("returns valid HTML string", () => {
    const t = makeTemplate({ body: "Test body", subject: "Test subject" });
    const rendered = renderNotification(t, {});
    const html = formatEmailHtml(rendered);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html>");
    expect(html).toContain("</html>");
  });

  it("includes subject in h2", () => {
    const t = makeTemplate({ body: "Body", subject: "My Subject" });
    const rendered = renderNotification(t, {});
    const html = formatEmailHtml(rendered);
    expect(html).toContain("<h2>My Subject</h2>");
  });

  it("includes body in p tag", () => {
    const t = makeTemplate({ body: "Body content", subject: "S" });
    const rendered = renderNotification(t, {});
    const html = formatEmailHtml(rendered);
    expect(html).toContain("Body content");
  });

  it("escapes HTML special chars in body", () => {
    const t = makeTemplate({ body: "<script>alert('xss')</script>", subject: "S" });
    const rendered = renderNotification(t, {});
    const html = formatEmailHtml(rendered);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

// ─── severityToEmoji ─────────────────────────────────────────────────────────

describe("severityToEmoji", () => {
  it("info -> ℹ️", () => expect(severityToEmoji("info")).toBe("ℹ️"));
  it("warning -> ⚠️", () => expect(severityToEmoji("warning")).toBe("⚠️"));
  it("error -> ❌", () => expect(severityToEmoji("error")).toBe("❌"));
  it("critical -> 🚨", () => expect(severityToEmoji("critical")).toBe("🚨"));
});

// ─── computeTemplateStats ────────────────────────────────────────────────────

describe("computeTemplateStats", () => {
  const templates: NotificationTemplate[] = [
    makeTemplate({ channel: "email", trigger: "workflow_failed", severity: "error", enabled: true }),
    makeTemplate({ channel: "slack", trigger: "workflow_failed", severity: "warning", enabled: true }),
    makeTemplate({ channel: "email", trigger: "quota_exceeded", severity: "info", enabled: false }),
    makeTemplate({ channel: "webhook", trigger: "workflow_success", severity: "info", enabled: true }),
  ];

  it("counts total correctly", () => {
    expect(computeTemplateStats(templates).total).toBe(4);
  });

  it("counts enabled correctly", () => {
    expect(computeTemplateStats(templates).enabled).toBe(3);
  });

  it("counts byChannel", () => {
    const stats = computeTemplateStats(templates);
    expect(stats.byChannel.email).toBe(2);
    expect(stats.byChannel.slack).toBe(1);
    expect(stats.byChannel.webhook).toBe(1);
    expect(stats.byChannel.sms).toBe(0);
  });

  it("counts byTrigger", () => {
    const stats = computeTemplateStats(templates);
    expect(stats.byTrigger.workflow_failed).toBe(2);
    expect(stats.byTrigger.quota_exceeded).toBe(1);
  });

  it("counts bySeverity", () => {
    const stats = computeTemplateStats(templates);
    expect(stats.bySeverity.error).toBe(1);
    expect(stats.bySeverity.warning).toBe(1);
    expect(stats.bySeverity.info).toBe(2);
  });

  it("handles empty array", () => {
    const stats = computeTemplateStats([]);
    expect(stats.total).toBe(0);
    expect(stats.enabled).toBe(0);
  });
});
