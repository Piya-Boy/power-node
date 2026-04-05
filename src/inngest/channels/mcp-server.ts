import { channel, topic } from "@inngest/realtime";

export const MCP_SERVER_CHANNEL_NAME = "mcp-server-execution";

export const mcpServerChannel = channel(MCP_SERVER_CHANNEL_NAME)
  .addTopic(
    topic("status").type<{
      nodeId: string;
      status: "loading" | "success" | "error";
    }>(),
  );
