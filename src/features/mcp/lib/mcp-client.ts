/**
 * Phase 97 — MCP Client Utilities
 * Pure helper functions for building and using MCP client connections,
 * formatting requests, validating tool calls, and parsing responses.
 */

import type { McpTool, McpToolCallRequest, McpToolCallResult, McpContent, PowerNodeMcpServerInfo } from "./mcp-types";
import type { McpAuthConfig } from "./mcp-types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface McpClientConfig {
  serverUrl: string;
  auth: McpAuthConfig;
  timeout: number;
  retries: number;
  userAgent: string;
}

export interface McpUrlValidation {
  valid: boolean;
  errors: string[];
  normalizedUrl?: string;
}

export interface McpToolArgValidation {
  valid: boolean;
  errors: string[];
}

export interface McpParsedResult {
  success: boolean;
  texts: string[];
  images: { data: string; mimeType: string }[];
  resources: { uri: string; mimeType?: string; text?: string }[];
  isError: boolean;
}

export interface McpClientStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  toolUsage: Record<string, number>;
  averageContentItems: number;
}

export interface McpToolCallRecord {
  toolName: string;
  success: boolean;
  contentCount: number;
}

// ─── Config Helpers ───────────────────────────────────────────────────────────

/**
 * Creates a default MCP client configuration.
 */
export function createMcpClientConfig(
  serverUrl: string,
  auth: McpAuthConfig,
  opts: { timeout?: number; retries?: number; userAgent?: string } = {},
): McpClientConfig {
  return {
    serverUrl: serverUrl.replace(/\/$/, ""),
    auth,
    timeout: opts.timeout ?? 30_000,
    retries: opts.retries ?? 2,
    userAgent: opts.userAgent ?? "PowerNode-MCP-Client/1.0",
  };
}

// ─── URL Validation ───────────────────────────────────────────────────────────

/**
 * Validates and normalises an MCP server URL.
 */
export function validateServerUrl(url: string): McpUrlValidation {
  const errors: string[] = [];

  if (!url || typeof url !== "string") {
    return { valid: false, errors: ["URL is required"] };
  }

  const trimmed = url.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, errors: ["Invalid URL format"] };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    errors.push("URL must use http or https protocol");
  }

  if (!parsed.hostname) {
    errors.push("URL must include a hostname");
  }

  if (errors.length > 0) return { valid: false, errors };

  return { valid: true, errors: [], normalizedUrl: parsed.toString().replace(/\/$/, "") };
}

// ─── Header Building ──────────────────────────────────────────────────────────

/**
 * Builds HTTP headers for an MCP client request based on the auth config.
 */
export function buildClientHeaders(
  auth: McpAuthConfig,
  opts: { userAgent?: string } = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (opts.userAgent) {
    headers["User-Agent"] = opts.userAgent;
  }

  switch (auth.type) {
    case "api_key":
      if (auth.apiKey) headers["X-API-Key"] = auth.apiKey;
      break;
    case "bearer":
      if (auth.bearerToken) headers["Authorization"] = `Bearer ${auth.bearerToken}`;
      break;
    case "none":
      break;
  }

  return headers;
}

// ─── Request Building ─────────────────────────────────────────────────────────

/**
 * Constructs a typed MCP tool call request.
 */
export function buildToolCallRequest(
  toolName: string,
  args: Record<string, unknown>,
): McpToolCallRequest {
  return { name: toolName, arguments: args };
}

/**
 * Validates that arguments match the tool's input schema.
 * Checks required fields and basic type alignment.
 */
export function validateToolArgs(tool: McpTool, args: Record<string, unknown>): McpToolArgValidation {
  const errors: string[] = [];
  const { properties, required } = tool.inputSchema;

  for (const key of required ?? []) {
    if (!(key in args) || args[key] === undefined || args[key] === null) {
      errors.push(`Missing required argument: ${key}`);
    }
  }

  for (const [key, value] of Object.entries(args)) {
    const schema = properties[key];
    if (!schema) continue;

    if (schema.enum) {
      if (!schema.enum.includes(value as string | number)) {
        errors.push(`Argument '${key}' must be one of: ${schema.enum.join(", ")}`);
      }
    }

    const actualType = Array.isArray(value) ? "array" : typeof value;
    const expectedType = schema.type;
    if (expectedType !== "object" && expectedType !== "array" && actualType !== expectedType) {
      errors.push(`Argument '${key}' expected ${expectedType}, got ${actualType}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Response Parsing ─────────────────────────────────────────────────────────

/**
 * Parses an MCP tool call result into structured, typed content collections.
 */
export function parseToolCallResult(result: McpToolCallResult): McpParsedResult {
  const texts: string[] = [];
  const images: { data: string; mimeType: string }[] = [];
  const resources: { uri: string; mimeType?: string; text?: string }[] = [];

  for (const item of result.content) {
    if (item.type === "text") {
      texts.push((item as Extract<McpContent, { type: "text" }>).text);
    } else if (item.type === "image") {
      const img = item as Extract<McpContent, { type: "image" }>;
      images.push({ data: img.data, mimeType: img.mimeType });
    } else if (item.type === "resource") {
      const res = item as Extract<McpContent, { type: "resource" }>;
      resources.push({
        uri: res.resource.uri,
        mimeType: res.resource.mimeType,
        text: res.resource.text,
      });
    }
  }

  return {
    success: !result.isError,
    texts,
    images,
    resources,
    isError: result.isError ?? false,
  };
}

// ─── Tool Discovery ───────────────────────────────────────────────────────────

/**
 * Looks up a tool by name from a list of known tools.
 */
export function matchToolByName(tools: McpTool[], name: string): McpTool | undefined {
  return tools.find((t) => t.name === name);
}

/**
 * Builds a minimal PowerNodeMcpServerInfo from a tool list.
 */
export function buildServerInfo(
  tools: McpTool[],
  opts: { version?: string } = {},
): PowerNodeMcpServerInfo {
  return {
    name: "PowerNode",
    version: opts.version ?? "1.0.0",
    description: "PowerNode workflow automation MCP server",
    tools,
  };
}

// ─── Error Formatting ─────────────────────────────────────────────────────────

/**
 * Formats a caught error into a human-readable MCP error message string.
 */
export function formatMcpError(error: unknown): string {
  if (error instanceof Error) {
    return `MCP Error: ${error.message}`;
  }
  if (typeof error === "string") {
    return `MCP Error: ${error}`;
  }
  return "MCP Error: An unexpected error occurred";
}

/**
 * Creates an error McpToolCallResult from a message.
 */
export function buildErrorResult(message: string): McpToolCallResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

// ─── Client Statistics ────────────────────────────────────────────────────────

/**
 * Computes aggregated client statistics from a history of tool call records.
 */
export function computeClientStats(records: McpToolCallRecord[]): McpClientStats {
  const toolUsage: Record<string, number> = {};
  let successful = 0;
  let totalContent = 0;

  for (const r of records) {
    toolUsage[r.toolName] = (toolUsage[r.toolName] ?? 0) + 1;
    if (r.success) successful++;
    totalContent += r.contentCount;
  }

  return {
    totalRequests: records.length,
    successfulRequests: successful,
    failedRequests: records.length - successful,
    toolUsage,
    averageContentItems: records.length > 0 ? totalContent / records.length : 0,
  };
}

// ─── Config Description ───────────────────────────────────────────────────────

/**
 * Produces a human-readable description of the client configuration.
 */
export function describeMcpClientConfig(config: McpClientConfig): string {
  const authSummary =
    config.auth.type === "bearer"
      ? "bearer token"
      : config.auth.type === "api_key"
        ? "API key"
        : "no auth";
  return `MCP Client → ${config.serverUrl} | auth=${authSummary} | timeout=${config.timeout}ms | retries=${config.retries}`;
}
