import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import ky from "ky";
import type { NodeExecutor } from "@/features/executions/types";
import { aiChannel } from "@/inngest/channels/ai";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  return new Handlebars.SafeString(jsonString);
});

type OllamaData = {
  variableName?: string;
  credentialId?: string; // Stores Ollama base URL
  model?: string;
  systemPrompt?: string;
  userPrompt?: string;
  temperature?: number;
};

export const ollamaExecutor: NodeExecutor<OllamaData> = async ({
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
    throw new NonRetriableError("Ollama node: Variable name is missing");
  }

  if (!data.userPrompt) {
    await publish(aiChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Ollama node: User prompt is required");
  }

  const model = data.model || "llama3.2";
  const systemPrompt = data.systemPrompt
    ? Handlebars.compile(data.systemPrompt)(context)
    : undefined;
  const userPrompt = Handlebars.compile(data.userPrompt)(context);

  try {
    const result = await step.run("ollama-generate", async () => {
      let baseUrl = "http://localhost:11434";

      if (data.credentialId) {
        const credential = await prisma.credential.findUnique({
          where: { id: data.credentialId, userId },
        });
        if (credential) {
          baseUrl = decrypt(credential.value).trim();
        }
      }

      const messages = [];
      if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
      }
      messages.push({ role: "user", content: userPrompt });

      const response = await ky
        .post(`${baseUrl}/api/chat`, {
          json: {
            model,
            messages,
            stream: false,
            options: {
              temperature: data.temperature ?? 0.7,
            },
          },
          timeout: 120000, // 2 min timeout for local models
        })
        .json<{
          message: { content: string };
          total_duration: number;
          eval_count: number;
        }>();

      return {
        ...context,
        [data.variableName!]: {
          text: response.message.content,
          model,
          totalDuration: response.total_duration,
          tokenCount: response.eval_count,
        },
      };
    });

    await publish(aiChannel().status({ nodeId, status: "success" }));
    return result;
  } catch (error) {
    await publish(aiChannel().status({ nodeId, status: "error" }));
    throw error;
  }
};
