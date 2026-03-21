import Handlebars from "handlebars";
import { decode } from "html-entities";
import { NonRetriableError } from "inngest";
import type { NodeExecutor } from "@/features/executions/types";
import { emailSmtpChannel } from "@/inngest/channels/email-smtp";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import nodemailer from "nodemailer";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  return new Handlebars.SafeString(jsonString);
});

type EmailSmtpData = {
  variableName?: string;
  credentialId?: string;
  to?: string;
  subject?: string;
  body?: string;
  isHtml?: boolean;
  from?: string;
  cc?: string;
  bcc?: string;
};

export const emailSmtpExecutor: NodeExecutor<EmailSmtpData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  publish,
}) => {
  await publish(emailSmtpChannel().status({ nodeId, status: "loading" }));

  if (!data.variableName) {
    await publish(emailSmtpChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Email SMTP node: Variable name is missing");
  }

  if (!data.credentialId) {
    await publish(emailSmtpChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Email SMTP node: SMTP credential is required");
  }

  if (!data.to) {
    await publish(emailSmtpChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Email SMTP node: Recipient (to) is required");
  }

  if (!data.subject) {
    await publish(emailSmtpChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Email SMTP node: Subject is required");
  }

  const to = decode(Handlebars.compile(data.to)(context));
  const subject = decode(Handlebars.compile(data.subject)(context));
  const body = data.body ? decode(Handlebars.compile(data.body)(context)) : "";
  const from = data.from ? decode(Handlebars.compile(data.from)(context)) : undefined;
  const cc = data.cc ? decode(Handlebars.compile(data.cc)(context)) : undefined;
  const bcc = data.bcc ? decode(Handlebars.compile(data.bcc)(context)) : undefined;

  try {
    const result = await step.run("email-smtp-send", async () => {
      const credential = await prisma.credential.findUnique({
        where: { id: data.credentialId, userId },
      });

      if (!credential) {
        throw new NonRetriableError("Email SMTP node: Credential not found");
      }

      // Credential value format: JSON { host, port, user, pass, secure? }
      const smtpConfig = JSON.parse(decrypt(credential.value)) as {
        host: string;
        port: number;
        user: string;
        pass: string;
        secure?: boolean;
      };

      const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure ?? smtpConfig.port === 465,
        auth: {
          user: smtpConfig.user,
          pass: smtpConfig.pass,
        },
      });

      const mailOptions: nodemailer.SendMailOptions = {
        from: from || smtpConfig.user,
        to,
        subject,
        cc,
        bcc,
      };

      if (data.isHtml) {
        mailOptions.html = body;
      } else {
        mailOptions.text = body;
      }

      const info = await transporter.sendMail(mailOptions);

      return {
        ...context,
        [data.variableName!]: {
          messageId: info.messageId,
          accepted: info.accepted,
          rejected: info.rejected,
          to,
          subject,
        },
      };
    });

    await publish(emailSmtpChannel().status({ nodeId, status: "success" }));
    return result;
  } catch (error) {
    await publish(emailSmtpChannel().status({ nodeId, status: "error" }));
    throw error;
  }
};
