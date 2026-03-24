import { describe, expect, it } from "vitest";
import {
  buildEmailSearchQuery,
  buildEmailTriggerEventId,
  buildEmailTriggerInitialData,
  extractEmailSnippet,
  getEmailTriggerMailbox,
  getEmailTriggerMaxMessages,
  normalizeEmailTriggerMessage,
  parseImapCredential,
} from "./email-trigger";

describe("email trigger helpers", () => {
  it("parses IMAP credentials from JSON", () => {
    expect(
      parseImapCredential(
        JSON.stringify({
          host: "imap.example.com",
          port: 993,
          user: "bot@example.com",
          pass: "secret",
        }),
      ),
    ).toEqual({
      host: "imap.example.com",
      port: 993,
      secure: true,
      user: "bot@example.com",
      pass: "secret",
    });
  });

  it("builds mailbox and max message defaults", () => {
    expect(getEmailTriggerMailbox({})).toBe("INBOX");
    expect(getEmailTriggerMailbox({ mailbox: " Alerts " })).toBe("Alerts");
    expect(getEmailTriggerMaxMessages({})).toBe(10);
    expect(getEmailTriggerMaxMessages({ maxMessages: 50 })).toBe(25);
  });

  it("builds an IMAP search query from filters", () => {
    expect(
      buildEmailSearchQuery({
        from: "alerts@example.com",
        subject: "incident",
      }),
    ).toEqual({
      all: true,
      from: "alerts@example.com",
      seen: false,
      subject: "incident",
    });
  });

  it("extracts a compact email snippet from source", () => {
    const snippet = extractEmailSnippet(
      Buffer.from("Subject: Test\r\n\r\nHello  world\n\nThis is a test"),
    );

    expect(snippet).toBe("Hello world This is a test");
  });

  it("normalizes fetched email data into workflow payload", () => {
    expect(
      normalizeEmailTriggerMessage({
        uid: 42,
        uidValidity: BigInt(1234),
        mailbox: "INBOX",
        envelope: {
          subject: "Server down",
          messageId: "<msg@example.com>",
          date: new Date("2026-03-24T09:00:00.000Z"),
          from: [{ address: "alerts@example.com" }],
          to: [{ address: "ops@example.com" }],
          cc: [{ name: "Team" }],
        },
        flags: new Set(["\\Seen"]),
        source: Buffer.from("Subject: Test\r\n\r\nBody"),
      }),
    ).toEqual({
      uid: 42,
      uidValidity: "1234",
      mailbox: "INBOX",
      subject: "Server down",
      messageId: "<msg@example.com>",
      from: ["alerts@example.com"],
      to: ["ops@example.com"],
      cc: ["Team"],
      date: "2026-03-24T09:00:00.000Z",
      flags: ["\\Seen"],
      snippet: "Body",
    });
  });

  it("builds initial data and stable event ids", () => {
    const payload = {
      uid: 42,
      uidValidity: "1234",
      mailbox: "INBOX",
      from: ["alerts@example.com"],
      to: ["ops@example.com"],
      cc: [],
      flags: [],
    };

    expect(
      buildEmailTriggerInitialData({ variableName: "incomingEmail" }, payload),
    ).toEqual({
      emailTrigger: payload,
      incomingEmail: payload,
    });

    expect(buildEmailTriggerEventId("wf_1", "node_2", payload)).toBe(
      "email-trigger:wf_1:node_2:1234:42",
    );
  });
});
