/**
 * Phase 27 — MCP (Model Context Protocol) type definitions
 * Based on the MCP specification for tool definitions and message structures.
 */

// MCP Tool definition
export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, McpSchemaProperty>;
    required?: string[];
  };
}

export interface McpSchemaProperty {
  type: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
  enum?: (string | number)[];
  items?: McpSchemaProperty;
  properties?: Record<string, McpSchemaProperty>;
  required?: string[];
}

// MCP Request/Response
export interface McpToolCallRequest {
  name: string;
  arguments: Record<string, unknown>;
}

export interface McpToolCallResult {
  content: McpContent[];
  isError?: boolean;
}

export type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: { uri: string; mimeType?: string; text?: string } };

// MCP Resource definition
export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

// MCP Auth
export interface McpAuthConfig {
  type: "api_key" | "bearer" | "none";
  apiKey?: string;
  bearerToken?: string;
}

// PowerNode MCP server capabilities
export interface PowerNodeMcpServerInfo {
  name: string;
  version: string;
  description: string;
  tools: McpTool[];
  resources?: McpResource[];
}
