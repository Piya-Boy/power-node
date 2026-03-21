import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, isValidApiKeyFormat, maskApiKey } from "./api-key";

describe("API Key Utilities", () => {
  describe("generateApiKey", () => {
    it("should generate a key with pn_ prefix", () => {
      const key = generateApiKey();
      expect(key.startsWith("pn_")).toBe(true);
    });

    it("should generate a key of correct length", () => {
      const key = generateApiKey();
      // pn_ (3) + 64 hex chars = 67
      expect(key.length).toBe(67);
    });

    it("should generate unique keys", () => {
      const keys = new Set(Array.from({ length: 10 }, () => generateApiKey()));
      expect(keys.size).toBe(10);
    });
  });

  describe("hashApiKey", () => {
    it("should produce consistent hash for same input", () => {
      const key = "pn_test123";
      expect(hashApiKey(key)).toBe(hashApiKey(key));
    });

    it("should produce different hashes for different inputs", () => {
      expect(hashApiKey("pn_key1")).not.toBe(hashApiKey("pn_key2"));
    });

    it("should produce a 64 char hex string", () => {
      const hash = hashApiKey("pn_test");
      expect(hash.length).toBe(64);
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
    });
  });

  describe("isValidApiKeyFormat", () => {
    it("should accept valid API key format", () => {
      const key = generateApiKey();
      expect(isValidApiKeyFormat(key)).toBe(true);
    });

    it("should reject key without prefix", () => {
      expect(isValidApiKeyFormat("abc123")).toBe(false);
    });

    it("should reject key with wrong length", () => {
      expect(isValidApiKeyFormat("pn_tooshort")).toBe(false);
    });

    it("should reject empty string", () => {
      expect(isValidApiKeyFormat("")).toBe(false);
    });
  });

  describe("maskApiKey", () => {
    it("should mask the middle of a key", () => {
      const key = generateApiKey();
      const masked = maskApiKey(key);
      expect(masked).toContain("...");
      expect(masked.startsWith("pn_")).toBe(true);
      expect(masked.length).toBeLessThan(key.length);
    });

    it("should show first 7 and last 4 chars", () => {
      const key = "pn_abcdefghijklmnop";
      const masked = maskApiKey(key);
      expect(masked).toBe("pn_abcd...mnop");
    });

    it("should handle short keys", () => {
      expect(maskApiKey("short")).toBe("***");
    });
  });
});
