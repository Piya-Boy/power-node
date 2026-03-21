/**
 * Phase 27 — MCP: Authentication utilities for MCP server endpoint
 */

export interface McpTokenPayload {
  userId: string;
  apiKeyId: string;
  scopes: McpScope[];
  expiresAt?: Date;
}

export type McpScope =
  | "workflows:read"
  | "workflows:write"
  | "workflows:execute"
  | "executions:read"
  | "credentials:read";

export const ALL_MCP_SCOPES: McpScope[] = [
  "workflows:read",
  "workflows:write",
  "workflows:execute",
  "executions:read",
  "credentials:read",
];

// Map MCP tool names to required scopes
const TOOL_SCOPES: Record<string, McpScope[]> = {
  list_workflows: ["workflows:read"],
  get_workflow: ["workflows:read"],
  create_workflow: ["workflows:write"],
  update_workflow: ["workflows:write"],
  execute_workflow: ["workflows:execute"],
  get_execution_status: ["executions:read"],
  get_execution_result: ["executions:read"],
  list_executions: ["executions:read"],
};

/**
 * Get required scopes for a tool call.
 */
export function getRequiredScopes(toolName: string): McpScope[] {
  return TOOL_SCOPES[toolName] ?? [];
}

/**
 * Check if a token payload has all required scopes for a tool.
 */
export function hasRequiredScopes(
  payload: McpTokenPayload,
  toolName: string
): boolean {
  const required = getRequiredScopes(toolName);
  return required.every((scope) => payload.scopes.includes(scope));
}

/**
 * Check if a token is expired.
 */
export function isTokenExpired(payload: McpTokenPayload): boolean {
  if (!payload.expiresAt) return false;
  return new Date() > payload.expiresAt;
}

/**
 * Parse a Bearer token from an Authorization header.
 * Returns the token string or null.
 */
export function parseBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

/**
 * Validate scopes string format (e.g. "workflows:read workflows:write").
 */
export function parseScopes(scopeStr: string): McpScope[] {
  return scopeStr
    .split(/\s+/)
    .filter((s) => (ALL_MCP_SCOPES as string[]).includes(s)) as McpScope[];
}

/**
 * Format scopes as a space-delimited string.
 */
export function formatScopes(scopes: McpScope[]): string {
  return scopes.join(" ");
}

/**
 * Check if a scope string has at least one valid scope.
 */
export function hasAnyScope(payload: McpTokenPayload, scopes: McpScope[]): boolean {
  return scopes.some((s) => payload.scopes.includes(s));
}

/**
 * Build a minimal MCP token payload (without expiry).
 */
export function buildMcpTokenPayload(params: {
  userId: string;
  apiKeyId: string;
  scopes: McpScope[];
  expiresInSeconds?: number;
}): McpTokenPayload {
  const { userId, apiKeyId, scopes, expiresInSeconds } = params;
  return {
    userId,
    apiKeyId,
    scopes,
    expiresAt: expiresInSeconds
      ? new Date(Date.now() + expiresInSeconds * 1000)
      : undefined,
  };
}
