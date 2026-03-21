import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import type { NodeExecutor } from "@/features/executions/types";
import { databaseChannel } from "@/inngest/channels/database";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import mysql from "mysql2/promise";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  return new Handlebars.SafeString(jsonString);
});

type MysqlData = {
  variableName?: string;
  credentialId?: string;
  query?: string;
  params?: string;
};

export const mysqlExecutor: NodeExecutor<MysqlData> = async ({
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
    throw new NonRetriableError("MySQL node: Variable name is missing");
  }

  if (!data.credentialId) {
    await publish(databaseChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("MySQL node: Credential is required");
  }

  if (!data.query) {
    await publish(databaseChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("MySQL node: SQL query is required");
  }

  try {
    const result = await step.run("mysql-query", async () => {
      const credential = await prisma.credential.findUnique({
        where: { id: data.credentialId, userId },
      });

      if (!credential) {
        throw new NonRetriableError("MySQL node: Credential not found");
      }

      // Credential value format: JSON { host, port, user, password, database }
      const config = JSON.parse(decrypt(credential.value)) as {
        host: string;
        port: number;
        user: string;
        password: string;
        database: string;
      };

      const connection = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
      });

      try {
        const query = Handlebars.compile(data.query!)(context);
        const params = data.params
          ? JSON.parse(Handlebars.compile(data.params)(context))
          : undefined;

        const [rows, fields] = await connection.execute(query, params);

        return {
          ...context,
          [data.variableName!]: {
            rows,
            fields: Array.isArray(fields)
              ? fields.map((f) => ({ name: f.name, type: f.type }))
              : [],
          },
        };
      } finally {
        await connection.end();
      }
    });

    await publish(databaseChannel().status({ nodeId, status: "success" }));
    return result;
  } catch (error) {
    await publish(databaseChannel().status({ nodeId, status: "error" }));
    throw error;
  }
};
