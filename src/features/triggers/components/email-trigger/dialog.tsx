"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import z from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCredentialsByType } from "@/features/credentials/hooks/use-credentials";
import { CredentialType } from "@/generated/prisma";

const formSchema = z.object({
  variableName: z
    .string()
    .min(1)
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/),
  credentialId: z.string().min(1, "IMAP credential is required"),
  mailbox: z.string().min(1),
  from: z.string().optional(),
  subject: z.string().optional(),
  unseenOnly: z.boolean().optional(),
  markAsSeen: z.boolean().optional(),
  maxMessages: z.number().int().min(1).max(25),
});

export type EmailTriggerFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: EmailTriggerFormValues) => void;
  defaultValues?: Partial<EmailTriggerFormValues>;
}

export function EmailTriggerDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) {
  const { data: credentials, isLoading } = useCredentialsByType(
    CredentialType.IMAP,
  );

  const form = useForm<EmailTriggerFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      variableName: defaultValues.variableName || "email",
      credentialId: defaultValues.credentialId || "",
      mailbox: defaultValues.mailbox || "INBOX",
      from: defaultValues.from || "",
      subject: defaultValues.subject || "",
      unseenOnly: defaultValues.unseenOnly ?? true,
      markAsSeen: defaultValues.markAsSeen ?? true,
      maxMessages: defaultValues.maxMessages || 10,
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset({
      variableName: defaultValues.variableName || "email",
      credentialId: defaultValues.credentialId || "",
      mailbox: defaultValues.mailbox || "INBOX",
      from: defaultValues.from || "",
      subject: defaultValues.subject || "",
      unseenOnly: defaultValues.unseenOnly ?? true,
      markAsSeen: defaultValues.markAsSeen ?? true,
      maxMessages: defaultValues.maxMessages || 10,
    });
  }, [defaultValues, form, open]);

  const handleSubmit = (values: EmailTriggerFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email Trigger Configuration</DialogTitle>
          <DialogDescription>
            Poll an IMAP inbox and trigger this workflow for matching messages.
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
                    <Input placeholder="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="credentialId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>IMAP Credential</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={isLoading || !credentials?.length}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select credential" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {credentials?.map((credential) => (
                        <SelectItem key={credential.id} value={credential.id}>
                          {credential.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Expected IMAP JSON: {"{ host, port, user, pass, secure? }"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="mailbox"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mailbox</FormLabel>
                  <FormControl>
                    <Input placeholder="INBOX" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="from"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>From Contains</FormLabel>
                  <FormControl>
                    <Input placeholder="alerts@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject Contains</FormLabel>
                  <FormControl>
                    <Input placeholder="incident" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="maxMessages"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Messages Per Poll</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={25}
                      value={field.value}
                      onChange={(event) =>
                        field.onChange(Number(event.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="unseenOnly"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="!mt-0">
                    Only process unseen emails
                  </FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="markAsSeen"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="!mt-0">
                    Mark processed emails as seen
                  </FormLabel>
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
