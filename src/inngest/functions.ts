import { ImapFlow } from "imapflow";
import { NonRetriableError } from "inngest";
import { prepareExecutionPlan } from "@/features/executions/lib/debug-execution";
import { getExecutor } from "@/features/executions/lib/executor-registry";
import { streamExecutionLog } from "@/features/executions/lib/log-streaming";
import {
  buildEmailSearchQuery,
  buildEmailTriggerEventId,
  buildEmailTriggerInitialData,
  type EmailTriggerNodeData,
  getEmailTriggerMailbox,
  getEmailTriggerMaxMessages,
  normalizeEmailTriggerMessage,
  parseImapCredential,
} from "@/features/triggers/lib/email-trigger";
import {
  buildErrorTriggerInitialData,
  type ErrorTriggerNodeData,
  matchesErrorTrigger,
  type WorkflowFailurePayload,
} from "@/features/triggers/lib/error-trigger";
import {
  CredentialType,
  ExecutionStatus,
  NodeType,
  type Prisma,
} from "@/generated/prisma";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { anthropicChannel } from "./channels/anthropic";
import { discordChannel } from "./channels/discord";
import { geminiChannel } from "./channels/gemini";
import { googleFormTriggerChannel } from "./channels/google-form-trigger";
import { httpRequestChannel } from "./channels/http-request";
import { manualTriggerChannel } from "./channels/manual-trigger";
import { openAiChannel } from "./channels/openai";
import { slackChannel } from "./channels/slack";
import { stripeTriggerChannel } from "./channels/stripe-trigger";
import { inngest } from "./client";
import { sendWorkflowExecution, topologicalSort } from "./utils";

type ExecuteWorkflowEventData = {
  workflowId?: string;
  triggeredByError?: boolean;
};

function toRecord(value: Prisma.JsonValue | unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

async function dispatchErrorTriggerWorkflows(payload: WorkflowFailurePayload) {
  const sourceWorkflow = await prisma.workflow.findUnique({
    where: { id: payload.sourceWorkflowId },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!sourceWorkflow) {
    return 0;
  }

  const targetWorkflows = await prisma.workflow.findMany({
    where: {
      userId: sourceWorkflow.userId,
      isActive: true,
      id: {
        not: sourceWorkflow.id,
      },
      nodes: {
        some: {
          type: NodeType.ERROR_TRIGGER,
        },
      },
    },
    select: {
      id: true,
      nodes: {
        where: {
          type: NodeType.ERROR_TRIGGER,
        },
        select: {
          id: true,
          data: true,
        },
      },
    },
  });

  let dispatched = 0;

  for (const workflow of targetWorkflows) {
    for (const node of workflow.nodes) {
      const nodeData = toRecord(node.data) as ErrorTriggerNodeData;
      if (!matchesErrorTrigger(nodeData, payload)) {
        continue;
      }

      await sendWorkflowExecution({
        workflowId: workflow.id,
        startNodeId: node.id,
        initialData: buildErrorTriggerInitialData(nodeData, payload),
        triggeredByError: true,
      });
      dispatched += 1;
    }
  }

  return dispatched;
}

export const executeWorkflow = inngest.createFunction(
  {
    id: "execute-workflow",
    retries: process.env.NODE_ENV === "production" ? 3 : 0,
    onFailure: async ({ event }) => {
      const sourceEventId = event.data.event.id;
      const errorMessage = event.data.error.message;
      const errorStack = event.data.error.stack;
      const failedAt = new Date();
      const existingExecution = sourceEventId
        ? await prisma.execution.findUnique({
            where: {
              inngestEventId: sourceEventId,
            },
            include: {
              workflow: {
                select: {
                  id: true,
                  name: true,
                  logStreamingEnabled: true,
                  logStreamingUrl: true,
                  logStreamingLevel: true,
                },
              },
            },
          })
        : null;

      if (existingExecution) {
        await prisma.execution.update({
          where: { inngestEventId: sourceEventId },
          data: {
            status: ExecutionStatus.FAILED,
            error: errorMessage,
            errorStack,
            completedAt: failedAt,
          },
        });

        const streamResult = await streamExecutionLog(
          {
            enabled: existingExecution.workflow.logStreamingEnabled,
            url: existingExecution.workflow.logStreamingUrl,
            minLevel: existingExecution.workflow.logStreamingLevel as
              | "info"
              | "warn"
              | "error",
          },
          {
            workflowId: existingExecution.workflowId,
            workflowName: existingExecution.workflow.name,
            executionId: existingExecution.id,
            inngestEventId: existingExecution.inngestEventId,
            lifecycle: "failed",
            status: "FAILED",
            timestamp: failedAt,
            durationMs: Math.max(
              0,
              failedAt.getTime() -
                new Date(existingExecution.startedAt).getTime(),
            ),
            error: errorMessage,
            errorStack,
          },
        );

        if (!streamResult.sent && streamResult.reason === "request_failed") {
          console.error("Failed to stream execution failure log", {
            workflowId: existingExecution.workflowId,
            executionId: existingExecution.id,
          });
        }
      }

      const originalEventData = (event.data.event.data ??
        {}) as ExecuteWorkflowEventData;
      const sourceWorkflowId =
        originalEventData.workflowId ?? existingExecution?.workflowId;
      if (!sourceWorkflowId || originalEventData.triggeredByError) {
        return { dispatched: 0 };
      }

      const sourceWorkflow =
        existingExecution?.workflow?.id === sourceWorkflowId
          ? {
              id: existingExecution.workflow.id,
              name: existingExecution.workflow.name,
            }
          : await prisma.workflow.findUnique({
              where: { id: sourceWorkflowId },
              select: {
                id: true,
                name: true,
              },
            });

      if (!sourceWorkflow) {
        return { dispatched: 0 };
      }

      const payload: WorkflowFailurePayload = {
        sourceWorkflowId: sourceWorkflow.id,
        sourceWorkflowName: sourceWorkflow.name,
        sourceEventId,
        errorMessage,
        errorStack,
        failedAt: new Date().toISOString(),
      };

      const dispatched = await dispatchErrorTriggerWorkflows(payload);

      return {
        dispatched,
        sourceWorkflowId,
      };
    },
  },
  {
    event: "workflows/execute.workflow",
    channels: [
      httpRequestChannel(),
      manualTriggerChannel(),
      googleFormTriggerChannel(),
      stripeTriggerChannel(),
      geminiChannel(),
      openAiChannel(),
      anthropicChannel(),
      discordChannel(),
      slackChannel(),
    ],
  },
  async ({ event, step, publish }) => {
    const inngestEventId = event.id;
    const workflowId = event.data.workflowId;

    if (!inngestEventId || !workflowId) {
      throw new NonRetriableError("Event ID or workflow ID is missing");
    }

    const execution = await step.run("create-execution", async () => {
      return prisma.execution.create({
        data: {
          workflowId,
          inngestEventId,
        },
      });
    });

    const preparedWorkflow = await step.run("prepare-workflow", async () => {
      const workflow = await prisma.workflow.findUniqueOrThrow({
        where: { id: workflowId },
        select: {
          userId: true,
          name: true,
          logStreamingEnabled: true,
          logStreamingUrl: true,
          logStreamingLevel: true,
          nodes: true,
          connections: true,
        },
      });

      const executionPlan = prepareExecutionPlan(
        topologicalSort(workflow.nodes, workflow.connections),
        workflow.connections,
        {
          startNodeId: event.data.startNodeId,
          pinnedData: event.data.pinnedData,
        },
      );

      return {
        ...executionPlan,
        userId: workflow.userId,
        workflowName: workflow.name,
        logStreamingEnabled: workflow.logStreamingEnabled,
        logStreamingUrl: workflow.logStreamingUrl,
        logStreamingLevel: workflow.logStreamingLevel,
      };
    });

    await step.run("stream-execution-start", async () => {
      return streamExecutionLog(
        {
          enabled: preparedWorkflow.logStreamingEnabled,
          url: preparedWorkflow.logStreamingUrl,
          minLevel: preparedWorkflow.logStreamingLevel as
            | "info"
            | "warn"
            | "error",
        },
        {
          workflowId,
          workflowName: preparedWorkflow.workflowName,
          executionId: execution.id,
          inngestEventId,
          lifecycle: "started",
          status: "RUNNING",
          timestamp: new Date(execution.startedAt),
        },
      );
    });

    // Initialize context with any initial data from the trigger
    let context = {
      ...(event.data.initialData || {}),
      ...preparedWorkflow.initialContext,
    };
    const nodesToExecute = preparedWorkflow.nodes as Array<{
      id: string;
      type: NodeType;
      data?: unknown;
    }>;

    // Execute each node
    for (const node of nodesToExecute) {
      const executor = getExecutor(node.type as NodeType);
      context = await executor({
        data: node.data as Record<string, unknown>,
        nodeId: node.id,
        userId: preparedWorkflow.userId,
        context,
        step,
        publish,
      });
    }

    const completedAt = new Date();

    await step.run("update-execution", async () => {
      return prisma.execution.update({
        where: { inngestEventId, workflowId },
        data: {
          status: ExecutionStatus.SUCCESS,
          completedAt,
          output: context,
        },
      });
    });

    await step.run("stream-execution-success", async () => {
      return streamExecutionLog(
        {
          enabled: preparedWorkflow.logStreamingEnabled,
          url: preparedWorkflow.logStreamingUrl,
          minLevel: preparedWorkflow.logStreamingLevel as
            | "info"
            | "warn"
            | "error",
        },
        {
          workflowId,
          workflowName: preparedWorkflow.workflowName,
          executionId: execution.id,
          inngestEventId,
          lifecycle: "completed",
          status: "SUCCESS",
          timestamp: completedAt,
          durationMs: Math.max(
            0,
            completedAt.getTime() - new Date(execution.startedAt).getTime(),
          ),
        },
      );
    });

    return {
      workflowId,
      result: context,
    };
  },
);

export const pollEmailTriggers = inngest.createFunction(
  {
    id: "poll-email-triggers",
    retries: 0,
  },
  {
    cron: "*/5 * * * *",
  },
  async () => {
    const emailTriggerNodes = await prisma.node.findMany({
      where: {
        type: NodeType.EMAIL_TRIGGER,
        workflow: {
          isActive: true,
        },
      },
      select: {
        id: true,
        workflowId: true,
        data: true,
        workflow: {
          select: {
            userId: true,
          },
        },
      },
    });

    let polled = 0;
    let triggered = 0;

    for (const node of emailTriggerNodes) {
      const nodeData = toRecord(node.data) as EmailTriggerNodeData;
      const credentialId =
        typeof nodeData.credentialId === "string"
          ? nodeData.credentialId
          : null;

      if (!credentialId) {
        continue;
      }

      polled += 1;

      let client: ImapFlow | null = null;
      let mailboxLock: Awaited<ReturnType<ImapFlow["getMailboxLock"]>> | null =
        null;

      try {
        const credential = await prisma.credential.findFirst({
          where: {
            id: credentialId,
            userId: node.workflow.userId,
            type: CredentialType.IMAP,
          },
          select: {
            value: true,
          },
        });

        if (!credential) {
          continue;
        }

        const imapConfig = parseImapCredential(decrypt(credential.value));
        client = new ImapFlow({
          host: imapConfig.host,
          port: imapConfig.port,
          secure: imapConfig.secure,
          auth: {
            user: imapConfig.user,
            pass: imapConfig.pass,
          },
          logger: false,
        });

        await client.connect();

        const mailbox = getEmailTriggerMailbox(nodeData);
        await client.mailboxOpen(mailbox);
        mailboxLock = await client.getMailboxLock(mailbox);

        const searchQuery = buildEmailSearchQuery(nodeData);
        const searchResult = await client.search(searchQuery, {
          uid: true,
        });
        const matchingUids = Array.isArray(searchResult)
          ? searchResult.slice(-getEmailTriggerMaxMessages(nodeData))
          : [];

        if (matchingUids.length === 0) {
          continue;
        }

        const processedUids: number[] = [];

        for await (const message of client.fetch(
          matchingUids,
          {
            uid: true,
            envelope: true,
            flags: true,
            source: {
              maxLength: 64 * 1024,
            },
          },
          {
            uid: true,
          },
        )) {
          if (typeof message.uid !== "number") {
            continue;
          }

          const payload = normalizeEmailTriggerMessage({
            uid: message.uid,
            uidValidity: client.mailbox ? client.mailbox.uidValidity : null,
            mailbox,
            envelope: message.envelope,
            flags: message.flags,
            source: message.source,
          });

          await sendWorkflowExecution({
            workflowId: node.workflowId,
            startNodeId: node.id,
            initialData: buildEmailTriggerInitialData(nodeData, payload),
            eventId: buildEmailTriggerEventId(
              node.workflowId,
              node.id,
              payload,
            ),
          });

          processedUids.push(message.uid);
        }

        if (processedUids.length > 0 && nodeData.markAsSeen !== false) {
          await client.messageFlagsAdd(processedUids, ["\\Seen"], {
            uid: true,
          });
        }

        triggered += processedUids.length;
      } catch (error) {
        console.error("Failed to poll email trigger", {
          nodeId: node.id,
          workflowId: node.workflowId,
          error,
        });
      } finally {
        if (mailboxLock) {
          mailboxLock.release();
        }

        if (client) {
          await client.logout().catch(() => undefined);
        }
      }
    }

    return {
      polled,
      triggered,
    };
  },
);
