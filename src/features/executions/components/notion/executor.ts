import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import ky from "ky";
import type { NodeExecutor } from "@/features/executions/types";
import { notionChannel } from "@/inngest/channels/notion";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  return new Handlebars.SafeString(jsonString);
});

type NotionData = {
  variableName?: string;
  credentialId?: string;
  operation?: "query_database" | "create_page" | "update_page" | "get_page";
  databaseId?: string;
  pageId?: string;
  filter?: string;
  properties?: string;
};

const NOTION_API = "https://api.notion.com/v1";

export const notionExecutor: NodeExecutor<NotionData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  publish,
}) => {
  await publish(notionChannel().status({ nodeId, status: "loading" }));

  if (!data.variableName) {
    await publish(notionChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Notion node: Variable name is missing");
  }

  if (!data.credentialId) {
    await publish(notionChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Notion node: Credential is required");
  }

  if (!data.operation) {
    await publish(notionChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Notion node: Operation is required");
  }

  try {
    const result = await step.run("notion-operation", async () => {
      const credential = await prisma.credential.findUnique({
        where: { id: data.credentialId, userId },
      });

      if (!credential) {
        throw new NonRetriableError("Notion node: Credential not found");
      }

      const apiKey = decrypt(credential.value);
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      };

      let responseData: unknown;

      switch (data.operation) {
        case "query_database": {
          if (!data.databaseId) {
            throw new NonRetriableError("Notion node: Database ID is required");
          }
          const dbId = Handlebars.compile(data.databaseId)(context);
          const filterObj = data.filter
            ? JSON.parse(Handlebars.compile(data.filter)(context))
            : undefined;

          responseData = await ky
            .post(`${NOTION_API}/databases/${dbId}/query`, {
              headers,
              json: filterObj ? { filter: filterObj } : {},
            })
            .json();
          break;
        }

        case "create_page": {
          if (!data.databaseId) {
            throw new NonRetriableError("Notion node: Database ID is required for creating a page");
          }
          if (!data.properties) {
            throw new NonRetriableError("Notion node: Properties are required");
          }
          const dbId = Handlebars.compile(data.databaseId)(context);
          const properties = JSON.parse(Handlebars.compile(data.properties)(context));

          responseData = await ky
            .post(`${NOTION_API}/pages`, {
              headers,
              json: {
                parent: { database_id: dbId },
                properties,
              },
            })
            .json();
          break;
        }

        case "update_page": {
          if (!data.pageId) {
            throw new NonRetriableError("Notion node: Page ID is required");
          }
          if (!data.properties) {
            throw new NonRetriableError("Notion node: Properties are required");
          }
          const pgId = Handlebars.compile(data.pageId)(context);
          const properties = JSON.parse(Handlebars.compile(data.properties)(context));

          responseData = await ky
            .patch(`${NOTION_API}/pages/${pgId}`, {
              headers,
              json: { properties },
            })
            .json();
          break;
        }

        case "get_page": {
          if (!data.pageId) {
            throw new NonRetriableError("Notion node: Page ID is required");
          }
          const pgId = Handlebars.compile(data.pageId)(context);

          responseData = await ky
            .get(`${NOTION_API}/pages/${pgId}`, { headers })
            .json();
          break;
        }

        default:
          throw new NonRetriableError(`Notion node: Unknown operation "${data.operation}"`);
      }

      return {
        ...context,
        [data.variableName!]: responseData,
      };
    });

    await publish(notionChannel().status({ nodeId, status: "success" }));
    return result;
  } catch (error) {
    await publish(notionChannel().status({ nodeId, status: "error" }));
    throw error;
  }
};
