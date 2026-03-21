import Handlebars from "handlebars";
import { decode } from "html-entities";
import { NonRetriableError } from "inngest";
import ky from "ky";
import type { NodeExecutor } from "@/features/executions/types";
import { googleServicesChannel } from "@/inngest/channels/google-services";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";

type GmailData = {
  variableName?: string;
  credentialId?: string;
  operation?: "send" | "list" | "get";
  to?: string;
  subject?: string;
  body?: string;
  isHtml?: boolean;
  maxResults?: number;
  query?: string;
  messageId?: string;
};

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

function createRawEmail(to: string, subject: string, body: string, isHtml: boolean): string {
  const boundary = "boundary_" + Date.now();
  const contentType = isHtml ? "text/html" : "text/plain";

  const email = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: ${contentType}; charset=utf-8`,
    "",
    body,
  ].join("\r\n");

  // Base64url encode
  return Buffer.from(email)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const gmailExecutor: NodeExecutor<GmailData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  publish,
}) => {
  await publish(googleServicesChannel().status({ nodeId, status: "loading" }));

  if (!data.variableName) {
    await publish(googleServicesChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Gmail node: Variable name is missing");
  }
  if (!data.credentialId) {
    await publish(googleServicesChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Gmail node: Credential is required");
  }
  if (!data.operation) {
    await publish(googleServicesChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Gmail node: Operation is required");
  }

  try {
    const result = await step.run("gmail-op", async () => {
      const credential = await prisma.credential.findUnique({
        where: { id: data.credentialId, userId },
      });
      if (!credential) throw new NonRetriableError("Gmail node: Credential not found");

      const token = decrypt(credential.value);
      const headers = { Authorization: `Bearer ${token}` };
      let responseData: unknown;

      switch (data.operation) {
        case "send": {
          if (!data.to) throw new NonRetriableError("Gmail node: Recipient (to) is required");
          if (!data.subject) throw new NonRetriableError("Gmail node: Subject is required");

          const to = decode(Handlebars.compile(data.to)(context));
          const subject = decode(Handlebars.compile(data.subject)(context));
          const body = data.body ? decode(Handlebars.compile(data.body)(context)) : "";

          const raw = createRawEmail(to, subject, body, data.isHtml || false);

          responseData = await ky
            .post(`${GMAIL_API}/messages/send`, {
              headers: { ...headers, "Content-Type": "application/json" },
              json: { raw },
            })
            .json();
          break;
        }

        case "list": {
          const searchParams: Record<string, string> = {
            maxResults: String(data.maxResults || 10),
          };
          if (data.query) searchParams.q = Handlebars.compile(data.query)(context);

          responseData = await ky
            .get(`${GMAIL_API}/messages`, { headers, searchParams })
            .json();
          break;
        }

        case "get": {
          if (!data.messageId) throw new NonRetriableError("Gmail node: Message ID is required");
          const messageId = Handlebars.compile(data.messageId)(context);

          responseData = await ky
            .get(`${GMAIL_API}/messages/${messageId}`, {
              headers,
              searchParams: { format: "full" },
            })
            .json();
          break;
        }

        default:
          throw new NonRetriableError(`Gmail node: Unknown operation "${data.operation}"`);
      }

      return { ...context, [data.variableName!]: responseData };
    });

    await publish(googleServicesChannel().status({ nodeId, status: "success" }));
    return result;
  } catch (error) {
    await publish(googleServicesChannel().status({ nodeId, status: "error" }));
    throw error;
  }
};
