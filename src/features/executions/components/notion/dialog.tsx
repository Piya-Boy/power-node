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
  variableName: z.string().min(1).regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/),
  credentialId: z.string().min(1, "Credential is required"),
  operation: z.enum(["query_database", "create_page", "update_page", "get_page"]),
  databaseId: z.string().optional(),
  pageId: z.string().optional(),
  filter: z.string().optional(),
  properties: z.string().optional(),
});

export type NotionFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: NotionFormValues) => void;
  defaultValues?: Partial<NotionFormValues>;
}

export const NotionDialog = ({ open, onOpenChange, onSubmit, defaultValues = {} }: Props) => {
  const { data: credentials, isLoading } = useCredentialsByType(CredentialType.NOTION);

  const form = useForm<NotionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      variableName: defaultValues.variableName || "",
      credentialId: defaultValues.credentialId || "",
      operation: (defaultValues.operation as NotionFormValues["operation"]) || "query_database",
      databaseId: defaultValues.databaseId || "",
      pageId: defaultValues.pageId || "",
      filter: defaultValues.filter || "",
      properties: defaultValues.properties || "",
    },
  });

  useEffect(() => {
    if (open) form.reset({
      variableName: defaultValues.variableName || "",
      credentialId: defaultValues.credentialId || "",
      operation: (defaultValues.operation as NotionFormValues["operation"]) || "query_database",
      databaseId: defaultValues.databaseId || "",
      pageId: defaultValues.pageId || "",
      filter: defaultValues.filter || "",
      properties: defaultValues.properties || "",
    });
  }, [open, defaultValues, form]);

  const operation = form.watch("operation");

  const handleSubmit = (values: NotionFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Notion Configuration</DialogTitle>
          <DialogDescription>Read and write Notion databases and pages.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 mt-4">
            <FormField control={form.control} name="variableName" render={({ field }) => (
              <FormItem>
                <FormLabel>Variable Name</FormLabel>
                <FormControl><Input placeholder="notionData" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="credentialId" render={({ field }) => (
              <FormItem>
                <FormLabel>Notion Integration Token</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoading || !credentials?.length}>
                  <FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Select credential" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {credentials?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="operation" render={({ field }) => (
              <FormItem>
                <FormLabel>Operation</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="query_database">Query Database</SelectItem>
                    <SelectItem value="create_page">Create Page</SelectItem>
                    <SelectItem value="update_page">Update Page</SelectItem>
                    <SelectItem value="get_page">Get Page</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            {(operation === "query_database" || operation === "create_page") && (
              <FormField control={form.control} name="databaseId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Database ID</FormLabel>
                  <FormControl><Input placeholder="abc123..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}
            {(operation === "update_page" || operation === "get_page") && (
              <FormField control={form.control} name="pageId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Page ID</FormLabel>
                  <FormControl><Input placeholder="page-id..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}
            {operation === "query_database" && (
              <FormField control={form.control} name="filter" render={({ field }) => (
                <FormItem>
                  <FormLabel>Filter (JSON, optional)</FormLabel>
                  <FormControl><Textarea placeholder='{"property": "Status", "select": {"equals": "Done"}}' className="font-mono text-sm" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}
            {(operation === "create_page" || operation === "update_page") && (
              <FormField control={form.control} name="properties" render={({ field }) => (
                <FormItem>
                  <FormLabel>Properties (JSON)</FormLabel>
                  <FormControl><Textarea placeholder='{"Name": {"title": [{"text": {"content": "My Page"}}]}}' className="min-h-[100px] font-mono text-sm" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}
            <DialogFooter><Button type="submit">Save</Button></DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
