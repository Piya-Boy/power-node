/**
 * Phase 96 — MCP Server Endpoint & Per-user Token
 * Utilities for exposing PowerNode as a live MCP HTTP endpoint
 * with per-user token management.
 */

import type { McpScope } from "./mcp-auth";

// ─── Types ────────────────────────────────────────────────────────────────────

export type McpTokenStatus = "active" | "revoked" | "expired";

export interface McpUserToken {
  id: string;
  userId: string;
  token: string;
  scopes: McpScope[];
  label: string;
  createdAt: Date;
  expiresAt?: Date;
  lastUsedAt?: Date;
  revokedAt?: Date;
}

export interface McpEndpointConfig {
  userId: string;
  endpointUrl: string;
  token: string;
  scopes: McpScope[];
  createdAt: Date;
}

export interface McpRequestContext {
  userId: string;
  tokenId: string;
  scopes: McpScope[];
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface McpEndpointValidation {
  valid: boolean;
  errors: string[];
  context?: McpRequestContext;
}

export interface McpTokenStats {
  total: number;
  active: number;
  revoked: number;
  expired: number;
  byScope: Record<string, number>;
}

// ─── ID / Token Generation ────────────────────────────────────────────────────

let _tokenIdSeq = 1;
export function resetTokenIdSeq() { _tokenIdSeq = 1; }

/**
 * Generate a random MCP user token string (32-char hex).
 * In production this should use crypto.randomBytes.
 */
export function generateTokenString(prefix = "mcp"): string {
  const chars = "abcdef0123456789";
  let hex = "";
  for (let i = 0; i < 32; i++) {
    hex += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}_${hex}`;
}

// ─── Token Management ─────────────────────────────────────────────────────────

/**
 * Create a per-user MCP token with specified scopes.
 */
export function createUserToken(
  userId: string,
  scopes: McpScope[],
  opts: { label?: string; expiresAt?: Date } = {}
): McpUserToken {
  return {
    id: `mcp_tok_${_tokenIdSeq++}`,
    userId,
    token: generateTokenString("mcp"),
    scopes: [...new Set(scopes)],
    label: opts.label ?? "Default MCP Token",
    createdAt: new Date(),
    expiresAt: opts.expiresAt,
  };
}

/**
 * Revoke a user token. Returns updated token (immutable).
 */
export function revokeUserToken(token: McpUserToken): McpUserToken {
  return { ...token, revokedAt: new Date() };
}

/**
 * Check if a token is currently valid.
 */
export function isTokenValid(token: McpUserToken): boolean {
  if (token.revokedAt) return false;
  if (token.expiresAt && new Date() > token.expiresAt) return false;
  return true;
}

/**
 * Get the status of a token.
 */
export function getTokenStatus(token: McpUserToken): McpTokenStatus {
  if (token.revokedAt) return "revoked";
  if (token.expiresAt && new Date() > token.expiresAt) return "expired";
  return "active";
}

/**
 * Record usage of a token (updates lastUsedAt). Immutable.
 */
export function recordTokenUsage(token: McpUserToken): McpUserToken {
  return { ...token, lastUsedAt: new Date() };
}

/**
 * List only active tokens for a user.
 */
export function listActiveTokens(
  tokens: McpUserToken[],
  userId: string
): McpUserToken[] {
  return tokens.filter((t) => t.userId === userId && isTokenValid(t));
}

/**
 * Find a token by its token string value.
 */
export function findTokenByValue(
  tokens: McpUserToken[],
  tokenString: string
): McpUserToken | undefined {
  return tokens.find((t) => t.token === tokenString);
}

/**
 * Revoke all tokens for a user (e.g. on account deletion).
 */
export function revokeAllUserTokens(
  tokens: McpUserToken[],
  userId: string
): McpUserToken[] {
  return tokens.map((t) => (t.userId === userId && isTokenValid(t) ? revokeUserToken(t) : t));
}

// ─── Endpoint Config ──────────────────────────────────────────────────────────

/**
 * Build a per-user MCP endpoint configuration.
 */
export function createEndpointConfig(
  userId: string,
  baseUrl: string,
  scopes: McpScope[]
): McpEndpointConfig {
  const endpointUrl = buildEndpointUrl(userId, baseUrl);
  return {
    userId,
    endpointUrl,
    token: generateTokenString("mcp_ep"),
    scopes: [...new Set(scopes)],
    createdAt: new Date(),
  };
}

/**
 * Build the per-user MCP endpoint URL.
 */
export function buildEndpointUrl(userId: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/api/mcp/${encodeURIComponent(userId)}`;
}

/**
 * Build headers for a MCP endpoint request.
 */
export function buildMcpEndpointHeaders(
  token: string,
  opts: { userAgent?: string } = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (opts.userAgent) {
    headers["User-Agent"] = opts.userAgent;
  }
  return headers;
}

// ─── Request Validation ───────────────────────────────────────────────────────

/**
 * Validate an incoming MCP endpoint request.
 * Resolves the token from the bearer header and checks expiry/revoke.
 */
export function validateEndpointRequest(
  authHeader: string | null | undefined,
  tokens: McpUserToken[],
  ipAddress?: string,
  userAgent?: string
): McpEndpointValidation {
  if (!authHeader) {
    return { valid: false, errors: ["Missing Authorization header"] };
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { valid: false, errors: ["Authorization header must use Bearer scheme"] };
  }

  const tokenString = match[1];
  const found = findTokenByValue(tokens, tokenString);

  if (!found) {
    return { valid: false, errors: ["Token not found"] };
  }

  if (!isTokenValid(found)) {
    const status = getTokenStatus(found);
    return { valid: false, errors: [`Token is ${status}`] };
  }

  return {
    valid: true,
    errors: [],
    context: {
      userId: found.userId,
      tokenId: found.id,
      scopes: found.scopes,
      ipAddress,
      userAgent,
      timestamp: new Date(),
    },
  };
}

// ─── Stats ────────────────────────────────────────────────────────────────────

/**
 * Compute summary statistics for a set of MCP tokens.
 */
export function computeTokenStats(tokens: McpUserToken[]): McpTokenStats {
  const byScope: Record<string, number> = {};
  let active = 0;
  let revoked = 0;
  let expired = 0;

  for (const t of tokens) {
    const status = getTokenStatus(t);
    if (status === "active") active++;
    else if (status === "revoked") revoked++;
    else expired++;

    for (const scope of t.scopes) {
      byScope[scope] = (byScope[scope] ?? 0) + 1;
    }
  }

  return { total: tokens.length, active, revoked, expired, byScope };
}

/**
 * Human-readable summary for a token.
 */
export function describeToken(token: McpUserToken): string {
  const status = getTokenStatus(token);
  const scopes = token.scopes.join(", ");
  const exp = token.expiresAt ? ` expires ${token.expiresAt.toISOString()}` : " no expiry";
  return `[${status.toUpperCase()}] ${token.label} — ${scopes}${exp}`;
}

/**
 * Generate a human-readable snippet for Claude/Cursor MCP config.
 */
export function generateMcpClientConfig(
  config: McpEndpointConfig
): Record<string, unknown> {
  return {
    mcpServers: {
      powernode: {
        url: config.endpointUrl,
        headers: {
          Authorization: `Bearer ${config.token}`,
        },
      },
    },
  };
}
