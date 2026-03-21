import { describe, it, expect } from "vitest";
import {
  calculateDelay,
  isRetryableError,
  categorizeError,
  formatExecutionError,
  DEFAULT_RETRY_CONFIG,
  NO_RETRY_CONFIG,
} from "./retry-policy";

describe("Retry Policy", () => {
  describe("calculateDelay", () => {
    const noJitterConfig = { ...DEFAULT_RETRY_CONFIG, jitter: false };

    it("should calculate exponential backoff", () => {
      expect(calculateDelay(0, noJitterConfig)).toBe(1000);
      expect(calculateDelay(1, noJitterConfig)).toBe(2000);
      expect(calculateDelay(2, noJitterConfig)).toBe(4000);
    });

    it("should cap at maxDelayMs", () => {
      const config = { ...noJitterConfig, maxDelayMs: 3000 };
      expect(calculateDelay(2, config)).toBe(3000);
    });

    it("should return -1 when max retries exceeded", () => {
      expect(calculateDelay(3, noJitterConfig)).toBe(-1);
    });

    it("should add jitter when enabled", () => {
      const delays = new Set<number>();
      for (let i = 0; i < 10; i++) {
        delays.add(calculateDelay(0, DEFAULT_RETRY_CONFIG));
      }
      // With jitter, we should get varying values
      expect(delays.size).toBeGreaterThan(1);
    });

    it("should return -1 with NO_RETRY_CONFIG", () => {
      expect(calculateDelay(0, NO_RETRY_CONFIG)).toBe(-1);
    });
  });

  describe("isRetryableError", () => {
    it("should retry rate limit errors", () => {
      expect(isRetryableError(new Error("Rate limit exceeded"))).toBe(true);
      expect(isRetryableError(new Error("HTTP 429 Too Many Requests"))).toBe(true);
    });

    it("should retry timeout errors", () => {
      expect(isRetryableError(new Error("Request timeout"))).toBe(true);
      expect(isRetryableError(new Error("Connection timed out"))).toBe(true);
    });

    it("should retry network errors", () => {
      expect(isRetryableError(new Error("ECONNRESET"))).toBe(true);
      expect(isRetryableError(new Error("ECONNREFUSED"))).toBe(true);
      expect(isRetryableError(new Error("Network error"))).toBe(true);
    });

    it("should retry server errors", () => {
      expect(isRetryableError(new Error("HTTP 500"))).toBe(true);
      expect(isRetryableError(new Error("HTTP 502"))).toBe(true);
      expect(isRetryableError(new Error("HTTP 503"))).toBe(true);
    });

    it("should not retry auth errors", () => {
      expect(isRetryableError(new Error("Unauthorized 401"))).toBe(false);
      expect(isRetryableError(new Error("Forbidden 403"))).toBe(false);
    });

    it("should not retry validation errors", () => {
      expect(isRetryableError(new Error("Invalid input"))).toBe(false);
      expect(isRetryableError(new Error("Validation failed"))).toBe(false);
    });

    it("should not retry not found errors", () => {
      expect(isRetryableError(new Error("Not found 404"))).toBe(false);
    });

    it("should not retry non-Error values", () => {
      expect(isRetryableError("string error")).toBe(false);
    });
  });

  describe("categorizeError", () => {
    it("should categorize rate limit errors", () => {
      expect(categorizeError(new Error("Rate limit exceeded"))).toBe("rate_limit");
    });

    it("should categorize timeout errors", () => {
      expect(categorizeError(new Error("Request timeout"))).toBe("timeout");
    });

    it("should categorize auth errors", () => {
      expect(categorizeError(new Error("Unauthorized"))).toBe("authentication");
      expect(categorizeError(new Error("Forbidden"))).toBe("authentication");
    });

    it("should categorize validation errors", () => {
      expect(categorizeError(new Error("Invalid input"))).toBe("validation");
    });

    it("should categorize network errors", () => {
      expect(categorizeError(new Error("ECONNREFUSED"))).toBe("network");
    });

    it("should categorize server errors", () => {
      expect(categorizeError(new Error("HTTP 500"))).toBe("server");
    });

    it("should return unknown for unrecognized errors", () => {
      expect(categorizeError(new Error("Something went wrong"))).toBe("unknown");
    });

    it("should return unknown for non-Error values", () => {
      expect(categorizeError("string")).toBe("unknown");
    });
  });

  describe("formatExecutionError", () => {
    it("should format Error objects", () => {
      const result = formatExecutionError(new Error("Rate limit exceeded"));
      expect(result.message).toBe("Rate limit exceeded");
      expect(result.category).toBe("rate_limit");
      expect(result.retryable).toBe(true);
      expect(result.stack).toBeDefined();
    });

    it("should format non-Error values", () => {
      const result = formatExecutionError("string error");
      expect(result.message).toBe("string error");
      expect(result.category).toBe("unknown");
      expect(result.retryable).toBe(false);
      expect(result.stack).toBeUndefined();
    });

    it("should correctly flag non-retryable errors", () => {
      const result = formatExecutionError(new Error("Unauthorized"));
      expect(result.retryable).toBe(false);
    });
  });
});
