import { describe, it, expect } from "vitest";
import {
  parseUrl,
  buildUrl,
  normalizeMethod,
  isJsonContentType,
  parseResponseBody,
  buildAuthHeader,
  extractHttpError,
} from "./http-utils";

describe("HTTP Utilities", () => {
  describe("parseUrl", () => {
    it("should parse a full URL", () => {
      const result = parseUrl("https://api.example.com:8080/v1/users?page=1&limit=10");
      expect(result?.protocol).toBe("https");
      expect(result?.hostname).toBe("api.example.com");
      expect(result?.port).toBe("8080");
      expect(result?.pathname).toBe("/v1/users");
      expect(result?.params.page).toBe("1");
      expect(result?.params.limit).toBe("10");
    });

    it("should return null port for default ports", () => {
      const result = parseUrl("https://example.com/path");
      expect(result?.port).toBeNull();
    });

    it("should return null for invalid URLs", () => {
      expect(parseUrl("not a url")).toBeNull();
      expect(parseUrl("")).toBeNull();
    });

    it("should parse URL without params", () => {
      const result = parseUrl("https://example.com/path");
      expect(result?.params).toEqual({});
    });
  });

  describe("buildUrl", () => {
    it("should append query params", () => {
      const url = buildUrl("https://api.example.com/users", { page: 1, limit: 10 });
      expect(url).toContain("page=1");
      expect(url).toContain("limit=10");
    });

    it("should skip null and undefined params", () => {
      const url = buildUrl("https://api.example.com", { a: "val", b: null, c: undefined });
      expect(url).toContain("a=val");
      expect(url).not.toContain("b=");
      expect(url).not.toContain("c=");
    });

    it("should return base url on invalid base", () => {
      expect(buildUrl("not-a-url", {})).toBe("not-a-url");
    });

    it("should handle boolean params", () => {
      const url = buildUrl("https://api.example.com", { active: true });
      expect(url).toContain("active=true");
    });
  });

  describe("normalizeMethod", () => {
    it("should normalize to uppercase", () => {
      expect(normalizeMethod("get")).toBe("GET");
      expect(normalizeMethod("post")).toBe("POST");
    });

    it("should default to GET for unknown methods", () => {
      expect(normalizeMethod("UNKNOWN")).toBe("GET");
    });

    it("should accept all valid methods", () => {
      const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
      for (const m of methods) {
        expect(normalizeMethod(m)).toBe(m);
      }
    });
  });

  describe("isJsonContentType", () => {
    it("should detect application/json", () => {
      expect(isJsonContentType("application/json")).toBe(true);
      expect(isJsonContentType("application/json; charset=utf-8")).toBe(true);
    });

    it("should detect +json content types", () => {
      expect(isJsonContentType("application/problem+json")).toBe(true);
    });

    it("should reject non-JSON", () => {
      expect(isJsonContentType("text/html")).toBe(false);
      expect(isJsonContentType("text/plain")).toBe(false);
    });
  });

  describe("parseResponseBody", () => {
    it("should parse JSON body", () => {
      const result = parseResponseBody('{"key":"value"}', "application/json");
      expect(result).toEqual({ key: "value" });
    });

    it("should return raw string for non-JSON", () => {
      const result = parseResponseBody("plain text", "text/plain");
      expect(result).toBe("plain text");
    });

    it("should return string on invalid JSON", () => {
      const result = parseResponseBody("invalid json{", "application/json");
      expect(result).toBe("invalid json{");
    });
  });

  describe("buildAuthHeader", () => {
    it("should build bearer token header", () => {
      const headers = buildAuthHeader("bearer", "mytoken");
      expect(headers.Authorization).toBe("Bearer mytoken");
    });

    it("should build basic auth header", () => {
      const headers = buildAuthHeader("basic", "user:pass");
      expect(headers.Authorization).toMatch(/^Basic /);
    });

    it("should build API key header", () => {
      const headers = buildAuthHeader("api_key", "my-key", "X-Custom-Key");
      expect(headers["X-Custom-Key"]).toBe("my-key");
    });

    it("should use default X-API-Key for api_key without headerName", () => {
      const headers = buildAuthHeader("api_key", "my-key");
      expect(headers["X-API-Key"]).toBe("my-key");
    });
  });

  describe("extractHttpError", () => {
    it("should include status code and message", () => {
      const msg = extractHttpError(404, null);
      expect(msg).toContain("404");
      expect(msg).toContain("Not Found");
    });

    it("should extract message from JSON body", () => {
      const msg = extractHttpError(400, { message: "Invalid input" });
      expect(msg).toContain("Invalid input");
    });

    it("should extract error field from body", () => {
      const msg = extractHttpError(401, { error: "Token expired" });
      expect(msg).toContain("Token expired");
    });

    it("should include short string bodies", () => {
      const msg = extractHttpError(500, "Internal error");
      expect(msg).toContain("Internal error");
    });

    it("should handle unknown status codes", () => {
      const msg = extractHttpError(418, null);
      expect(msg).toContain("418");
    });
  });
});
