import { channel, topic } from "@inngest/realtime";

export const EMAIL_SMTP_CHANNEL_NAME = "email-smtp-execution";

export const emailSmtpChannel = channel(EMAIL_SMTP_CHANNEL_NAME)
  .addTopic(
    topic("status").type<{
      nodeId: string;
      status: "loading" | "success" | "error";
    }>(),
  );
