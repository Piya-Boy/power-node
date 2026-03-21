import { describe, it, expect } from "vitest";
import { generateWebhookSecret, getWebhookUrl } from "./webhook-url";

describe("Webhook URL Utilities", () => {
  describe("generateWebhookSecret", () => {
    it("should generate a 64 char hex string", () => {
      const secret = generateWebhookSecret();
      expect(secret.length).toBe(64);
      expect(/^[a-f0-9]+$/.test(secret)).toBe(true);
    });

    it("should generate unique secrets", () => {
      const secrets = new Set(Array.from({ length: 10 }, () => generateWebhookSecret()));
      expect(secrets.size).toBe(10);
    });
  });

  describe("getWebhookUrl", () => {
    it("should construct URL with base URL", () => {
      const url = getWebhookUrl("abc123", "https://app.example.com");
      expect(url).toBe("https://app.example.com/api/webhooks/trigger/abc123");
    });

    it("should use default localhost when no base URL", () => {
      const url = getWebhookUrl("secret123");
      expect(url).toContain("/api/webhooks/trigger/secret123");
    });
  });
});
