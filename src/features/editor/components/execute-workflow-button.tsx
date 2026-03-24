import { FlaskConicalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export const ExecuteWorkflowButton = ({
  debugStartNodeLabel,
  isPending,
  onExecute,
}: {
  debugStartNodeLabel?: string | null;
  isPending?: boolean;
  onExecute: () => void;
}) => {
  return (
    <Button size="lg" onClick={onExecute} disabled={isPending}>
      <FlaskConicalIcon className="size-4" />
      {debugStartNodeLabel
        ? `Debug from ${debugStartNodeLabel}`
        : "Execute workflow"}
    </Button>
  );
};
