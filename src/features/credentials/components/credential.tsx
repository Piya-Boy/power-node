"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import z from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
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
import { Textarea } from "@/components/ui/textarea";
import {
  type CredentialSchema,
  getCredentialSchema,
} from "@/features/credentials/lib/credential-schema";
import { CredentialType } from "@/generated/prisma";
import { useUpgradeModal } from "@/hooks/use-upgrade-modal";
import {
  useCreateCredential,
  useSuspenseCredential,
  useUpdateCredential,
} from "../hooks/use-credentials";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(CredentialType),
  value: z.string().min(1, "Credential value is required"),
});

type FormValues = z.infer<typeof formSchema>;

const credentialTypeOptions: {
  value: CredentialType;
  label: string;
  logo: string;
}[] = [
  {
    value: CredentialType.OPENAI,
    label: "OpenAI",
    logo: "/logos/openai.svg",
  },
  {
    value: CredentialType.ANTHROPIC,
    label: "Anthropic",
    logo: "/logos/anthropic.svg",
  },
  {
    value: CredentialType.GEMINI,
    label: "Gemini",
    logo: "/logos/gemini.svg",
  },
  {
    value: CredentialType.IMAP,
    label: "IMAP",
    logo: "/logos/logo.svg",
  },
];

interface CredentialFormProps {
  initialData?: {
    id?: string;
    name: string;
    type: CredentialType;
    value: string;
  };
}

function getValueFieldCopy(schema: CredentialSchema | undefined) {
  if (!schema) {
    return {
      label: "Credential Value",
      placeholder: "Enter your credential value",
      description: undefined,
    };
  }

  if (schema.isJson) {
    const sampleValue =
      schema.type === CredentialType.IMAP
        ? JSON.stringify(
            {
              host: "imap.example.com",
              port: 993,
              user: "bot@example.com",
              pass: "app-password",
              secure: true,
            },
            null,
            2,
          )
        : JSON.stringify(
            Object.fromEntries(
              schema.fields.map((field) => [
                field.key,
                field.placeholder ?? "",
              ]),
            ),
            null,
            2,
          );

    return {
      label: "Credential JSON",
      placeholder: sampleValue,
      description:
        "Store this credential as a JSON object string that matches the expected fields.",
    };
  }

  return {
    label: schema.fields[0]?.label ?? "Credential Value",
    placeholder: schema.fields[0]?.placeholder ?? "Enter your credential value",
    description: schema.description,
  };
}

export const CredentialForm = ({ initialData }: CredentialFormProps) => {
  const router = useRouter();
  const createCredential = useCreateCredential();
  const updateCredential = useUpdateCredential();
  const { handleError, modal } = useUpgradeModal();

  const isEdit = Boolean(initialData?.id);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      name: "",
      type: CredentialType.OPENAI,
      value: "",
    },
  });

  const selectedType = form.watch("type");
  const selectedSchema = getCredentialSchema(selectedType);
  const valueFieldCopy = getValueFieldCopy(selectedSchema);

  const onSubmit = async (values: FormValues) => {
    if (isEdit && initialData?.id) {
      await updateCredential.mutateAsync({
        id: initialData.id,
        ...values,
      });
      return;
    }

    await createCredential.mutateAsync(values, {
      onSuccess: (data) => {
        router.push(`/credentials/${data.id}`);
      },
      onError: (error) => {
        handleError(error);
      },
    });
  };

  return (
    <>
      {modal}
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>
            {isEdit ? "Edit Credential" : "Create Credential"}
          </CardTitle>
          <CardDescription>
            {isEdit
              ? "Update your API key or credential details"
              : "Add a new API key or credential to your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My credential" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {credentialTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <Image
                                src={option.logo}
                                alt={option.label}
                                width={16}
                                height={16}
                              />
                              {option.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{valueFieldCopy.label}</FormLabel>
                    <FormControl>
                      {selectedSchema?.isJson ? (
                        <Textarea
                          rows={8}
                          placeholder={valueFieldCopy.placeholder}
                          className="font-mono text-sm"
                          {...field}
                        />
                      ) : (
                        <Input
                          type="password"
                          placeholder={valueFieldCopy.placeholder}
                          {...field}
                        />
                      )}
                    </FormControl>
                    {valueFieldCopy.description ? (
                      <p className="text-sm text-muted-foreground">
                        {valueFieldCopy.description}
                      </p>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-4">
                <Button
                  type="submit"
                  disabled={
                    createCredential.isPending || updateCredential.isPending
                  }
                >
                  {isEdit ? "Update" : "Create"}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link href="/credentials" prefetch>
                    Cancel
                  </Link>
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </>
  );
};

export const CredentialView = ({ credentialId }: { credentialId: string }) => {
  const { data: credential } = useSuspenseCredential(credentialId);

  return <CredentialForm initialData={credential} />;
};
