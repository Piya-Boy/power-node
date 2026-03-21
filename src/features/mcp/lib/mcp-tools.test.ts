import { describe, it, expect } from "vitest";
import {
  POWERNODE_MCP_TOOLS,
  getMcpTool,
  isValidMcpTool,
  getMcpToolNames,
  validateToolCallRequest,
  mcpSuccess,
  mcpError,
  mcpText,
  mcpList,
} from "./mcp-tools";

describe("POWERNODE_MCP_TOOLS", () => {
  it("has at least 8 tools", () => {
    expect(POWERNODE_MCP_TOOLS.length).toBeGreaterThanOrEqual(8);
  });

  it("every tool has required fields", () => {
    for (const tool of POWERNODE_MCP_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });

  it("tool names are unique", () => {
    const names = POWERNODE_MCP_TOOLS.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});

describe("getMcpTool", () => {
  it("returns tool for valid name", () => {
    const tool = getMcpTool("list_workflows");
    expect(tool).not.toBeNull();
    expect(tool?.name).toBe("list_workflows");
  });

  it("returns null for invalid name", () => {
    expect(getMcpTool("nonexistent_tool")).toBeNull();
  });
});

describe("isValidMcpTool", () => {
  it("returns true for valid tool names", () => {
    expect(isValidMcpTool("execute_workflow")).toBe(true);
    expect(isValidMcpTool("get_workflow")).toBe(true);
  });

  it("returns false for invalid tool names", () => {
    expect(isValidMcpTool("do_something_random")).toBe(false);
  });
});

describe("getMcpToolNames", () => {
  it("returns all tool names", () => {
    const names = getMcpToolNames();
    expect(names).toContain("list_workflows");
    expect(names).toContain("execute_workflow");
    expect(names).toContain("create_workflow");
    expect(names).toContain("get_execution_status");
  });
});

describe("validateToolCallRequest", () => {
  it("returns no errors for valid request", () => {
    const errors = validateToolCallRequest({
      name: "execute_workflow",
      arguments: { workflow_id: "wf-123" },
    });
    expect(errors).toHaveLength(0);
  });

  it("returns error for missing required field", () => {
    const errors = validateToolCallRequest({
      name: "execute_workflow",
      arguments: {},
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe("workflow_id");
  });

  it("returns error for unknown tool", () => {
    const errors = validateToolCallRequest({
      name: "fly_to_moon",
      arguments: {},
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe("name");
  });

  it("passes optional-only tools", () => {
    const errors = validateToolCallRequest({
      name: "list_workflows",
      arguments: {},
    });
    expect(errors).toHaveLength(0);
  });

  it("validates get_workflow requires workflow_id", () => {
    const errors = validateToolCallRequest({
      name: "get_workflow",
      arguments: {},
    });
    expect(errors.some((e) => e.field === "workflow_id")).toBe(true);
  });
});

describe("mcpSuccess", () => {
  it("returns a text content result", () => {
    const result = mcpSuccess({ id: "wf-1", name: "My Workflow" });
    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("wf-1");
  });

  it("passes string through directly", () => {
    const result = mcpSuccess("Hello world");
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toBe("Hello world");
  });
});

describe("mcpError", () => {
  it("returns an error result", () => {
    const result = mcpError("Workflow not found");
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Workflow not found");
  });

  it("includes details when provided", () => {
    const result = mcpError("Error occurred", { code: 404 });
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("404");
  });
});

describe("mcpText", () => {
  it("creates a text content block", () => {
    const content = mcpText("Hello MCP");
    expect(content.type).toBe("text");
    expect((content as { type: "text"; text: string }).text).toBe("Hello MCP");
  });
});

describe("mcpList", () => {
  it("returns 'No items found' for empty array", () => {
    const result = mcpList([]);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("No items found");
  });

  it("serializes items as JSON", () => {
    const result = mcpList([{ id: "1", name: "Workflow 1" }]);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Workflow 1");
  });
});
