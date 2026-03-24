import type { NodeExecutor } from "@/features/executions/types";

export const errorTriggerExecutor: NodeExecutor = async ({ context }) => {
  return context;
};
