import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import {
  availableNodeTypes,
  normalizeWorkflowDefinition,
  triggerNodeTypes,
  type WorkflowDefinition,
  workflowSchema,
} from "./lib/workflow-definition";

export type GeneratedWorkflow = WorkflowDefinition;

export type GenerateWorkflowModelId = "gpt-4o" | "gpt-4o-mini";

export type GenerateWorkflowOptions = {
  modelId?: GenerateWorkflowModelId;
};

export async function generateWorkflowFromPrompt(
  prompt: string,
  apiKey: string,
  options?: GenerateWorkflowOptions,
): Promise<GeneratedWorkflow> {
  const modelId: GenerateWorkflowModelId = options?.modelId ?? "gpt-4o";
  const openai = createOpenAI({ apiKey });

  const { object } = await generateObject({
    model: openai(modelId),
    system: `You are a workflow automation expert for PowerNode, similar to n8n.
You generate workflow definitions from natural language descriptions.

Available Node Types: ${availableNodeTypes.join(", ")}

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
1. Every workflow must start with a trigger node (${triggerNodeTypes.join(", ")})
2. Assign unique IDs using format "node_1", "node_2", etc.
3. Position nodes left-to-right with ~250px horizontal spacing and ~100px vertical spacing
4. Start positions at x:100, y:200
5. Include meaningful variableNames in node data so outputs can be referenced
6. Use {{variableName.property}} syntax in templates to reference previous node outputs
7. Create logical connections between nodes
8. Add STICKY_NOTE nodes for documentation when the workflow is complex`,
    prompt: `Generate a workflow for: ${prompt}`,
    schema: workflowSchema,
  });

  return normalizeWorkflowDefinition(object);
}
