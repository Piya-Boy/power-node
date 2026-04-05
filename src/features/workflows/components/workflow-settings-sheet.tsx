"use client";

import { Settings2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  useSuspenseWorkflow,
  useUpdateWorkflowSettings,
} from "@/features/workflows/hooks/use-workflows";

const LOG_LEVEL_OPTIONS = [
  { value: "info", label: "Info and errors" },
  { value: "warn", label: "Warnings and errors" },
  { value: "error", label: "Errors only" },
] as const;

export const WorkflowSettingsSheet = ({
  workflowId,
}: {
  workflowId: string;
}) => {
  const { data: workflow } = useSuspenseWorkflow(workflowId);
  const updateWorkflowSettings = useUpdateWorkflowSettings();

  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState(workflow.description ?? "");
  const [tags, setTags] = useState(workflow.tags.join(", "));
  const [isActive, setIsActive] = useState(workflow.isActive);
  const [logStreamingEnabled, setLogStreamingEnabled] = useState(
    workflow.logStreamingEnabled,
  );
  const [logStreamingUrl, setLogStreamingUrl] = useState(
    workflow.logStreamingUrl ?? "",
  );
  const [logStreamingLevel, setLogStreamingLevel] = useState<
    "info" | "warn" | "error"
  >((workflow.logStreamingLevel as "info" | "warn" | "error") ?? "info");

  useEffect(() => {
    setDescription(workflow.description ?? "");
    setTags(workflow.tags.join(", "));
    setIsActive(workflow.isActive);
    setLogStreamingEnabled(workflow.logStreamingEnabled);
    setLogStreamingUrl(workflow.logStreamingUrl ?? "");
    setLogStreamingLevel(
      (workflow.logStreamingLevel as "info" | "warn" | "error") ?? "info",
    );
  }, [workflow]);

  const handleSave = async () => {
    await updateWorkflowSettings.mutateAsync({
      id: workflowId,
      description: description.trim() || "",
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      isActive,
      logStreamingEnabled,
      logStreamingUrl: logStreamingUrl.trim(),
      logStreamingLevel,
    });

    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          <Settings2Icon className="size-4" />
          Settings
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Workflow settings</SheetTitle>
          <SheetDescription>
            Configure metadata, activation, and external execution log streaming
            for this workflow.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workflow-description">Description</Label>
              <Textarea
                id="workflow-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe what this workflow does"
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workflow-tags">Tags</Label>
              <Input
                id="workflow-tags"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="sales, notifications, ai"
              />
              <p className="text-xs text-muted-foreground">
                Separate tags with commas to organize workflows in lists and
                dashboards.
              </p>
            </div>

            <div className="flex items-start gap-3 rounded-lg border p-4">
              <Checkbox
                id="workflow-active"
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
              />
              <div className="space-y-1">
                <Label htmlFor="workflow-active">Workflow is active</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive workflows stay editable but will not accept new
                  trigger runs.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border p-4">
            <div>
              <h3 className="text-sm font-medium">Log streaming</h3>
              <p className="text-xs text-muted-foreground">
                Push execution lifecycle logs to your monitoring endpoint for
                alerting and long-term retention.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="workflow-log-streaming"
                checked={logStreamingEnabled}
                onCheckedChange={(checked) =>
                  setLogStreamingEnabled(checked === true)
                }
              />
              <div className="space-y-1">
                <Label htmlFor="workflow-log-streaming">
                  Enable external log streaming
                </Label>
                <p className="text-xs text-muted-foreground">
                  PowerNode will send started, completed, and failed execution
                  events to your endpoint.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workflow-log-url">Endpoint URL</Label>
              <Input
                id="workflow-log-url"
                value={logStreamingUrl}
                onChange={(event) => setLogStreamingUrl(event.target.value)}
                placeholder="https://logs.example.com/powernode"
              />
            </div>

            <div className="space-y-2">
              <Label>Minimum level</Label>
              <Select
                value={logStreamingLevel}
                onValueChange={(value) =>
                  setLogStreamingLevel(value as "info" | "warn" | "error")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOG_LEVEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={updateWorkflowSettings.isPending}
          >
            Save settings
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
