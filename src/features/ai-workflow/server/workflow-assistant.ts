import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { CredentialType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import {
  availableNodeTypes,
  formatWorkflowSnapshot,
  normalizeWorkflowDefinition,
  triggerNodeTypes,
  type WorkflowDefinition,
  type WorkflowDefinitionConnection,
  type WorkflowDefinitionNode,
  workflowSchema,
} from "../lib/workflow-definition";

const suggestionSchema = z.object({
  title: z.string(),
  description: z.string(),
  nodeType: z.enum(availableNodeTypes as [string, ...string[]]),
  prompt: z.string(),
});

const suggestionResponseSchema = z.object({
  summary: z.string(),
  suggestions: z.array(suggestionSchema).min(1).max(5),
});

const chatResponseSchema = z.object({
  assistantMessage: z.string(),
  workflow: workflowSchema,
});

const fixResponseSchema = z.object({
  assistantMessage: z.string(),
  fixes: z.array(z.string()).min(1).max(5),
  workflow: workflowSchema,
});

export type GenerateWorkflowModelId = "gpt-4o" | "gpt-4o-mini";

export type WorkflowAssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

export type WorkflowSuggestion = z.infer<typeof suggestionSchema>;

async function getOpenAIApiKey(userId: string, credentialId: string) {
  const credential = await prisma.credential.findFirstOrThrow({
    where: {
      id: credentialId,
      userId,
      type: CredentialType.OPENAI,
    },
    select: {
      value: true,
    },
  });

  return decrypt(credential.value);
}

function getWorkflowSystemPrompt() {
  return `You are a workflow automation expert for PowerNode, similar to n8n.
You generate and improve workflow definitions from natural language descriptions.

Available Node Types: ${availableNodeTypes.join(", ")}

Key Trigger Types: ${triggerNodeTypes.join(", ")}

Key Node Type Descriptions:
- MANUAL_TRIGGER: Starting point, user clicks button to run
- WEBHOOK_TRIGGER: Receives HTTP webhook requests
- SCHEDULE_TRIGGER: Runs on a cron schedule
- CHAT_TRIGGER: Triggered by a chat message
- EMAIL_TRIGGER: Polls an IMAP inbox for matching email
- ERROR_TRIGGER: Runs when another workflow fails
- HTTP_REQUEST: Makes HTTP requests (data: { variableName, endpoint, method, body })
- OPENAI: AI text generation (data: { variableName, systemPrompt, userPrompt })
- ANTHROPIC: AI text generation (data: { variableName, systemPrompt, userPrompt })
- DISCORD: Send Discord message (data: { variableName, webhookUrl, content })
- SLACK: Send Slack message (data: { variableName, webhookUrl, text })
- TELEGRAM: Send Telegram message (data: { variableName, chatId, message })
- EMAIL_SMTP: Send email (data: { variableName, to, subject, body })
- GMAIL: Send/read Gmail (data: { variableName, operation, to, subject, body })
- IF_CONDITION: Branch on condition (data: { variableName, field, operator, value })
- CODE: Run JavaScript (data: { variableName, language: "javascript", code })
- TRANSFORM: Transform data (data: { variableName })
- NOTION: Read/write Notion (data: { variableName, operation, databaseId })
- GOOGLE_SHEETS: Read/write Sheets (data: { variableName, operation, spreadsheetId, range })
- GITHUB: GitHub API (data: { variableName, operation, owner, repo })
- GRAPHQL: GraphQL query (data: { variableName, endpoint, query })
- AI_AGENT: AI agent with context (data: { variableName, userPrompt })
- TEXT_CLASSIFIER: Classify text (data: { variableName, text, categories })
- SENTIMENT_ANALYSIS: Analyze sentiment (data: { variableName, text })
- SUMMARIZATION: Summarize text (data: { variableName, text, style })
- AI_TRANSFORM: Transform with AI (data: { variableName, instruction })
- STICKY_NOTE: Add comments (data: { text, color })

Rules:
1. Every workflow must contain at least one trigger node.
2. Preserve existing node IDs when keeping a node from the current workflow.
3. Use new temporary ids like "node_new_1" only for newly introduced nodes.
4. Keep positions readable from left to right with ~250px spacing.
5. Include meaningful variableName values whenever a node outputs data.
6. Use {{variableName.property}} syntax in templates to reference previous node outputs.
7. Keep the workflow valid and connected.
8. Prefer minimal edits over rewriting everything when improving an existing workflow.`;
}

function getModel(modelId: GenerateWorkflowModelId, apiKey: string) {
  const openai = createOpenAI({ apiKey });
  return openai(modelId);
}

function stringifyHistory(history: WorkflowAssistantMessage[] = []) {
  if (history.length === 0) {
    return "No previous conversation.";
  }

  return history
    .slice(-8)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");
}

export async function generateWorkflowFromPromptWithCredential(input: {
  userId: string;
  credentialId: string;
  prompt: string;
  modelId: GenerateWorkflowModelId;
}) {
  const apiKey = await getOpenAIApiKey(input.userId, input.credentialId);

  const { object } = await generateObject({
    model: getModel(input.modelId, apiKey),
    system: getWorkflowSystemPrompt(),
    prompt: `Generate a brand new workflow for: ${input.prompt}`,
    schema: workflowSchema,
  });

  return normalizeWorkflowDefinition(object);
}

export async function suggestWorkflowImprovements(input: {
  userId: string;
  credentialId: string;
  modelId: GenerateWorkflowModelId;
  nodes: WorkflowDefinitionNode[];
  connections: WorkflowDefinitionConnection[];
}) {
  const apiKey = await getOpenAIApiKey(input.userId, input.credentialId);

  const { object } = await generateObject({
    model: getModel(input.modelId, apiKey),
    system: `${getWorkflowSystemPrompt()}
Return concise, actionable workflow improvement ideas. Do not return a workflow definition here.`,
    prompt: `Review this workflow and suggest the best next improvements:

${formatWorkflowSnapshot({
  nodes: input.nodes,
  connections: input.connections,
})}`,
    schema: suggestionResponseSchema,
  });

  return object;
}

export async function updateWorkflowWithAssistant(input: {
  userId: string;
  credentialId: string;
  modelId: GenerateWorkflowModelId;
  prompt: string;
  history?: WorkflowAssistantMessage[];
  nodes: WorkflowDefinitionNode[];
  connections: WorkflowDefinitionConnection[];
}) {
  const apiKey = await getOpenAIApiKey(input.userId, input.credentialId);

  const { object } = await generateObject({
    model: getModel(input.modelId, apiKey),
    system: `${getWorkflowSystemPrompt()}
You are responding inside a collaborative workflow chat. Explain the change briefly and return the updated workflow.`,
    prompt: `Current workflow:
${formatWorkflowSnapshot({
  nodes: input.nodes,
  connections: input.connections,
})}

Conversation so far:
${stringifyHistory(input.history)}

Latest user request:
${input.prompt}`,
    schema: chatResponseSchema,
  });

  return {
    assistantMessage: object.assistantMessage,
    workflow: normalizeWorkflowDefinition(object.workflow, input.nodes),
  };
}

export async function autoFixWorkflowExecution(input: {
  userId: string;
  credentialId: string;
  modelId: GenerateWorkflowModelId;
  executionId: string;
}) {
  const apiKey = await getOpenAIApiKey(input.userId, input.credentialId);

  const execution = await prisma.execution.findUniqueOrThrow({
    where: {
      id: input.executionId,
      workflow: {
        userId: input.userId,
      },
    },
    include: {
      workflow: {
        include: {
          nodes: true,
          connections: true,
        },
      },
    },
  });

  const currentWorkflow: WorkflowDefinition = {
    nodes: execution.workflow.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      name: node.name,
      position: node.position as { x: number; y: number },
      data:
        typeof node.data === "object" &&
        node.data !== null &&
        !Array.isArray(node.data)
          ? (node.data as Record<string, unknown>)
          : {},
    })),
    connections: execution.workflow.connections.map((connection) => ({
      fromNodeId: connection.fromNodeId,
      toNodeId: connection.toNodeId,
      fromOutput: connection.fromOutput,
      toInput: connection.toInput,
    })),
    summary: execution.workflow.description ?? execution.workflow.name,
  };

  const { object } = await generateObject({
    model: getModel(input.modelId, apiKey),
    system: `${getWorkflowSystemPrompt()}
You are fixing a failed workflow execution. Explain the likely root cause, propose concrete fixes, and return an updated workflow definition that addresses the issue.`,
    prompt: `Workflow:
${formatWorkflowSnapshot(currentWorkflow)}

Failure details:
- Workflow name: ${execution.workflow.name}
- Error: ${execution.error ?? "Unknown error"}
- Error stack: ${execution.errorStack ?? "No stack trace"}
- Last output: ${JSON.stringify(execution.output ?? null, null, 2)}`,
    schema: fixResponseSchema,
  });

  return {
    assistantMessage: object.assistantMessage,
    fixes: object.fixes,
    workflow: normalizeWorkflowDefinition(
      object.workflow,
      currentWorkflow.nodes,
    ),
    workflowId: execution.workflowId,
  };
}
