import type { MessageEnvelopeObject, SearchObject } from "imapflow";

export interface ImapCredentialConfig {
  host: string;
  port: number;
  secure?: boolean;
  user: string;
  pass: string;
}

export interface EmailTriggerNodeData {
  variableName?: string;
  credentialId?: string;
  mailbox?: string;
  from?: string;
  subject?: string;
  unseenOnly?: boolean;
  markAsSeen?: boolean;
  maxMessages?: number;
}

export interface EmailTriggerPayload {
  uid: number;
  uidValidity?: string;
  mailbox: string;
  subject?: string;
  messageId?: string;
  from: string[];
  to: string[];
  cc: string[];
  date?: string;
  flags: string[];
  snippet?: string;
}

function normalizeText(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function parseImapCredential(value: string): ImapCredentialConfig {
  const parsed = JSON.parse(value) as Record<string, unknown>;

  if (
    typeof parsed.host !== "string" ||
    typeof parsed.user !== "string" ||
    typeof parsed.pass !== "string"
  ) {
    throw new Error("IMAP credential must include host, user, and pass");
  }

  const port =
    typeof parsed.port === "number" ? parsed.port : Number(parsed.port ?? 993);

  if (!Number.isFinite(port)) {
    throw new Error("IMAP credential port must be a number");
  }

  return {
    host: parsed.host,
    port,
    secure: typeof parsed.secure === "boolean" ? parsed.secure : port === 993,
    user: parsed.user,
    pass: parsed.pass,
  };
}

export function getEmailTriggerMailbox(data: EmailTriggerNodeData): string {
  return normalizeText(data.mailbox) ?? "INBOX";
}

export function getEmailTriggerMaxMessages(data: EmailTriggerNodeData): number {
  const raw =
    typeof data.maxMessages === "number"
      ? data.maxMessages
      : Number(data.maxMessages ?? 10);

  if (!Number.isFinite(raw)) {
    return 10;
  }

  return Math.min(Math.max(Math.trunc(raw), 1), 25);
}

export function buildEmailSearchQuery(
  data: EmailTriggerNodeData,
): SearchObject {
  const query: SearchObject = {
    all: true,
  };

  if (data.unseenOnly !== false) {
    query.seen = false;
  }

  const from = normalizeText(data.from);
  if (from) {
    query.from = from;
  }

  const subject = normalizeText(data.subject);
  if (subject) {
    query.subject = subject;
  }

  return query;
}

function mapAddresses(addresses: MessageEnvelopeObject["from"]): string[] {
  return (addresses ?? [])
    .map((address) => address?.address || address?.name)
    .filter((value): value is string => Boolean(value));
}

export function extractEmailSnippet(
  source?: Buffer | null,
): string | undefined {
  if (!source) {
    return undefined;
  }

  const decoded = source
    .toString("utf8")
    .replace(/\r/g, "")
    .split("\n\n")
    .slice(1)
    .join("\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return decoded ? decoded.slice(0, 240) : undefined;
}

export function normalizeEmailTriggerMessage(input: {
  uid: number;
  uidValidity?: bigint | null;
  mailbox: string;
  envelope?: MessageEnvelopeObject | null;
  flags?: Set<string> | null;
  source?: Buffer | null;
}): EmailTriggerPayload {
  return {
    uid: input.uid,
    uidValidity: input.uidValidity?.toString(),
    mailbox: input.mailbox,
    subject: input.envelope?.subject,
    messageId: input.envelope?.messageId,
    from: mapAddresses(input.envelope?.from),
    to: mapAddresses(input.envelope?.to),
    cc: mapAddresses(input.envelope?.cc),
    date: input.envelope?.date?.toISOString(),
    flags: Array.from(input.flags ?? []),
    snippet: extractEmailSnippet(input.source),
  };
}

export function buildEmailTriggerInitialData(
  data: EmailTriggerNodeData,
  payload: EmailTriggerPayload,
): Record<string, unknown> {
  const variableName =
    typeof data.variableName === "string" && data.variableName.trim().length > 0
      ? data.variableName.trim()
      : "email";

  return {
    emailTrigger: payload,
    [variableName]: payload,
  };
}

export function buildEmailTriggerEventId(
  workflowId: string,
  nodeId: string,
  payload: EmailTriggerPayload,
): string {
  return `email-trigger:${workflowId}:${nodeId}:${payload.uidValidity ?? "na"}:${payload.uid}`;
}
