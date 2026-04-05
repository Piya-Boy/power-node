import { describe, it, expect } from "vitest";
import {
  validateServerUrl,
  buildClientHeaders,
  buildToolCallRequest,
  parseToolCallResult,
} from "@/features/mcp/lib/mcp-client";
import type { McpAuthConfig } from "@/features/mcp/lib/mcp-types";
import type { McpToolCallResult } from "@/features/mcp/lib/mcp-types";

// ─── Validation helpers (mirrors executor logic) ─────────────────────────────

type McpServerData = {
  variableName?: string;
  serverUrl?: string;
  toolName?: string;
  auth?: McpAuthConfig;
  toolArgs?: string;
};

function validateMcpServerData(data: McpServerData): string | null {
  if (!data.variableName) return "Variable name is required";
  if (!data.serverUrl) return "Server URL is required";
  if (!data.toolName) return "Tool name is required";

  const urlValidation = validateServerUrl(data.serverUrl);
  if (!urlValidation.valid) return `Invalid server URL — ${urlValidation.errors.join(", ")}`;

  if (data.toolArgs) {
    try {
      JSON.parse(data.toolArgs);
    } catch {
      return "Tool arguments must be valid JSON";
    }
  }

  return null;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MCP Server Executor — data validation", () => {
  it("requires variableName", () => {
    expect(
      validateMcpServerData({ serverUrl: "https://mcp.example.com", toolName: "list_files" }),
    ).toBe("Variable name is required");
  });

  it("requires serverUrl", () => {
    expect(
      validateMcpServerData({ variableName: "result", toolName: "list_files" }),
    ).toBe("Server URL is required");
  });

  it("requires toolName", () => {
    expect(
      validateMcpServerData({ variableName: "result", serverUrl: "https://mcp.example.com" }),
    ).toBe("Tool name is required");
  });

  it("rejects invalid serverUrl", () => {
    expect(
      validateMcpServerData({
        variableName: "result",
        serverUrl: "not-a-url",
        toolName: "list_files",
      }),
    ).toMatch(/Invalid server URL/);
  });

  it("rejects non-HTTP protocols", () => {
    expect(
      validateMcpServerData({
        variableName: "result",
        serverUrl: "ftp://mcp.example.com",
        toolName: "list_files",
      }),
    ).toMatch(/Invalid server URL/);
  });

  it("rejects invalid JSON toolArgs", () => {
    expect(
      validateMcpServerData({
        variableName: "result",
        serverUrl: "https://mcp.example.com",
        toolName: "list_files",
        toolArgs: "{ invalid json }",
      }),
    ).toBe("Tool arguments must be valid JSON");
  });

  it("passes with minimal valid data", () => {
    expect(
      validateMcpServerData({
        variableName: "result",
        serverUrl: "https://mcp.example.com",
        toolName: "list_files",
      }),
    ).toBeNull();
  });

  it("passes with toolArgs as empty object", () => {
    expect(
      validateMcpServerData({
        variableName: "mcpOut",
        serverUrl: "https://mcp.example.com",
        toolName: "run_query",
        toolArgs: "{}",
      }),
    ).toBeNull();
  });

  it("passes with http:// server URL", () => {
    expect(
      validateMcpServerData({
        variableName: "result",
        serverUrl: "http://localhost:3001",
        toolName: "ping",
      }),
    ).toBeNull();
  });
});

describe("MCP Server Executor — header building", () => {
  it("builds bearer auth headers", () => {
    const auth: McpAuthConfig = { type: "bearer", bearerToken: "tok_abc123" };
    const headers = buildClientHeaders(auth);
    expect(headers["Authorization"]).toBe("Bearer tok_abc123");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("builds API key headers", () => {
    const auth: McpAuthConfig = { type: "api_key", apiKey: "key_xyz" };
    const headers = buildClientHeaders(auth);
    expect(headers["X-API-Key"]).toBe("key_xyz");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("builds no-auth headers (only content-type)", () => {
    const auth: McpAuthConfig = { type: "none" };
    const headers = buildClientHeaders(auth);
    expect(headers["Authorization"]).toBeUndefined();
    expect(headers["X-API-Key"]).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("includes User-Agent when provided", () => {
    const auth: McpAuthConfig = { type: "none" };
    const headers = buildClientHeaders(auth, { userAgent: "PowerNode/1.0" });
    expect(headers["User-Agent"]).toBe("PowerNode/1.0");
  });
});

describe("MCP Server Executor — request building", () => {
  it("builds a tool call request", () => {
    const request = buildToolCallRequest("list_files", { path: "/docs" });
    expect(request.name).toBe("list_files");
    expect(request.arguments).toEqual({ path: "/docs" });
  });

  it("builds a request with empty args", () => {
    const request = buildToolCallRequest("ping", {});
    expect(request.name).toBe("ping");
    expect(request.arguments).toEqual({});
  });

  it("preserves complex nested arguments", () => {
    const args = { filter: { type: "pdf" }, limit: 10 };
    const request = buildToolCallRequest("search", args);
    expect(request.arguments).toEqual(args);
  });
});

describe("MCP Server Executor — result parsing", () => {
  it("parses a text-only result", () => {
    const result: McpToolCallResult = {
      content: [{ type: "text", text: "Hello from MCP" }],
    };
    const parsed = parseToolCallResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.texts).toEqual(["Hello from MCP"]);
    expect(parsed.images).toHaveLength(0);
    expect(parsed.isError).toBe(false);
  });

  it("parses a multi-text result", () => {
    const result: McpToolCallResult = {
      content: [
        { type: "text", text: "Line 1" },
        { type: "text", text: "Line 2" },
      ],
    };
    const parsed = parseToolCallResult(result);
    expect(parsed.texts).toEqual(["Line 1", "Line 2"]);
  });

  it("parses an image result", () => {
    const result: McpToolCallResult = {
      content: [{ type: "image", data: "base64abc", mimeType: "image/png" }],
    };
    const parsed = parseToolCallResult(result);
    expect(parsed.images).toHaveLength(1);
    expect(parsed.images[0]).toEqual({ data: "base64abc", mimeType: "image/png" });
    expect(parsed.texts).toHaveLength(0);
  });

  it("parses a resource result", () => {
    const result: McpToolCallResult = {
      content: [
        {
          type: "resource",
          resource: { uri: "file:///notes.txt", mimeType: "text/plain", text: "content" },
        },
      ],
    };
    const parsed = parseToolCallResult(result);
    expect(parsed.resources).toHaveLength(1);
    expect(parsed.resources[0].uri).toBe("file:///notes.txt");
  });

  it("marks error results correctly", () => {
    const result: McpToolCallResult = {
      content: [{ type: "text", text: "Tool not found" }],
      isError: true,
    };
    const parsed = parseToolCallResult(result);
    expect(parsed.isError).toBe(true);
    expect(parsed.success).toBe(false);
  });

  it("handles empty content array", () => {
    const result: McpToolCallResult = { content: [] };
    const parsed = parseToolCallResult(result);
    expect(parsed.texts).toHaveLength(0);
    expect(parsed.images).toHaveLength(0);
    expect(parsed.resources).toHaveLength(0);
    expect(parsed.success).toBe(true);
  });
});

describe("MCP Server Executor — URL validation", () => {
  it("validates a well-formed HTTPS URL", () => {
    const result = validateServerUrl("https://mcp.example.com/api");
    expect(result.valid).toBe(true);
    expect(result.normalizedUrl).toBeDefined();
  });

  it("normalises trailing slash", () => {
    const result = validateServerUrl("https://mcp.example.com/");
    expect(result.valid).toBe(true);
    expect(result.normalizedUrl).not.toMatch(/\/$/);
  });

  it("rejects empty URL", () => {
    expect(validateServerUrl("").valid).toBe(false);
  });

  it("rejects non-HTTP protocol", () => {
    const result = validateServerUrl("ws://mcp.example.com");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("http"))).toBe(true);
  });

  it("rejects malformed URL", () => {
    const result = validateServerUrl("not a url at all");
    expect(result.valid).toBe(false);
  });
});
