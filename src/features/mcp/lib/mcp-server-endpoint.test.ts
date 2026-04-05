import { describe, it, expect, beforeEach } from "vitest";
import {
  createUserToken,
  revokeUserToken,
  isTokenValid,
  getTokenStatus,
  recordTokenUsage,
  listActiveTokens,
  findTokenByValue,
  revokeAllUserTokens,
  createEndpointConfig,
  buildEndpointUrl,
  buildMcpEndpointHeaders,
  validateEndpointRequest,
  computeTokenStats,
  describeToken,
  generateMcpClientConfig,
  resetTokenIdSeq,
  type McpUserToken,
} from "./mcp-server-endpoint";

beforeEach(() => resetTokenIdSeq());

// ─── createUserToken ──────────────────────────────────────────────────────────

describe("createUserToken", () => {
  it("creates a token with required fields", () => {
    const t = createUserToken("user_1", ["workflows:read", "executions:read"]);
    expect(t.userId).toBe("user_1");
    expect(t.scopes).toContain("workflows:read");
    expect(t.token).toMatch(/^mcp_/);
    expect(t.id).toMatch(/^mcp_tok_/);
    expect(t.createdAt).toBeInstanceOf(Date);
    expect(t.revokedAt).toBeUndefined();
  });

  it("deduplicates scopes", () => {
    const t = createUserToken("u", ["workflows:read", "workflows:read"]);
    expect(t.scopes.filter((s) => s === "workflows:read")).toHaveLength(1);
  });

  it("accepts label and expiresAt", () => {
    const exp = new Date(Date.now() + 3600_000);
    const t = createUserToken("u", ["workflows:read"], { label: "CI Token", expiresAt: exp });
    expect(t.label).toBe("CI Token");
    expect(t.expiresAt).toEqual(exp);
  });

  it("increments IDs", () => {
    const a = createUserToken("u", ["workflows:read"]);
    const b = createUserToken("u", ["workflows:read"]);
    expect(a.id).not.toBe(b.id);
  });
});

// ─── revokeUserToken ──────────────────────────────────────────────────────────

describe("revokeUserToken", () => {
  it("sets revokedAt", () => {
    const t = createUserToken("u", ["workflows:read"]);
    const revoked = revokeUserToken(t);
    expect(revoked.revokedAt).toBeInstanceOf(Date);
  });

  it("is immutable", () => {
    const t = createUserToken("u", ["workflows:read"]);
    revokeUserToken(t);
    expect(t.revokedAt).toBeUndefined();
  });
});

// ─── isTokenValid ─────────────────────────────────────────────────────────────

describe("isTokenValid", () => {
  it("active token is valid", () => {
    expect(isTokenValid(createUserToken("u", ["workflows:read"]))).toBe(true);
  });

  it("revoked token is invalid", () => {
    const t = revokeUserToken(createUserToken("u", ["workflows:read"]));
    expect(isTokenValid(t)).toBe(false);
  });

  it("expired token is invalid", () => {
    const t = createUserToken("u", ["workflows:read"], {
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(isTokenValid(t)).toBe(false);
  });

  it("future expiry is valid", () => {
    const t = createUserToken("u", ["workflows:read"], {
      expiresAt: new Date(Date.now() + 3600_000),
    });
    expect(isTokenValid(t)).toBe(true);
  });
});

// ─── getTokenStatus ───────────────────────────────────────────────────────────

describe("getTokenStatus", () => {
  it("active", () => {
    expect(getTokenStatus(createUserToken("u", ["workflows:read"]))).toBe("active");
  });

  it("revoked", () => {
    expect(getTokenStatus(revokeUserToken(createUserToken("u", ["workflows:read"])))).toBe("revoked");
  });

  it("expired", () => {
    const t = createUserToken("u", ["workflows:read"], {
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(getTokenStatus(t)).toBe("expired");
  });
});

// ─── recordTokenUsage ─────────────────────────────────────────────────────────

describe("recordTokenUsage", () => {
  it("sets lastUsedAt", () => {
    const t = createUserToken("u", ["workflows:read"]);
    const used = recordTokenUsage(t);
    expect(used.lastUsedAt).toBeInstanceOf(Date);
  });

  it("is immutable", () => {
    const t = createUserToken("u", ["workflows:read"]);
    recordTokenUsage(t);
    expect(t.lastUsedAt).toBeUndefined();
  });
});

// ─── listActiveTokens ─────────────────────────────────────────────────────────

describe("listActiveTokens", () => {
  it("returns only active tokens for the user", () => {
    const t1 = createUserToken("user_1", ["workflows:read"]);
    const t2 = revokeUserToken(createUserToken("user_1", ["workflows:read"]));
    const t3 = createUserToken("user_2", ["workflows:read"]);

    const active = listActiveTokens([t1, t2, t3], "user_1");
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(t1.id);
  });
});

// ─── findTokenByValue ─────────────────────────────────────────────────────────

describe("findTokenByValue", () => {
  it("finds token by string value", () => {
    const t = createUserToken("u", ["workflows:read"]);
    expect(findTokenByValue([t], t.token)).toEqual(t);
  });

  it("returns undefined when not found", () => {
    expect(findTokenByValue([], "nonexistent")).toBeUndefined();
  });
});

// ─── revokeAllUserTokens ──────────────────────────────────────────────────────

describe("revokeAllUserTokens", () => {
  it("revokes all active tokens for a user", () => {
    const t1 = createUserToken("user_1", ["workflows:read"]);
    const t2 = createUserToken("user_1", ["executions:read"]);
    const t3 = createUserToken("user_2", ["workflows:read"]);

    const result = revokeAllUserTokens([t1, t2, t3], "user_1");
    expect(result.filter((t) => t.userId === "user_1").every((t) => t.revokedAt)).toBe(true);
    expect(result.find((t) => t.userId === "user_2")!.revokedAt).toBeUndefined();
  });
});

// ─── buildEndpointUrl ────────────────────────────────────────────────────────

describe("buildEndpointUrl", () => {
  it("builds correct endpoint URL", () => {
    const url = buildEndpointUrl("user_123", "https://app.example.com");
    expect(url).toBe("https://app.example.com/api/mcp/user_123");
  });

  it("strips trailing slash from base", () => {
    const url = buildEndpointUrl("u", "https://example.com/");
    expect(url).toBe("https://example.com/api/mcp/u");
  });
});

// ─── createEndpointConfig ─────────────────────────────────────────────────────

describe("createEndpointConfig", () => {
  it("creates an endpoint config", () => {
    const config = createEndpointConfig("user_1", "https://app.example.com", [
      "workflows:read",
      "workflows:execute",
    ]);
    expect(config.userId).toBe("user_1");
    expect(config.endpointUrl).toContain("user_1");
    expect(config.token).toMatch(/^mcp_ep_/);
    expect(config.scopes).toContain("workflows:read");
    expect(config.createdAt).toBeInstanceOf(Date);
  });
});

// ─── buildMcpEndpointHeaders ──────────────────────────────────────────────────

describe("buildMcpEndpointHeaders", () => {
  it("includes Authorization and Content-Type", () => {
    const headers = buildMcpEndpointHeaders("my-token");
    expect(headers["Authorization"]).toBe("Bearer my-token");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("includes User-Agent when provided", () => {
    const headers = buildMcpEndpointHeaders("tok", { userAgent: "Claude/1.0" });
    expect(headers["User-Agent"]).toBe("Claude/1.0");
  });
});

// ─── validateEndpointRequest ──────────────────────────────────────────────────

describe("validateEndpointRequest", () => {
  it("returns invalid when no auth header", () => {
    const r = validateEndpointRequest(null, []);
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("Missing Authorization header");
  });

  it("returns invalid for non-Bearer scheme", () => {
    const r = validateEndpointRequest("Basic abc", []);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("Bearer"))).toBe(true);
  });

  it("returns invalid for unknown token", () => {
    const r = validateEndpointRequest("Bearer unknown_tok", []);
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("Token not found");
  });

  it("returns invalid for revoked token", () => {
    const t = revokeUserToken(createUserToken("u", ["workflows:read"]));
    const r = validateEndpointRequest(`Bearer ${t.token}`, [t]);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("revoked"))).toBe(true);
  });

  it("returns valid context for good token", () => {
    const t = createUserToken("user_1", ["workflows:read", "executions:read"]);
    const r = validateEndpointRequest(`Bearer ${t.token}`, [t], "1.2.3.4");
    expect(r.valid).toBe(true);
    expect(r.context?.userId).toBe("user_1");
    expect(r.context?.scopes).toContain("workflows:read");
    expect(r.context?.ipAddress).toBe("1.2.3.4");
  });
});

// ─── computeTokenStats ───────────────────────────────────────────────────────

describe("computeTokenStats", () => {
  it("returns zeros for empty list", () => {
    const stats = computeTokenStats([]);
    expect(stats.total).toBe(0);
    expect(stats.active).toBe(0);
  });

  it("counts active/revoked/expired and scopes", () => {
    const tokens: McpUserToken[] = [
      createUserToken("u", ["workflows:read"]),
      revokeUserToken(createUserToken("u", ["workflows:write"])),
      createUserToken("u", ["workflows:read"], { expiresAt: new Date(Date.now() - 1000) }),
    ];
    const stats = computeTokenStats(tokens);
    expect(stats.active).toBe(1);
    expect(stats.revoked).toBe(1);
    expect(stats.expired).toBe(1);
    expect(stats.byScope["workflows:read"]).toBe(2);
    expect(stats.byScope["workflows:write"]).toBe(1);
  });
});

// ─── describeToken ────────────────────────────────────────────────────────────

describe("describeToken", () => {
  it("describes an active token", () => {
    const t = createUserToken("u", ["workflows:read"], { label: "My CI Token" });
    const desc = describeToken(t);
    expect(desc).toContain("ACTIVE");
    expect(desc).toContain("My CI Token");
    expect(desc).toContain("workflows:read");
  });

  it("describes a revoked token", () => {
    const t = revokeUserToken(createUserToken("u", ["workflows:read"]));
    expect(describeToken(t)).toContain("REVOKED");
  });
});

// ─── generateMcpClientConfig ──────────────────────────────────────────────────

describe("generateMcpClientConfig", () => {
  it("generates valid client config", () => {
    const endpoint = createEndpointConfig("user_1", "https://app.example.com", ["workflows:read"]);
    const cfg = generateMcpClientConfig(endpoint);
    expect(cfg).toHaveProperty("mcpServers");
    expect((cfg.mcpServers as Record<string, unknown>)).toHaveProperty("powernode");
    const pn = (cfg.mcpServers as Record<string, { url: string; headers: Record<string, string> }>).powernode;
    expect(pn.url).toContain("user_1");
    expect(pn.headers["Authorization"]).toContain("Bearer");
  });
});
