import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { NodeExecutor } from "@/features/executions/types";
import { aiChannel } from "@/inngest/channels/ai";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  return new Handlebars.SafeString(jsonString);
});

type SummarizationData = {
  variableName?: string;
  credentialId?: string;
  text?: string;
  style?: "brief" | "detailed" | "bullet_points" | "executive";
  maxLength?: number;
  language?: string;
};

export const summarizationExecutor: NodeExecutor<SummarizationData> = async ({
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
    throw new NonRetriableError("Summarization: Variable name is missing");
  }

  if (!data.credentialId) {
    await publish(aiChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Summarization: Credential is required");
  }

  if (!data.text) {
    await publish(aiChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Summarization: Text is required");
  }

  try {
    const credential = await step.run("get-credential", () =>
      prisma.credential.findUnique({ where: { id: data.credentialId, userId } }),
    );

    if (!credential) {
      throw new NonRetriableError("Summarization: Credential not found");
    }

    const openai = createOpenAI({ apiKey: decrypt(credential.value) });
    const text = Handlebars.compile(data.text)(context);
    const style = data.style || "brief";
    const language = data.language || "English";

    const styleInstructions: Record<string, string> = {
      brief: "Provide a concise summary in 2-3 sentences.",
      detailed: "Provide a comprehensive summary covering all key points.",
      bullet_points: "Summarize the text as bullet points, covering each main topic.",
      executive: "Write an executive summary suitable for leadership review. Focus on key findings, implications, and recommended actions.",
    };

    const maxLengthHint = data.maxLength
      ? ` Keep the summary under ${data.maxLength} words.`
      : "";

    const { steps: aiSteps } = await step.ai.wrap(
      "summarize",
      generateText,
      {
        model: openai("gpt-4o-mini"),
        system: `You are a summarization expert. ${styleInstructions[style]}${maxLengthHint} Respond in ${language}.`,
        prompt: text,
      },
    );

    const summary =
      aiSteps[0].content[0].type === "text"
        ? aiSteps[0].content[0].text
        : "";

    await publish(aiChannel().status({ nodeId, status: "success" }));

    return {
      ...context,
      [data.variableName]: {
        summary,
        style,
        originalLength: text.length,
        summaryLength: summary.length,
      },
    };
  } catch (error) {
    await publish(aiChannel().status({ nodeId, status: "error" }));
    throw error;
  }
};
