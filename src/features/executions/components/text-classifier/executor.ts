import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import type { NodeExecutor } from "@/features/executions/types";
import { aiChannel } from "@/inngest/channels/ai";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";

type TextClassifierData = {
  variableName?: string;
  credentialId?: string;
  text?: string;
  categories?: string; // comma-separated categories
  multiLabel?: boolean;
};

export const textClassifierExecutor: NodeExecutor<TextClassifierData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  publish,
}) => {
  await publish(aiChannel().status({ nodeId, status: "loading" }));

  if (!data.variableName) {
    await publish(aiChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Text Classifier: Variable name is missing");
  }

  if (!data.credentialId) {
    await publish(aiChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Text Classifier: Credential is required");
  }

  if (!data.text) {
    await publish(aiChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Text Classifier: Text is required");
  }

  if (!data.categories) {
    await publish(aiChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Text Classifier: Categories are required");
  }

  try {
    const credential = await step.run("get-credential", () =>
      prisma.credential.findUnique({ where: { id: data.credentialId, userId } }),
    );

    if (!credential) {
      throw new NonRetriableError("Text Classifier: Credential not found");
    }

    const openai = createOpenAI({ apiKey: decrypt(credential.value) });
    const text = Handlebars.compile(data.text)(context);
    const categories = data.categories.split(",").map((c) => c.trim());

    const schema = data.multiLabel
      ? z.object({
          categories: z.array(z.object({
            category: z.string(),
            confidence: z.number().min(0).max(1),
          })),
        })
      : z.object({
          category: z.string(),
          confidence: z.number().min(0).max(1),
        });

    const { object } = await step.ai.wrap(
      "text-classify",
      generateObject,
      {
        model: openai("gpt-4o-mini"),
        system: `You are a text classifier. Classify the given text into one of these categories: ${categories.join(", ")}. Return the category and a confidence score between 0 and 1.`,
        prompt: text,
        schema,
      },
    );

    await publish(aiChannel().status({ nodeId, status: "success" }));

    return {
      ...context,
      [data.variableName]: object,
    };
  } catch (error) {
    await publish(aiChannel().status({ nodeId, status: "error" }));
    throw error;
  }
};
