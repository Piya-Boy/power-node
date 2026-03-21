import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import ky from "ky";
import type { NodeExecutor } from "@/features/executions/types";
import { graphqlChannel } from "@/inngest/channels/graphql";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  return new Handlebars.SafeString(jsonString);
});

type GraphQLData = {
  variableName?: string;
  endpoint?: string;
  query?: string;
  variables?: string;
  headers?: string;
};

export const graphqlExecutor: NodeExecutor<GraphQLData> = async ({
  data,
  nodeId,
  context,
  step,
  publish,
}) => {
  await publish(graphqlChannel().status({ nodeId, status: "loading" }));

  if (!data.variableName) {
    await publish(graphqlChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("GraphQL node: Variable name is missing");
  }

  if (!data.endpoint) {
    await publish(graphqlChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("GraphQL node: Endpoint URL is required");
  }

  if (!data.query) {
    await publish(graphqlChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("GraphQL node: Query is required");
  }

  try {
    const result = await step.run("graphql-request", async () => {
      const endpoint = Handlebars.compile(data.endpoint!)(context);
      const query = Handlebars.compile(data.query!)(context);
      const variables = data.variables
        ? JSON.parse(Handlebars.compile(data.variables)(context))
        : undefined;
      const customHeaders = data.headers
        ? JSON.parse(Handlebars.compile(data.headers)(context))
        : {};

      const responseData = await ky
        .post(endpoint, {
          headers: {
            "Content-Type": "application/json",
            ...customHeaders,
          },
          json: {
            query,
            variables,
          },
        })
        .json<{ data?: unknown; errors?: unknown[] }>();

      if (responseData.errors && responseData.errors.length > 0) {
        throw new NonRetriableError(
          `GraphQL errors: ${JSON.stringify(responseData.errors)}`,
        );
      }

      return {
        ...context,
        [data.variableName!]: responseData.data,
      };
    });

    await publish(graphqlChannel().status({ nodeId, status: "success" }));
    return result;
  } catch (error) {
    await publish(graphqlChannel().status({ nodeId, status: "error" }));
    throw error;
  }
};
