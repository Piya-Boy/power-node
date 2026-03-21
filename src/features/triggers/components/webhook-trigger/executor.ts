import type { NodeExecutor } from "@/features/executions/types";

export const webhookTriggerExecutor: NodeExecutor = async ({ context }) => {
  return context;
};
