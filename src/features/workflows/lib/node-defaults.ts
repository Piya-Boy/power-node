import { NodeType } from "@/generated/prisma";

/**
 * Default data for each node type when it's first placed on the canvas.
 * These values pre-fill the node dialog with sensible defaults.
 */
export const nodeDefaults: Partial<Record<string, Record<string, unknown>>> = {
  [NodeType.MANUAL_TRIGGER]: {
    variableName: "trigger",
  },
  [NodeType.WEBHOOK_TRIGGER]: {
    variableName: "webhook",
    method: "POST",
  },
  [NodeType.SCHEDULE_TRIGGER]: {
    variableName: "schedule",
    cron: "0 * * * *",
  },
  [NodeType.CHAT_TRIGGER]: {
    variableName: "chat",
  },
  [NodeType.GOOGLE_FORM_TRIGGER]: {
    variableName: "form",
  },
  [NodeType.STRIPE_TRIGGER]: {
    variableName: "stripe",
  },
  [NodeType.HTTP_REQUEST]: {
    variableName: "httpResult",
    method: "GET",
    endpoint: "",
  },
  [NodeType.OPENAI]: {
    variableName: "aiResult",
    model: "gpt-4o-mini",
    systemPrompt: "You are a helpful assistant.",
    userPrompt: "",
  },
  [NodeType.ANTHROPIC]: {
    variableName: "aiResult",
    model: "claude-3-5-haiku-20241022",
    systemPrompt: "You are a helpful assistant.",
    userPrompt: "",
  },
  [NodeType.GEMINI]: {
    variableName: "aiResult",
    model: "gemini-1.5-flash",
    userPrompt: "",
  },
  [NodeType.IF_CONDITION]: {
    variableName: "condition",
    field: "",
    operator: "equals",
    value: "",
  },
  [NodeType.CODE]: {
    variableName: "codeResult",
    language: "javascript",
    code: "// Access previous node outputs via context\n// return the result you want to pass to next nodes\nreturn context;",
  },
  [NodeType.TRANSFORM]: {
    variableName: "transformed",
  },
  [NodeType.DISCORD]: {
    variableName: "discord",
    content: "",
  },
  [NodeType.SLACK]: {
    variableName: "slack",
    text: "",
  },
  [NodeType.TELEGRAM]: {
    variableName: "telegram",
    chatId: "",
    message: "",
  },
  [NodeType.EMAIL_SMTP]: {
    variableName: "email",
    to: "",
    subject: "",
    body: "",
  },
  [NodeType.GITHUB]: {
    variableName: "github",
    operation: "list_repos",
    owner: "",
    repo: "",
  },
  [NodeType.NOTION]: {
    variableName: "notion",
    operation: "query_database",
    databaseId: "",
  },
  [NodeType.GOOGLE_SHEETS]: {
    variableName: "sheets",
    operation: "read",
    spreadsheetId: "",
  },
  [NodeType.GOOGLE_CALENDAR]: {
    variableName: "calendar",
    operation: "list_events",
    calendarId: "primary",
  },
  [NodeType.GOOGLE_DRIVE]: {
    variableName: "drive",
    operation: "list_files",
  },
  [NodeType.GMAIL]: {
    variableName: "gmail",
    operation: "send",
    to: "",
    subject: "",
    body: "",
  },
  [NodeType.GRAPHQL]: {
    variableName: "graphql",
    endpoint: "",
    query: "",
  },
  [NodeType.POSTGRESQL_QUERY]: {
    variableName: "pgResult",
    query: "",
  },
  [NodeType.MYSQL_QUERY]: {
    variableName: "mysqlResult",
    query: "",
  },
  [NodeType.AI_AGENT]: {
    variableName: "agent",
    systemPrompt: "You are a helpful AI agent.",
    userPrompt: "",
  },
  [NodeType.OLLAMA]: {
    variableName: "ollama",
    model: "llama3",
    prompt: "",
  },
  [NodeType.TEXT_CLASSIFIER]: {
    variableName: "classification",
    text: "",
    categories: "positive,negative,neutral",
  },
  [NodeType.SENTIMENT_ANALYSIS]: {
    variableName: "sentiment",
    text: "",
  },
  [NodeType.INFORMATION_EXTRACTOR]: {
    variableName: "extracted",
    text: "",
  },
  [NodeType.AI_TRANSFORM]: {
    variableName: "transformed",
    input: "",
    instruction: "",
    outputFormat: "text",
  },
  [NodeType.SUMMARIZATION]: {
    variableName: "summary",
    text: "",
    style: "brief",
  },
  [NodeType.WAIT_DELAY]: {
    variableName: "delay",
    delayMs: 1000,
  },
  [NodeType.LOOP]: {
    variableName: "item",
    iterateOver: "",
  },
  [NodeType.FILTER]: {
    variableName: "filtered",
    field: "",
    operator: "equals",
    value: "",
  },
  [NodeType.SWITCH]: {
    variableName: "switch",
    field: "",
  },
  [NodeType.MERGE]: {
    variableName: "merged",
    mode: "append",
  },
  [NodeType.AGGREGATE]: {
    variableName: "aggregate",
    field: "",
    operation: "sum",
  },
  [NodeType.SORT]: {
    variableName: "sorted",
    field: "",
    direction: "asc",
  },
  [NodeType.REMOVE_DUPLICATES]: {
    variableName: "unique",
    key: "",
  },
  [NodeType.DATE_TIME]: {
    variableName: "dateTime",
    operation: "format",
    format: "YYYY-MM-DD",
  },
  [NodeType.CRYPTO]: {
    variableName: "cryptoResult",
    operation: "hash",
    algorithm: "sha256",
  },
  [NodeType.MARKDOWN_HTML]: {
    variableName: "htmlContent",
    direction: "md-to-html",
  },
  [NodeType.STICKY_NOTE]: {
    content: "Add your notes here...",
  },
  [NodeType.STOP_ERROR]: {
    message: "An error occurred",
  },
};

/**
 * Get defaults for a given node type, with optional overrides.
 */
export function getNodeDefaults(
  type: string,
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  const defaults = nodeDefaults[type] || {};
  return { ...defaults, ...overrides };
}

/**
 * Check if a node type has defaults defined.
 */
export function hasDefaults(type: string): boolean {
  return type in nodeDefaults;
}
