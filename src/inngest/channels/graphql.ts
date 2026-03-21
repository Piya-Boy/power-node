import { channel, topic } from "@inngest/realtime";

export const GRAPHQL_CHANNEL_NAME = "graphql-execution";

export const graphqlChannel = channel(GRAPHQL_CHANNEL_NAME)
  .addTopic(
    topic("status").type<{
      nodeId: string;
      status: "loading" | "success" | "error";
    }>(),
  );
