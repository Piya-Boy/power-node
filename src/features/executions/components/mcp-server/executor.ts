import { NonRetriableError } from "inngest";
import ky from "ky";
import type { NodeExecutor } from "@/features/executions/types";
import { mcpServerChannel } from "@/inngest/channels/mcp-server";
import {
  buildClientHeaders,
  buildToolCallRequest,
  parseToolCallResult,
  validateServerUrl,
} from "@/features/mcp/lib/mcp-client";
import type { McpAuthConfig } from "@/features/mcp/lib/mcp-types";
import type { McpToolCallResult } from "@/features/mcp/lib/mcp-types";

type McpServerData = {
  variableName?: string;
  serverUrl?: string;
  toolName?: string;
  auth?: McpAuthConfig;
  toolArgs?: string;
};

export const mcpServerExecutor: NodeExecutor<McpServerData> = async ({
  data,
  nodeId,
  context,
  step,
  publish,
}) => {
  await publish(mcpServerChannel().status({ nodeId, status: "loading" }));

  if (!data.variableName) {
    await publish(mcpServerChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("MCP Server node: Variable name is required");
  }

  if (!data.serverUrl) {
    await publish(mcpServerChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("MCP Server node: Server URL is required");
  }

  if (!data.toolName) {
    await publish(mcpServerChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("MCP Server node: Tool name is required");
  }

  const urlValidation = validateServerUrl(data.serverUrl);
  if (!urlValidation.valid) {
    await publish(mcpServerChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError(
      `MCP Server node: Invalid server URL — ${urlValidation.errors.join(", ")}`,
    );
  }

  const auth: McpAuthConfig = data.auth ?? { type: "none" };

  let toolArgs: Record<string, unknown> = {};
  if (data.toolArgs) {
    try {
      toolArgs = JSON.parse(data.toolArgs) as Record<string, unknown>;
    } catch {
      await publish(mcpServerChannel().status({ nodeId, status: "error" }));
      throw new NonRetriableError(
        "MCP Server node: Tool arguments must be valid JSON",
      );
    }
  }

  try {
    const result = await step.run("mcp-tool-call", async () => {
      const headers = buildClientHeaders(auth);
      const requestBody = buildToolCallRequest(data.toolName!, toolArgs);

      const baseUrl = urlValidation.normalizedUrl ?? data.serverUrl!;
      const response = await ky
        .post(`${baseUrl}/tools/call`, {
          headers,
          json: requestBody,
          timeout: 30_000,
        })
        .json<McpToolCallResult>();

      return parseToolCallResult(response);
    });

    await publish(mcpServerChannel().status({ nodeId, status: "success" }));

    return {
      ...context,
      [data.variableName]: result,
    };
  } catch (err) {
    await publish(mcpServerChannel().status({ nodeId, status: "error" }));
    if (err instanceof NonRetriableError) throw err;
    throw new NonRetriableError(
      `MCP Server node: Tool call failed — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
};
