import { describe, it, expect } from "vitest";
import {
  hash,
  hmac,
  base64Encode,
  base64Decode,
  base64UrlEncode,
  base64UrlDecode,
  hexEncode,
  hexDecode,
  generateUuid,
  randomHex,
  secureCompare,
  verifyHmac,
} from "./crypto-utils";

describe("Crypto Utilities", () => {
  describe("hash", () => {
    it("should produce consistent SHA256 hash", () => {
      const h = hash("hello");
      expect(h).toBe(hash("hello"));
      expect(h.length).toBe(64);
    });

    it("should produce different hash for different input", () => {
      expect(hash("hello")).not.toBe(hash("world"));
    });

    it("should support SHA512", () => {
      expect(hash("hello", "sha512").length).toBe(128);
    });

    it("should support MD5", () => {
      expect(hash("hello", "md5").length).toBe(32);
    });

    it("should support base64 encoding", () => {
      const h = hash("hello", "sha256", "base64");
      expect(h).toMatch(/^[A-Za-z0-9+/=]+$/);
    });
  });

  describe("hmac", () => {
    it("should produce consistent HMAC", () => {
      const h = hmac("message", "secret");
      expect(h).toBe(hmac("message", "secret"));
    });

    it("should differ with different secrets", () => {
      expect(hmac("msg", "secret1")).not.toBe(hmac("msg", "secret2"));
    });

    it("should produce 64-char hex for SHA256", () => {
      expect(hmac("msg", "key").length).toBe(64);
    });
  });

  describe("base64Encode/Decode", () => {
    it("should round-trip encode/decode", () => {
      const original = "Hello, World!";
      expect(base64Decode(base64Encode(original))).toBe(original);
    });

    it("should produce standard base64", () => {
      expect(base64Encode("hello")).toBe("aGVsbG8=");
    });
  });

  describe("base64UrlEncode/Decode", () => {
    it("should round-trip encode/decode", () => {
      const original = "Hello, World! This has + and / chars";
      expect(base64UrlDecode(base64UrlEncode(original))).toBe(original);
    });

    it("should not contain +, /, or = chars", () => {
      const encoded = base64UrlEncode("some data to encode");
      expect(encoded).not.toContain("+");
      expect(encoded).not.toContain("/");
      expect(encoded).not.toContain("=");
    });
  });

  describe("hexEncode/Decode", () => {
    it("should round-trip encode/decode", () => {
      const original = "Hello";
      expect(hexDecode(hexEncode(original))).toBe(original);
    });

    it("should produce lowercase hex", () => {
      const encoded = hexEncode("A");
      expect(encoded).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe("generateUuid", () => {
    it("should generate valid UUIDs", () => {
      const uuid = generateUuid();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it("should generate unique UUIDs", () => {
      const uuids = new Set(Array.from({ length: 10 }, generateUuid));
      expect(uuids.size).toBe(10);
    });
  });

  describe("randomHex", () => {
    it("should generate hex of correct length", () => {
      expect(randomHex(16).length).toBe(32); // 16 bytes = 32 hex chars
    });

    it("should generate unique values", () => {
      const vals = new Set(Array.from({ length: 10 }, () => randomHex()));
      expect(vals.size).toBe(10);
    });
  });

  describe("secureCompare", () => {
    it("should return true for equal strings", () => {
      expect(secureCompare("hello", "hello")).toBe(true);
    });

    it("should return false for different strings of same length", () => {
      expect(secureCompare("hello", "world")).toBe(false);
    });

    it("should return false for different lengths", () => {
      expect(secureCompare("hello", "hi")).toBe(false);
    });
  });

  describe("verifyHmac", () => {
    it("should verify valid signature", () => {
      const signature = hmac("message", "secret");
      expect(verifyHmac("message", signature, "secret")).toBe(true);
    });

    it("should reject invalid signature", () => {
      expect(verifyHmac("message", "wrong_sig", "secret")).toBe(false);
    });

    it("should reject tampered message", () => {
      const signature = hmac("original", "secret");
      expect(verifyHmac("tampered", signature, "secret")).toBe(false);
    });
  });
});
