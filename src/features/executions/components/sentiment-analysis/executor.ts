import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import type { NodeExecutor } from "@/features/executions/types";
import { aiChannel } from "@/inngest/channels/ai";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";

type SentimentData = {
  variableName?: string;
  credentialId?: string;
  text?: string;
};

export const sentimentAnalysisExecutor: NodeExecutor<SentimentData> = async ({
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
    throw new NonRetriableError("Sentiment Analysis: Variable name is missing");
  }

  if (!data.credentialId) {
    await publish(aiChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Sentiment Analysis: Credential is required");
  }

  if (!data.text) {
    await publish(aiChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Sentiment Analysis: Text is required");
  }

  try {
    const credential = await step.run("get-credential", () =>
      prisma.credential.findUnique({ where: { id: data.credentialId, userId } }),
    );

    if (!credential) {
      throw new NonRetriableError("Sentiment Analysis: Credential not found");
    }

    const openai = createOpenAI({ apiKey: decrypt(credential.value) });
    const text = Handlebars.compile(data.text)(context);

    const { object } = await step.ai.wrap(
      "sentiment-analysis",
      generateObject,
      {
        model: openai("gpt-4o-mini"),
        system: "You are a sentiment analysis expert. Analyze the sentiment of the given text.",
        prompt: text,
        schema: z.object({
          sentiment: z.enum(["positive", "negative", "neutral", "mixed"]),
          score: z.number().min(-1).max(1).describe("Score from -1 (very negative) to 1 (very positive)"),
          confidence: z.number().min(0).max(1),
          emotions: z.array(z.object({
            emotion: z.string(),
            intensity: z.number().min(0).max(1),
          })).describe("Detected emotions"),
        }),
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
