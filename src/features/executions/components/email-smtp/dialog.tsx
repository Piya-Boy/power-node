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
import { Checkbox } from "@/components/ui/checkbox";
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
  variableName: z.string().min(1).regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/),
  credentialId: z.string().min(1, "SMTP credential is required"),
  to: z.string().min(1, "Recipient is required"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().optional(),
  isHtml: z.boolean().optional(),
  from: z.string().optional(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
});

export type EmailSmtpFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: EmailSmtpFormValues) => void;
  defaultValues?: Partial<EmailSmtpFormValues>;
}

export const EmailSmtpDialog = ({ open, onOpenChange, onSubmit, defaultValues = {} }: Props) => {
  const { data: credentials, isLoading } = useCredentialsByType(CredentialType.SMTP);

  const form = useForm<EmailSmtpFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      variableName: defaultValues.variableName || "",
      credentialId: defaultValues.credentialId || "",
      to: defaultValues.to || "",
      subject: defaultValues.subject || "",
      body: defaultValues.body || "",
      isHtml: defaultValues.isHtml || false,
      from: defaultValues.from || "",
      cc: defaultValues.cc || "",
      bcc: defaultValues.bcc || "",
    },
  });

  useEffect(() => {
    if (open) form.reset({
      variableName: defaultValues.variableName || "",
      credentialId: defaultValues.credentialId || "",
      to: defaultValues.to || "",
      subject: defaultValues.subject || "",
      body: defaultValues.body || "",
      isHtml: defaultValues.isHtml || false,
      from: defaultValues.from || "",
      cc: defaultValues.cc || "",
      bcc: defaultValues.bcc || "",
    });
  }, [open, defaultValues, form]);

  const handleSubmit = (values: EmailSmtpFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email (SMTP) Configuration</DialogTitle>
          <DialogDescription>Send emails via SMTP.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 mt-4">
            <FormField control={form.control} name="variableName" render={({ field }) => (
              <FormItem>
                <FormLabel>Variable Name</FormLabel>
                <FormControl><Input placeholder="emailResult" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="credentialId" render={({ field }) => (
              <FormItem>
                <FormLabel>SMTP Credential</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoading || !credentials?.length}>
                  <FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Select credential" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {credentials?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormDescription>SMTP config: {`{ host, port, user, pass }`}</FormDescription>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="to" render={({ field }) => (
              <FormItem>
                <FormLabel>To</FormLabel>
                <FormControl><Input placeholder="recipient@example.com" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="subject" render={({ field }) => (
              <FormItem>
                <FormLabel>Subject</FormLabel>
                <FormControl><Input placeholder="Email subject" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="body" render={({ field }) => (
              <FormItem>
                <FormLabel>Body</FormLabel>
                <FormControl><Textarea placeholder="Email body..." className="min-h-[120px] font-mono text-sm" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="isHtml" render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="!mt-0">Send as HTML</FormLabel>
              </FormItem>
            )} />
            <FormField control={form.control} name="cc" render={({ field }) => (
              <FormItem>
                <FormLabel>CC (optional)</FormLabel>
                <FormControl><Input placeholder="cc@example.com" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter><Button type="submit">Save</Button></DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
