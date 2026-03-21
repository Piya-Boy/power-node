import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import ky from "ky";
import type { NodeExecutor } from "@/features/executions/types";
import { googleSheetsChannel } from "@/inngest/channels/google-sheets";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  return new Handlebars.SafeString(jsonString);
});

type GoogleSheetsData = {
  variableName?: string;
  credentialId?: string;
  operation?: "read" | "append" | "update" | "clear";
  spreadsheetId?: string;
  range?: string;
  values?: string;
};

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export const googleSheetsExecutor: NodeExecutor<GoogleSheetsData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  publish,
}) => {
  await publish(googleSheetsChannel().status({ nodeId, status: "loading" }));

  if (!data.variableName) {
    await publish(googleSheetsChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Google Sheets node: Variable name is missing");
  }

  if (!data.credentialId) {
    await publish(googleSheetsChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Google Sheets node: Credential is required");
  }

  if (!data.operation) {
    await publish(googleSheetsChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Google Sheets node: Operation is required");
  }

  if (!data.spreadsheetId) {
    await publish(googleSheetsChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Google Sheets node: Spreadsheet ID is required");
  }

  if (!data.range) {
    await publish(googleSheetsChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Google Sheets node: Range is required");
  }

  try {
    const result = await step.run("google-sheets-operation", async () => {
      const credential = await prisma.credential.findUnique({
        where: { id: data.credentialId, userId },
      });

      if (!credential) {
        throw new NonRetriableError("Google Sheets node: Credential not found");
      }

      const apiKey = decrypt(credential.value);
      const spreadsheetId = Handlebars.compile(data.spreadsheetId!)(context);
      const range = Handlebars.compile(data.range!)(context);

      const headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };

      let responseData: unknown;

      switch (data.operation) {
        case "read": {
          responseData = await ky
            .get(`${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
              headers,
            })
            .json();
          break;
        }

        case "append": {
          if (!data.values) {
            throw new NonRetriableError("Google Sheets node: Values are required for append");
          }
          const values = JSON.parse(Handlebars.compile(data.values)(context));
          responseData = await ky
            .post(
              `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}:append`,
              {
                headers,
                searchParams: { valueInputOption: "USER_ENTERED" },
                json: { values },
              },
            )
            .json();
          break;
        }

        case "update": {
          if (!data.values) {
            throw new NonRetriableError("Google Sheets node: Values are required for update");
          }
          const values = JSON.parse(Handlebars.compile(data.values)(context));
          responseData = await ky
            .put(
              `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
              {
                headers,
                searchParams: { valueInputOption: "USER_ENTERED" },
                json: { values },
              },
            )
            .json();
          break;
        }

        case "clear": {
          responseData = await ky
            .post(
              `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
              {
                headers,
                json: {},
              },
            )
            .json();
          break;
        }

        default:
          throw new NonRetriableError(`Google Sheets node: Unknown operation "${data.operation}"`);
      }

      return {
        ...context,
        [data.variableName!]: responseData,
      };
    });

    await publish(googleSheetsChannel().status({ nodeId, status: "success" }));
    return result;
  } catch (error) {
    await publish(googleSheetsChannel().status({ nodeId, status: "error" }));
    throw error;
  }
};
