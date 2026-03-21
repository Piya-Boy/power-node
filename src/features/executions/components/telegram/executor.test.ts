import { describe, it, expect } from "vitest";

// Test Telegram executor validation logic
type TelegramData = {
  variableName?: string;
  credentialId?: string;
  chatId?: string;
  message?: string;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
};

function validateTelegramData(data: TelegramData): string | null {
  if (!data.variableName) return "Telegram node: Variable name is missing";
  if (!data.credentialId) return "Telegram node: Bot token credential is required";
  if (!data.chatId) return "Telegram node: Chat ID is required";
  if (!data.message) return "Telegram node: Message is required";
  return null;
}

function buildTelegramPayload(chatId: string, message: string, parseMode?: string) {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: message,
  };
  if (parseMode) {
    payload.parse_mode = parseMode;
  }
  return payload;
}

describe("Telegram Executor Validation", () => {
  it("should require variable name", () => {
    expect(validateTelegramData({
      credentialId: "cred1", chatId: "123", message: "hi",
    })).toBe("Telegram node: Variable name is missing");
  });

  it("should require credential", () => {
    expect(validateTelegramData({
      variableName: "result", chatId: "123", message: "hi",
    })).toBe("Telegram node: Bot token credential is required");
  });

  it("should require chat ID", () => {
    expect(validateTelegramData({
      variableName: "result", credentialId: "cred1", message: "hi",
    })).toBe("Telegram node: Chat ID is required");
  });

  it("should require message", () => {
    expect(validateTelegramData({
      variableName: "result", credentialId: "cred1", chatId: "123",
    })).toBe("Telegram node: Message is required");
  });

  it("should pass with all required fields", () => {
    expect(validateTelegramData({
      variableName: "result", credentialId: "cred1", chatId: "123", message: "hello",
    })).toBeNull();
  });

  it("should build payload without parse mode", () => {
    const payload = buildTelegramPayload("123", "hello");
    expect(payload).toEqual({
      chat_id: "123",
      text: "hello",
    });
    expect(payload.parse_mode).toBeUndefined();
  });

  it("should build payload with HTML parse mode", () => {
    const payload = buildTelegramPayload("123", "<b>hello</b>", "HTML");
    expect(payload).toEqual({
      chat_id: "123",
      text: "<b>hello</b>",
      parse_mode: "HTML",
    });
  });

  it("should build payload with MarkdownV2 parse mode", () => {
    const payload = buildTelegramPayload("-1001234567890", "Hello *world*", "MarkdownV2");
    expect(payload.chat_id).toBe("-1001234567890");
    expect(payload.parse_mode).toBe("MarkdownV2");
  });
});
