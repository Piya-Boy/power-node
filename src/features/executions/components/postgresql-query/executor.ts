import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import type { NodeExecutor } from "@/features/executions/types";
import { databaseChannel } from "@/inngest/channels/database";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import pg from "pg";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  return new Handlebars.SafeString(jsonString);
});

type PostgresData = {
  variableName?: string;
  credentialId?: string;
  query?: string;
  params?: string;
};

export const postgresqlExecutor: NodeExecutor<PostgresData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  publish,
}) => {
  await publish(databaseChannel().status({ nodeId, status: "loading" }));

  if (!data.variableName) {
    await publish(databaseChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("PostgreSQL node: Variable name is missing");
  }

  if (!data.credentialId) {
    await publish(databaseChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("PostgreSQL node: Credential is required");
  }

  if (!data.query) {
    await publish(databaseChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("PostgreSQL node: SQL query is required");
  }

  try {
    const result = await step.run("postgresql-query", async () => {
      const credential = await prisma.credential.findUnique({
        where: { id: data.credentialId, userId },
      });

      if (!credential) {
        throw new NonRetriableError("PostgreSQL node: Credential not found");
      }

      // Credential value is a connection string
      const connectionString = decrypt(credential.value);
      const query = Handlebars.compile(data.query!)(context);
      const params = data.params
        ? JSON.parse(Handlebars.compile(data.params)(context))
        : undefined;

      const client = new pg.Client({ connectionString });
      await client.connect();

      try {
        const queryResult = await client.query(query, params);
        return {
          ...context,
          [data.variableName!]: {
            rows: queryResult.rows,
            rowCount: queryResult.rowCount,
            fields: queryResult.fields.map((f) => ({
              name: f.name,
              dataTypeID: f.dataTypeID,
            })),
          },
        };
      } finally {
        await client.end();
      }
    });

    await publish(databaseChannel().status({ nodeId, status: "success" }));
    return result;
  } catch (error) {
    await publish(databaseChannel().status({ nodeId, status: "error" }));
    throw error;
  }
};
