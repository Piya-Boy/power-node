"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { mcpServerChannel } from "@/inngest/channels/mcp-server";
import { inngest } from "@/inngest/client";

export type McpServerToken = Realtime.Token<
  typeof mcpServerChannel,
  ["status"]
>;

export async function fetchMcpServerRealtimeToken(): Promise<McpServerToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: mcpServerChannel(),
    topics: ["status"],
  });

  return token;
}
