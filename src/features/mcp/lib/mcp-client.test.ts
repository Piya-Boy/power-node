import { describe, it, expect } from "vitest";
import {
  createMcpClientConfig,
  validateServerUrl,
  buildClientHeaders,
  buildToolCallRequest,
  validateToolArgs,
  parseToolCallResult,
  matchToolByName,
  buildServerInfo,
  formatMcpError,
  buildErrorResult,
  computeClientStats,
  describeMcpClientConfig,
  type McpToolCallRecord,
} from "./mcp-client";
import type { McpTool, McpToolCallResult } from "./mcp-types";

// ─── createMcpClientConfig ────────────────────────────────────────────────────

describe("createMcpClientConfig", () => {
  it("creates config with defaults", () => {
    const cfg = createMcpClientConfig("https://app.example.com", { type: "none" });
    expect(cfg.serverUrl).toBe("https://app.example.com");
    expect(cfg.timeout).toBe(30_000);
    expect(cfg.retries).toBe(2);
    expect(cfg.userAgent).toContain("PowerNode");
  });

  it("strips trailing slash from serverUrl", () => {
    const cfg = createMcpClientConfig("https://app.example.com/", { type: "none" });
    expect(cfg.serverUrl).toBe("https://app.example.com");
  });

  it("accepts custom options", () => {
    const cfg = createMcpClientConfig("https://example.com", { type: "none" }, {
      timeout: 5_000,
      retries: 0,
      userAgent: "MyAgent/2.0",
    });
    expect(cfg.timeout).toBe(5_000);
    expect(cfg.retries).toBe(0);
    expect(cfg.userAgent).toBe("MyAgent/2.0");
  });
});

// ─── validateServerUrl ────────────────────────────────────────────────────────

describe("validateServerUrl", () => {
  it("accepts valid https URLs", () => {
    const r = validateServerUrl("https://mcp.example.com");
    expect(r.valid).toBe(true);
    expect(r.normalizedUrl).toBe("https://mcp.example.com");
  });

  it("accepts valid http URLs", () => {
    expect(validateServerUrl("http://localhost:3000").valid).toBe(true);
  });

  it("rejects empty URL", () => {
    expect(validateServerUrl("").valid).toBe(false);
  });

  it("rejects non-http URLs", () => {
    const r = validateServerUrl("ftp://example.com");
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("https"))).toBe(true);
  });

  it("rejects malformed URLs", () => {
    expect(validateServerUrl("not-a-url").valid).toBe(false);
  });

  it("normalises trailing slash", () => {
    const r = validateServerUrl("https://example.com/");
    expect(r.normalizedUrl).toBe("https://example.com");
  });
});

// ─── buildClientHeaders ───────────────────────────────────────────────────────

describe("buildClientHeaders", () => {
  it("always includes Content-Type and Accept", () => {
    const h = buildClientHeaders({ type: "none" });
    expect(h["Content-Type"]).toBe("application/json");
    expect(h["Accept"]).toBe("application/json");
  });

  it("adds Bearer token for bearer auth", () => {
    const h = buildClientHeaders({ type: "bearer", bearerToken: "tok123" });
    expect(h["Authorization"]).toBe("Bearer tok123");
  });

  it("adds X-API-Key for api_key auth", () => {
    const h = buildClientHeaders({ type: "api_key", apiKey: "api123" });
    expect(h["X-API-Key"]).toBe("api123");
  });

  it("adds User-Agent when provided", () => {
    const h = buildClientHeaders({ type: "none" }, { userAgent: "MyTool/1.0" });
    expect(h["User-Agent"]).toBe("MyTool/1.0");
  });

  it("no auth headers for none type", () => {
    const h = buildClientHeaders({ type: "none" });
    expect(h["Authorization"]).toBeUndefined();
    expect(h["X-API-Key"]).toBeUndefined();
  });
});

// ─── buildToolCallRequest ─────────────────────────────────────────────────────

describe("buildToolCallRequest", () => {
  it("builds a simple request", () => {
    const req = buildToolCallRequest("list_workflows", { page: 1 });
    expect(req.name).toBe("list_workflows");
    expect(req.arguments).toEqual({ page: 1 });
  });
});

// ─── validateToolArgs ─────────────────────────────────────────────────────────

const SAMPLE_TOOL: McpTool = {
  name: "run_workflow",
  description: "Run a workflow",
  inputSchema: {
    type: "object",
    properties: {
      workflowId: { type: "string", description: "ID of the workflow" },
      mode: { type: "string", enum: ["sync", "async"] },
      count: { type: "number" },
    },
    required: ["workflowId"],
  },
};

describe("validateToolArgs", () => {
  it("passes for valid args", () => {
    const r = validateToolArgs(SAMPLE_TOOL, { workflowId: "wf_123" });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("rejects missing required arg", () => {
    const r = validateToolArgs(SAMPLE_TOOL, {});
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("Missing required argument: workflowId");
  });

  it("rejects invalid enum value", () => {
    const r = validateToolArgs(SAMPLE_TOOL, { workflowId: "id", mode: "invalid" });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("mode"))).toBe(true);
  });

  it("rejects wrong type", () => {
    const r = validateToolArgs(SAMPLE_TOOL, { workflowId: "id", count: "five" });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("count"))).toBe(true);
  });
});

// ─── parseToolCallResult ──────────────────────────────────────────────────────

describe("parseToolCallResult", () => {
  it("extracts text content", () => {
    const res: McpToolCallResult = {
      content: [{ type: "text", text: "Hello world" }],
    };
    const parsed = parseToolCallResult(res);
    expect(parsed.texts).toEqual(["Hello world"]);
    expect(parsed.success).toBe(true);
    expect(parsed.isError).toBe(false);
  });

  it("extracts image content", () => {
    const res: McpToolCallResult = {
      content: [{ type: "image", data: "base64abc", mimeType: "image/png" }],
    };
    const parsed = parseToolCallResult(res);
    expect(parsed.images).toHaveLength(1);
    expect(parsed.images[0].mimeType).toBe("image/png");
  });

  it("extracts resource content", () => {
    const res: McpToolCallResult = {
      content: [{ type: "resource", resource: { uri: "urn:res:1", text: "content" } }],
    };
    const parsed = parseToolCallResult(res);
    expect(parsed.resources).toHaveLength(1);
    expect(parsed.resources[0].uri).toBe("urn:res:1");
  });

  it("marks error results", () => {
    const res: McpToolCallResult = {
      content: [{ type: "text", text: "fail" }],
      isError: true,
    };
    const parsed = parseToolCallResult(res);
    expect(parsed.success).toBe(false);
    expect(parsed.isError).toBe(true);
  });

  it("handles mixed content", () => {
    const res: McpToolCallResult = {
      content: [
        { type: "text", text: "t1" },
        { type: "text", text: "t2" },
        { type: "image", data: "d", mimeType: "image/jpeg" },
      ],
    };
    const parsed = parseToolCallResult(res);
    expect(parsed.texts).toHaveLength(2);
    expect(parsed.images).toHaveLength(1);
  });
});

// ─── matchToolByName ──────────────────────────────────────────────────────────

describe("matchToolByName", () => {
  it("finds an existing tool", () => {
    const tool = matchToolByName([SAMPLE_TOOL], "run_workflow");
    expect(tool).toBeDefined();
    expect(tool?.name).toBe("run_workflow");
  });

  it("returns undefined for unknown name", () => {
    expect(matchToolByName([SAMPLE_TOOL], "unknown_tool")).toBeUndefined();
  });
});

// ─── buildServerInfo ──────────────────────────────────────────────────────────

describe("buildServerInfo", () => {
  it("creates server info with given tools", () => {
    const info = buildServerInfo([SAMPLE_TOOL], { version: "2.0.0" });
    expect(info.name).toBe("PowerNode");
    expect(info.version).toBe("2.0.0");
    expect(info.tools).toContain(SAMPLE_TOOL);
  });

  it("defaults to 1.0.0", () => {
    expect(buildServerInfo([]).version).toBe("1.0.0");
  });
});

// ─── formatMcpError ───────────────────────────────────────────────────────────

describe("formatMcpError", () => {
  it("formats Error objects", () => {
    expect(formatMcpError(new Error("oops"))).toBe("MCP Error: oops");
  });

  it("formats string errors", () => {
    expect(formatMcpError("bad thing")).toBe("MCP Error: bad thing");
  });

  it("handles unknown types", () => {
    expect(formatMcpError(42)).toContain("unexpected");
  });
});

// ─── buildErrorResult ────────────────────────────────────────────────────────

describe("buildErrorResult", () => {
  it("creates an error result", () => {
    const r = buildErrorResult("Something went wrong");
    expect(r.isError).toBe(true);
    expect(r.content[0]).toMatchObject({ type: "text", text: "Something went wrong" });
  });
});

// ─── computeClientStats ──────────────────────────────────────────────────────

describe("computeClientStats", () => {
  it("returns zeros for empty history", () => {
    const s = computeClientStats([]);
    expect(s.totalRequests).toBe(0);
    expect(s.averageContentItems).toBe(0);
  });

  it("aggregates request history", () => {
    const records: McpToolCallRecord[] = [
      { toolName: "run_workflow", success: true, contentCount: 2 },
      { toolName: "run_workflow", success: false, contentCount: 1 },
      { toolName: "list_workflows", success: true, contentCount: 3 },
    ];
    const s = computeClientStats(records);
    expect(s.totalRequests).toBe(3);
    expect(s.successfulRequests).toBe(2);
    expect(s.failedRequests).toBe(1);
    expect(s.toolUsage["run_workflow"]).toBe(2);
    expect(s.toolUsage["list_workflows"]).toBe(1);
    expect(s.averageContentItems).toBeCloseTo(2);
  });
});

// ─── describeMcpClientConfig ─────────────────────────────────────────────────

describe("describeMcpClientConfig", () => {
  it("describes bearer auth", () => {
    const cfg = createMcpClientConfig("https://example.com", { type: "bearer", bearerToken: "t" });
    expect(describeMcpClientConfig(cfg)).toContain("bearer token");
  });

  it("describes api key auth", () => {
    const cfg = createMcpClientConfig("https://example.com", { type: "api_key", apiKey: "k" });
    expect(describeMcpClientConfig(cfg)).toContain("API key");
  });

  it("describes no auth", () => {
    const cfg = createMcpClientConfig("https://example.com", { type: "none" });
    expect(describeMcpClientConfig(cfg)).toContain("no auth");
  });
});
