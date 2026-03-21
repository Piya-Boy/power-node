"use client";

import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormDescription, FormField,
  FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { useCredentialsByType } from "@/features/credentials/hooks/use-credentials";
import { CredentialType } from "@/generated/prisma";

const formSchema = z.object({
  variableName: z
    .string()
    .min(1, "Variable name is required")
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, "Invalid variable name"),
  credentialId: z.string().min(1, "Credential is required"),
  chatId: z.string().min(1, "Chat ID is required"),
  message: z.string().min(1, "Message is required"),
  parseMode: z.enum(["HTML", "Markdown", "MarkdownV2"]).optional(),
});

export type TelegramFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: TelegramFormValues) => void;
  defaultValues?: Partial<TelegramFormValues>;
}

export const TelegramDialog = ({
  open, onOpenChange, onSubmit, defaultValues = {},
}: Props) => {
  const { data: credentials, isLoading } = useCredentialsByType(CredentialType.TELEGRAM);

  const form = useForm<TelegramFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      variableName: defaultValues.variableName || "",
      credentialId: defaultValues.credentialId || "",
      chatId: defaultValues.chatId || "",
      message: defaultValues.message || "",
      parseMode: defaultValues.parseMode,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        variableName: defaultValues.variableName || "",
        credentialId: defaultValues.credentialId || "",
        chatId: defaultValues.chatId || "",
        message: defaultValues.message || "",
        parseMode: defaultValues.parseMode,
      });
    }
  }, [open, defaultValues, form]);

  const handleSubmit = (values: TelegramFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Telegram Configuration</DialogTitle>
          <DialogDescription>Send messages via Telegram Bot API.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 mt-4">
            <FormField
              control={form.control}
              name="variableName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Variable Name</FormLabel>
                  <FormControl><Input placeholder="telegramResult" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="credentialId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bot Token Credential</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoading || !credentials?.length}>
                    <FormControl>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select credential" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {credentials?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="chatId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chat ID</FormLabel>
                  <FormControl><Input placeholder="-1001234567890" {...field} /></FormControl>
                  <FormDescription>Telegram chat/group/channel ID. Use {"{{variables}}"} for dynamic values.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Hello from PowerNode!" className="min-h-[100px] font-mono text-sm" {...field} />
                  </FormControl>
                  <FormDescription>Use {"{{variables}}"} to include data from previous nodes.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter><Button type="submit">Save</Button></DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
