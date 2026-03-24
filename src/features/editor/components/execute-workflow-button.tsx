import { useAtomValue } from "jotai";
import { FlaskConicalIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  debugStartNodeAtom,
  pinnedDataAtom,
} from "@/features/editor/store/atoms";
import { useExecuteWorkflow } from "@/features/workflows/hooks/use-workflows";

export const ExecuteWorkflowButton = ({
  workflowId,
}: {
  workflowId: string;
}) => {
  const executeWorkflow = useExecuteWorkflow();
  const pinnedData = useAtomValue(pinnedDataAtom);
  const debugStartNode = useAtomValue(debugStartNodeAtom);
  const pinnedNodeCount = Object.keys(pinnedData).length;

  const handleExecute = () => {
    executeWorkflow.mutate({
      id: workflowId,
      startNodeId: debugStartNode ?? undefined,
      pinnedData: pinnedNodeCount > 0 ? pinnedData : undefined,
    });
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {(debugStartNode || pinnedNodeCount > 0) && (
        <div className="flex flex-wrap justify-center gap-2">
          {debugStartNode && (
            <Badge variant="secondary">Debug run active</Badge>
          )}
          {pinnedNodeCount > 0 && (
            <Badge variant="outline">
              {pinnedNodeCount} pinned node{pinnedNodeCount > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      )}
      <Button
        size="lg"
        onClick={handleExecute}
        disabled={executeWorkflow.isPending}
      >
        <FlaskConicalIcon className="size-4" />
        {debugStartNode ? "Run debug workflow" : "Execute workflow"}
      </Button>
    </div>
  );
};
