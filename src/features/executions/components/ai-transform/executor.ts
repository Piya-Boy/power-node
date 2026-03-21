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

type AiTransformData = {
  variableName?: string;
  credentialId?: string;
  instruction?: string;
  inputData?: string;
  outputFormat?: "json" | "text" | "csv" | "xml";
};

export const aiTransformExecutor: NodeExecutor<AiTransformData> = async ({
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
    throw new NonRetriableError("AI Transform: Variable name is missing");
  }

  if (!data.credentialId) {
    await publish(aiChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("AI Transform: Credential is required");
  }

  if (!data.instruction) {
    await publish(aiChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("AI Transform: Instruction is required");
  }

  try {
    const credential = await step.run("get-credential", () =>
      prisma.credential.findUnique({ where: { id: data.credentialId, userId } }),
    );

    if (!credential) {
      throw new NonRetriableError("AI Transform: Credential not found");
    }

    const openai = createOpenAI({ apiKey: decrypt(credential.value) });
    const instruction = Handlebars.compile(data.instruction)(context);
    const inputData = data.inputData
      ? Handlebars.compile(data.inputData)(context)
      : JSON.stringify(context, null, 2);

    const outputFormat = data.outputFormat || "json";
    const formatInstruction =
      outputFormat === "json"
        ? "Return valid JSON only, no markdown code blocks."
        : outputFormat === "csv"
          ? "Return CSV format with header row."
          : outputFormat === "xml"
            ? "Return well-formed XML."
            : "Return plain text.";

    const { steps: aiSteps } = await step.ai.wrap(
      "ai-transform",
      generateText,
      {
        model: openai("gpt-4o-mini"),
        system: `You are a data transformation assistant. Transform the input data according to the user's instructions. ${formatInstruction}`,
        prompt: `Instruction: ${instruction}\n\nInput data:\n${inputData}`,
      },
    );

    const text =
      aiSteps[0].content[0].type === "text"
        ? aiSteps[0].content[0].text
        : "";

    let result: unknown = text;
    if (outputFormat === "json") {
      try {
        result = JSON.parse(text);
      } catch {
        result = text; // If parsing fails, return as text
      }
    }

    await publish(aiChannel().status({ nodeId, status: "success" }));

    return {
      ...context,
      [data.variableName]: result,
    };
  } catch (error) {
    await publish(aiChannel().status({ nodeId, status: "error" }));
    throw error;
  }
};
