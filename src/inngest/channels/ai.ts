import { channel, topic } from "@inngest/realtime";

export const AI_CHANNEL_NAME = "ai-execution";

export const aiChannel = channel(AI_CHANNEL_NAME)
  .addTopic(
    topic("status").type<{
      nodeId: string;
      status: "loading" | "success" | "error";
    }>(),
  );
