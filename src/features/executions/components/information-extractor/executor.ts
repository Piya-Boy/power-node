import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import type { NodeExecutor } from "@/features/executions/types";
import { aiChannel } from "@/inngest/channels/ai";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";

type InfoExtractorData = {
  variableName?: string;
  credentialId?: string;
  text?: string;
  extractionPrompt?: string;
  schema?: string; // JSON schema string for structured extraction
};

export const informationExtractorExecutor: NodeExecutor<InfoExtractorData> = async ({
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
    throw new NonRetriableError("Info Extractor: Variable name is missing");
  }

  if (!data.credentialId) {
    await publish(aiChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Info Extractor: Credential is required");
  }

  if (!data.text) {
    await publish(aiChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Info Extractor: Text is required");
  }

  try {
    const credential = await step.run("get-credential", () =>
      prisma.credential.findUnique({ where: { id: data.credentialId, userId } }),
    );

    if (!credential) {
      throw new NonRetriableError("Info Extractor: Credential not found");
    }

    const openai = createOpenAI({ apiKey: decrypt(credential.value) });
    const text = Handlebars.compile(data.text)(context);
    const extractionPrompt = data.extractionPrompt
      ? Handlebars.compile(data.extractionPrompt)(context)
      : "Extract all relevant structured information from this text.";

    // Default schema for general extraction
    const defaultSchema = z.object({
      entities: z.array(z.object({
        name: z.string(),
        type: z.string().describe("Type: person, organization, location, date, product, etc."),
        value: z.string(),
      })),
      keyFacts: z.array(z.string()),
      summary: z.string(),
    });

    const { object } = await step.ai.wrap(
      "info-extraction",
      generateObject,
      {
        model: openai("gpt-4o-mini"),
        system: `You are an information extraction expert. ${extractionPrompt}`,
        prompt: text,
        schema: defaultSchema,
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
