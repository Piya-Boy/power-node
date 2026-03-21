import Handlebars from "handlebars";
import { decode } from "html-entities";
import { NonRetriableError } from "inngest";
import ky from "ky";
import type { NodeExecutor } from "@/features/executions/types";
import { telegramChannel } from "@/inngest/channels/telegram";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  return new Handlebars.SafeString(jsonString);
});

type TelegramData = {
  variableName?: string;
  credentialId?: string;
  chatId?: string;
  message?: string;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
};

export const telegramExecutor: NodeExecutor<TelegramData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  publish,
}) => {
  await publish(telegramChannel().status({ nodeId, status: "loading" }));

  if (!data.variableName) {
    await publish(telegramChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Telegram node: Variable name is missing");
  }

  if (!data.credentialId) {
    await publish(telegramChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Telegram node: Bot token credential is required");
  }

  if (!data.chatId) {
    await publish(telegramChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Telegram node: Chat ID is required");
  }

  if (!data.message) {
    await publish(telegramChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Telegram node: Message is required");
  }

  const rawMessage = Handlebars.compile(data.message)(context);
  const message = decode(rawMessage);
  const chatId = Handlebars.compile(data.chatId)(context);

  try {
    const result = await step.run("telegram-send-message", async () => {
      const credential = await prisma.credential.findUnique({
        where: { id: data.credentialId, userId },
      });

      if (!credential) {
        throw new NonRetriableError("Telegram node: Credential not found");
      }

      const botToken = decrypt(credential.value);

      const response = await ky
        .post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          json: {
            chat_id: chatId,
            text: message,
            parse_mode: data.parseMode || undefined,
          },
        })
        .json<{ ok: boolean; result: { message_id: number } }>();

      return {
        ...context,
        [data.variableName!]: {
          ok: response.ok,
          messageId: response.result?.message_id,
          chatId,
          text: message,
        },
      };
    });

    await publish(telegramChannel().status({ nodeId, status: "success" }));
    return result;
  } catch (error) {
    await publish(telegramChannel().status({ nodeId, status: "error" }));
    throw error;
  }
};
