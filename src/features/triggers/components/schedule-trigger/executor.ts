import type { NodeExecutor } from "@/features/executions/types";

export const scheduleTriggerExecutor: NodeExecutor = async ({ context }) => {
  return context;
};
