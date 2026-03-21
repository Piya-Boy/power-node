import type { NodeExecutor } from "@/features/executions/types";

// Chat trigger executor simply passes through the incoming message data
export const chatTriggerExecutor: NodeExecutor = async ({ data, context }) => {
  return {
    ...context,
    chatMessage: data,
  };
};
