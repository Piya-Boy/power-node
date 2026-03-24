import type { NodeExecutor } from "@/features/executions/types";

export const emailTriggerExecutor: NodeExecutor = async ({ context }) => {
  return context;
};
