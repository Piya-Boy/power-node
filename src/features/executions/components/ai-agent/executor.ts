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

type AiAgentData = {
  variableName?: string;
  credentialId?: string;
  systemPrompt?: string;
  userPrompt?: string;
  maxSteps?: number;
};

export const aiAgentExecutor: NodeExecutor<AiAgentData> = async ({
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
    throw new NonRetriableError("AI Agent node: Variable name is missing");
  }

  if (!data.credentialId) {
    await publish(aiChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("AI Agent node: Credential is required");
  }

  if (!data.userPrompt) {
    await publish(aiChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("AI Agent node: User prompt is required");
  }

  const systemPrompt = data.systemPrompt
    ? Handlebars.compile(data.systemPrompt)(context)
    : "You are a helpful AI agent. Answer questions and accomplish tasks using the provided context data.";
  const userPrompt = Handlebars.compile(data.userPrompt)(context);

  // Include workflow context in the prompt for the agent to use
  const contextSummary = Object.keys(context).length > 0
    ? `\n\nAvailable workflow context data:\n${JSON.stringify(context, null, 2)}`
    : "";

  try {
    const credential = await step.run("get-credential", () =>
      prisma.credential.findUnique({ where: { id: data.credentialId, userId } }),
    );

    if (!credential) {
      await publish(aiChannel().status({ nodeId, status: "error" }));
      throw new NonRetriableError("AI Agent node: Credential not found");
    }

    const openai = createOpenAI({ apiKey: decrypt(credential.value) });

    const { steps: aiSteps } = await step.ai.wrap(
      "ai-agent-generate",
      generateText,
      {
        model: openai("gpt-4"),
        system: systemPrompt + contextSummary,
        prompt: userPrompt,
      },
    );

    const text =
      aiSteps[0].content[0].type === "text"
        ? aiSteps[0].content[0].text
        : "";

    await publish(aiChannel().status({ nodeId, status: "success" }));

    return {
      ...context,
      [data.variableName]: {
        text,
        steps: aiSteps.length,
      },
    };
  } catch (error) {
    await publish(aiChannel().status({ nodeId, status: "error" }));
    throw error;
  }
};
