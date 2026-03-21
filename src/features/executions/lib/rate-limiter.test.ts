import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  resetRateLimit,
  clearAllRateLimits,
  createRateLimitKey,
  getRateLimitHeaders,
  DEFAULT_RATE_LIMITS,
  type RateLimitConfig,
} from "./rate-limiter";

describe("Rate Limiter", () => {
  beforeEach(() => {
    clearAllRateLimits();
  });

  const testConfig: RateLimitConfig = { maxRequests: 3, windowMs: 1000 };

  describe("checkRateLimit", () => {
    it("should allow requests under the limit", () => {
      const result = checkRateLimit("test", testConfig);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it("should track request count", () => {
      checkRateLimit("test", testConfig);
      checkRateLimit("test", testConfig);
      const result = checkRateLimit("test", testConfig);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it("should deny requests over the limit", () => {
      checkRateLimit("test", testConfig);
      checkRateLimit("test", testConfig);
      checkRateLimit("test", testConfig);
      const result = checkRateLimit("test", testConfig);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should track separate keys independently", () => {
      checkRateLimit("key1", testConfig);
      checkRateLimit("key1", testConfig);
      checkRateLimit("key1", testConfig);

      const result = checkRateLimit("key2", testConfig);
      expect(result.allowed).toBe(true);
    });

    it("should include reset timestamp", () => {
      const result = checkRateLimit("test", testConfig);
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });

    it("should include limit in result", () => {
      const result = checkRateLimit("test", testConfig);
      expect(result.limit).toBe(3);
    });
  });

  describe("resetRateLimit", () => {
    it("should reset specific key", () => {
      checkRateLimit("test", testConfig);
      checkRateLimit("test", testConfig);
      checkRateLimit("test", testConfig);

      resetRateLimit("test");

      const result = checkRateLimit("test", testConfig);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });
  });

  describe("clearAllRateLimits", () => {
    it("should clear all rate limits", () => {
      checkRateLimit("key1", testConfig);
      checkRateLimit("key2", testConfig);

      clearAllRateLimits();

      expect(checkRateLimit("key1", testConfig).remaining).toBe(2);
      expect(checkRateLimit("key2", testConfig).remaining).toBe(2);
    });
  });

  describe("createRateLimitKey", () => {
    it("should create key from type and identifier", () => {
      expect(createRateLimitKey("api", "user123")).toBe("api:user123");
    });
  });

  describe("getRateLimitHeaders", () => {
    it("should return proper header format", () => {
      const result = checkRateLimit("test", testConfig);
      const headers = getRateLimitHeaders(result);

      expect(headers["X-RateLimit-Limit"]).toBe("3");
      expect(headers["X-RateLimit-Remaining"]).toBeDefined();
      expect(headers["X-RateLimit-Reset"]).toBeDefined();
    });
  });

  describe("DEFAULT_RATE_LIMITS", () => {
    it("should have api rate limit", () => {
      expect(DEFAULT_RATE_LIMITS.api).toBeDefined();
      expect(DEFAULT_RATE_LIMITS.api.maxRequests).toBeGreaterThan(0);
    });

    it("should have webhook rate limit", () => {
      expect(DEFAULT_RATE_LIMITS.webhook).toBeDefined();
    });

    it("should have execution rate limit", () => {
      expect(DEFAULT_RATE_LIMITS.execution).toBeDefined();
    });

    it("should have AI generation rate limit", () => {
      expect(DEFAULT_RATE_LIMITS.aiGenerate).toBeDefined();
      expect(DEFAULT_RATE_LIMITS.aiGenerate.maxRequests).toBeLessThanOrEqual(20);
    });
  });
});
