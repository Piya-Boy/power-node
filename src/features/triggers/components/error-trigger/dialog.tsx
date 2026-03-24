"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import z from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const formSchema = z.object({
  variableName: z
    .string()
    .min(1)
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/),
  sourceWorkflowId: z.string().optional(),
  messageIncludes: z.string().optional(),
});

export type ErrorTriggerFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ErrorTriggerFormValues) => void;
  defaultValues?: Partial<ErrorTriggerFormValues>;
}

export function ErrorTriggerDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) {
  const form = useForm<ErrorTriggerFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      variableName: defaultValues.variableName || "error",
      sourceWorkflowId: defaultValues.sourceWorkflowId || "",
      messageIncludes: defaultValues.messageIncludes || "",
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset({
      variableName: defaultValues.variableName || "error",
      sourceWorkflowId: defaultValues.sourceWorkflowId || "",
      messageIncludes: defaultValues.messageIncludes || "",
    });
  }, [defaultValues, form, open]);

  const handleSubmit = (values: ErrorTriggerFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Error Trigger Configuration</DialogTitle>
          <DialogDescription>
            Start this workflow when another workflow fails.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="variableName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Variable Name</FormLabel>
                  <FormControl>
                    <Input placeholder="error" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sourceWorkflowId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source Workflow ID</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional workflow filter" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="messageIncludes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Error Message Contains</FormLabel>
                  <FormControl>
                    <Input placeholder="timeout" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
