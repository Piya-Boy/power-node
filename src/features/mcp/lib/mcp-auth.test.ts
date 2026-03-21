import { describe, it, expect } from "vitest";
import {
  getRequiredScopes,
  hasRequiredScopes,
  isTokenExpired,
  parseBearerToken,
  parseScopes,
  formatScopes,
  hasAnyScope,
  buildMcpTokenPayload,
  type McpTokenPayload,
} from "./mcp-auth";

const makePayload = (overrides: Partial<McpTokenPayload> = {}): McpTokenPayload => ({
  userId: "user-1",
  apiKeyId: "key-1",
  scopes: ["workflows:read", "workflows:execute", "executions:read"],
  ...overrides,
});

describe("getRequiredScopes", () => {
  it("returns scopes for known tools", () => {
    expect(getRequiredScopes("list_workflows")).toEqual(["workflows:read"]);
    expect(getRequiredScopes("execute_workflow")).toEqual(["workflows:execute"]);
    expect(getRequiredScopes("create_workflow")).toEqual(["workflows:write"]);
  });

  it("returns empty array for unknown tools", () => {
    expect(getRequiredScopes("nonexistent")).toEqual([]);
  });
});

describe("hasRequiredScopes", () => {
  it("returns true when all required scopes present", () => {
    const payload = makePayload();
    expect(hasRequiredScopes(payload, "list_workflows")).toBe(true);
    expect(hasRequiredScopes(payload, "execute_workflow")).toBe(true);
  });

  it("returns false when missing required scope", () => {
    const payload = makePayload({ scopes: ["workflows:read"] });
    expect(hasRequiredScopes(payload, "execute_workflow")).toBe(false);
    expect(hasRequiredScopes(payload, "create_workflow")).toBe(false);
  });

  it("returns true for unknown tools (no required scopes)", () => {
    expect(hasRequiredScopes(makePayload(), "nonexistent")).toBe(true);
  });
});

describe("isTokenExpired", () => {
  it("returns false when no expiry", () => {
    expect(isTokenExpired(makePayload())).toBe(false);
  });

  it("returns false for future expiry", () => {
    const payload = makePayload({ expiresAt: new Date(Date.now() + 3600_000) });
    expect(isTokenExpired(payload)).toBe(false);
  });

  it("returns true for past expiry", () => {
    const payload = makePayload({ expiresAt: new Date(Date.now() - 1000) });
    expect(isTokenExpired(payload)).toBe(true);
  });
});

describe("parseBearerToken", () => {
  it("parses valid Bearer header", () => {
    expect(parseBearerToken("Bearer my-api-token-123")).toBe("my-api-token-123");
  });

  it("is case-insensitive for Bearer prefix", () => {
    expect(parseBearerToken("bearer mytoken")).toBe("mytoken");
    expect(parseBearerToken("BEARER mytoken")).toBe("mytoken");
  });

  it("returns null for invalid headers", () => {
    expect(parseBearerToken(null)).toBeNull();
    expect(parseBearerToken(undefined)).toBeNull();
    expect(parseBearerToken("Basic abc123")).toBeNull();
    expect(parseBearerToken("")).toBeNull();
  });
});

describe("parseScopes", () => {
  it("parses valid scope strings", () => {
    const scopes = parseScopes("workflows:read workflows:write");
    expect(scopes).toContain("workflows:read");
    expect(scopes).toContain("workflows:write");
  });

  it("ignores invalid scopes", () => {
    const scopes = parseScopes("workflows:read invalid:scope");
    expect(scopes).toEqual(["workflows:read"]);
  });

  it("returns empty array for empty string", () => {
    expect(parseScopes("")).toEqual([]);
  });
});

describe("formatScopes", () => {
  it("formats scopes as space-delimited string", () => {
    expect(formatScopes(["workflows:read", "executions:read"])).toBe("workflows:read executions:read");
  });

  it("returns empty string for empty array", () => {
    expect(formatScopes([])).toBe("");
  });
});

describe("hasAnyScope", () => {
  it("returns true when at least one scope matches", () => {
    const payload = makePayload({ scopes: ["workflows:read"] });
    expect(hasAnyScope(payload, ["workflows:read", "workflows:write"])).toBe(true);
  });

  it("returns false when no scopes match", () => {
    const payload = makePayload({ scopes: ["workflows:read"] });
    expect(hasAnyScope(payload, ["workflows:write", "credentials:read"])).toBe(false);
  });
});

describe("buildMcpTokenPayload", () => {
  it("builds payload without expiry", () => {
    const payload = buildMcpTokenPayload({
      userId: "u1",
      apiKeyId: "k1",
      scopes: ["workflows:read"],
    });
    expect(payload.userId).toBe("u1");
    expect(payload.expiresAt).toBeUndefined();
  });

  it("builds payload with expiry", () => {
    const payload = buildMcpTokenPayload({
      userId: "u1",
      apiKeyId: "k1",
      scopes: ["workflows:read"],
      expiresInSeconds: 3600,
    });
    expect(payload.expiresAt).toBeInstanceOf(Date);
    expect(payload.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });
});
