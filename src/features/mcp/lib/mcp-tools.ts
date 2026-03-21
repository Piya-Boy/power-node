/**
 * Phase 27 — MCP: PowerNode tool definitions
 * Defines the MCP tools that PowerNode exposes as an MCP server.
 */

import type { McpTool, McpToolCallRequest, McpToolCallResult, McpContent } from "./mcp-types";

// ─── Tool Definitions ───────────────────────────────────────────────────────

export const POWERNODE_MCP_TOOLS: McpTool[] = [
  {
    name: "list_workflows",
    description: "List all workflows belonging to the authenticated user. Returns workflow IDs, names, status, and tags.",
    inputSchema: {
      type: "object",
      properties: {
        active_only: {
          type: "boolean",
          description: "If true, only return active workflows",
        },
        tag: {
          type: "string",
          description: "Filter workflows by tag",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default: 20, max: 100)",
        },
      },
    },
  },
  {
    name: "get_workflow",
    description: "Get detailed information about a specific workflow including its nodes and connections.",
    inputSchema: {
      type: "object",
      properties: {
        workflow_id: {
          type: "string",
          description: "The unique ID of the workflow",
        },
      },
      required: ["workflow_id"],
    },
  },
  {
    name: "execute_workflow",
    description: "Trigger execution of a workflow with optional input data.",
    inputSchema: {
      type: "object",
      properties: {
        workflow_id: {
          type: "string",
          description: "The unique ID of the workflow to execute",
        },
        input: {
          type: "object",
          description: "Optional input data to pass to the workflow trigger node",
        },
      },
      required: ["workflow_id"],
    },
  },
  {
    name: "get_execution_status",
    description: "Get the current status and progress of a workflow execution.",
    inputSchema: {
      type: "object",
      properties: {
        execution_id: {
          type: "string",
          description: "The unique ID of the execution",
        },
      },
      required: ["execution_id"],
    },
  },
  {
    name: "get_execution_result",
    description: "Get the output and logs of a completed workflow execution.",
    inputSchema: {
      type: "object",
      properties: {
        execution_id: {
          type: "string",
          description: "The unique ID of the execution",
        },
      },
      required: ["execution_id"],
    },
  },
  {
    name: "create_workflow",
    description: "Create a new workflow with the specified name and optional description.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The name of the new workflow",
        },
        description: {
          type: "string",
          description: "Optional description of the workflow",
        },
        tags: {
          type: "array",
          description: "Optional tags for categorization",
          items: { type: "string" },
        },
      },
      required: ["name"],
    },
  },
  {
    name: "update_workflow",
    description: "Update a workflow's metadata (name, description, tags, active status).",
    inputSchema: {
      type: "object",
      properties: {
        workflow_id: {
          type: "string",
          description: "The unique ID of the workflow to update",
        },
        name: {
          type: "string",
          description: "New name for the workflow",
        },
        description: {
          type: "string",
          description: "New description",
        },
        is_active: {
          type: "boolean",
          description: "Whether the workflow should be active",
        },
        tags: {
          type: "array",
          description: "New tags list",
          items: { type: "string" },
        },
      },
      required: ["workflow_id"],
    },
  },
  {
    name: "list_executions",
    description: "List recent executions for a workflow.",
    inputSchema: {
      type: "object",
      properties: {
        workflow_id: {
          type: "string",
          description: "The workflow ID to get executions for",
        },
        status: {
          type: "string",
          description: "Filter by status: RUNNING, SUCCESS, or FAILED",
          enum: ["RUNNING", "SUCCESS", "FAILED"],
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default: 10)",
        },
      },
      required: ["workflow_id"],
    },
  },
];

// ─── Tool Registry ───────────────────────────────────────────────────────────

/**
 * Get a tool definition by name.
 */
export function getMcpTool(name: string): McpTool | null {
  return POWERNODE_MCP_TOOLS.find((t) => t.name === name) ?? null;
}

/**
 * Check if a tool name is valid.
 */
export function isValidMcpTool(name: string): boolean {
  return getMcpTool(name) !== null;
}

/**
 * Get all tool names.
 */
export function getMcpToolNames(): string[] {
  return POWERNODE_MCP_TOOLS.map((t) => t.name);
}

// ─── Request Validation ──────────────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate a tool call request against its schema.
 */
export function validateToolCallRequest(
  request: McpToolCallRequest
): ValidationError[] {
  const tool = getMcpTool(request.name);
  if (!tool) {
    return [{ field: "name", message: `Unknown tool: ${request.name}` }];
  }

  const errors: ValidationError[] = [];
  const required = tool.inputSchema.required ?? [];

  for (const field of required) {
    if (!(field in request.arguments) || request.arguments[field] === undefined) {
      errors.push({ field, message: `Required field missing: ${field}` });
    }
  }

  return errors;
}

// ─── Response Helpers ─────────────────────────────────────────────────────────

/**
 * Create a successful text result.
 */
export function mcpSuccess(data: unknown): McpToolCallResult {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return {
    content: [{ type: "text", text }],
    isError: false,
  };
}

/**
 * Create an error result.
 */
export function mcpError(message: string, details?: unknown): McpToolCallResult {
  const text = details
    ? `${message}\n\nDetails: ${JSON.stringify(details, null, 2)}`
    : message;
  return {
    content: [{ type: "text", text }],
    isError: true,
  };
}

/**
 * Build an MCP text content block.
 */
export function mcpText(text: string): McpContent {
  return { type: "text", text };
}

/**
 * Format a list of items as MCP text content.
 */
export function mcpList(items: Record<string, unknown>[]): McpToolCallResult {
  if (items.length === 0) {
    return mcpSuccess("No items found.");
  }
  return mcpSuccess(items);
}
