import type { NodeTypes } from "@xyflow/react";
import { InitialNode } from "@/components/initial-node";
import { StickyNoteNode } from "@/features/editor/components/sticky-note-node";
// Phase 4: AI & LLM
import { AiAgentNode } from "@/features/executions/components/ai-agent/node";
import { AiTransformNode } from "@/features/executions/components/ai-transform/node";
import { AnthropicNode } from "@/features/executions/components/anthropic/node";
// Phase 2: Data Transformation
import { CodeNode } from "@/features/executions/components/code/node";
import { DiscordNode } from "@/features/executions/components/discord/node";
import { EmailSmtpNode } from "@/features/executions/components/email-smtp/node";
import { FilterNode } from "@/features/executions/components/filter/node";
import { GeminiNode } from "@/features/executions/components/gemini/node";
import { GitHubNode } from "@/features/executions/components/github/node";
import { GmailNode } from "@/features/executions/components/gmail/node";
import { GoogleCalendarNode } from "@/features/executions/components/google-calendar/node";
import { GoogleDriveNode } from "@/features/executions/components/google-drive/node";
import { GoogleSheetsNode } from "@/features/executions/components/google-sheets/node";
import { GraphQLNode } from "@/features/executions/components/graphql/node";
import { HttpRequestNode } from "@/features/executions/components/http-request/node";
// Phase 2: Logic & Flow Control
import { IfConditionNode } from "@/features/executions/components/if-condition/node";
import { InformationExtractorNode } from "@/features/executions/components/information-extractor/node";
import { LoopNode } from "@/features/executions/components/loop/node";
import { MergeNode } from "@/features/executions/components/merge/node";
import { MysqlNode } from "@/features/executions/components/mysql-query/node";
import { NotionNode } from "@/features/executions/components/notion/node";
import { OllamaNode } from "@/features/executions/components/ollama/node";
import { OpenAiNode } from "@/features/executions/components/openai/node";
import { PostgresqlNode } from "@/features/executions/components/postgresql-query/node";
import { SentimentAnalysisNode } from "@/features/executions/components/sentiment-analysis/node";
import { SlackNode } from "@/features/executions/components/slack/node";
import { SortNode } from "@/features/executions/components/sort/node";
import { SplitNode } from "@/features/executions/components/split/node";
import { SummarizationNode } from "@/features/executions/components/summarization/node";
import { SwitchNode } from "@/features/executions/components/switch/node";
// Phase 3: Integrations
import { TelegramNode } from "@/features/executions/components/telegram/node";
import { TextClassifierNode } from "@/features/executions/components/text-classifier/node";
import { TransformNode } from "@/features/executions/components/transform/node";
import { WaitDelayNode } from "@/features/executions/components/wait-delay/node";
import { ChatTriggerNode } from "@/features/triggers/components/chat-trigger/node";
import { EmailTriggerNode } from "@/features/triggers/components/email-trigger/node";
// Phase 27: MCP
import { McpServerNode } from "@/features/executions/components/mcp-server/node";
import { ErrorTriggerNode } from "@/features/triggers/components/error-trigger/node";
import { GoogleFormTrigger } from "@/features/triggers/components/google-form-trigger/node";
import { ManualTriggerNode } from "@/features/triggers/components/manual-trigger/node";
import { ScheduleTriggerNode } from "@/features/triggers/components/schedule-trigger/node";
import { StripeTriggerNode } from "@/features/triggers/components/stripe-trigger/node";
// Phase 2: Triggers
import { WebhookTriggerNode } from "@/features/triggers/components/webhook-trigger/node";
import { NodeType } from "@/generated/prisma";

export const nodeComponents = {
  [NodeType.INITIAL]: InitialNode,
  [NodeType.HTTP_REQUEST]: HttpRequestNode,
  [NodeType.MANUAL_TRIGGER]: ManualTriggerNode,
  [NodeType.GOOGLE_FORM_TRIGGER]: GoogleFormTrigger,
  [NodeType.STRIPE_TRIGGER]: StripeTriggerNode,
  [NodeType.EMAIL_TRIGGER]: EmailTriggerNode,
  [NodeType.ERROR_TRIGGER]: ErrorTriggerNode,
  [NodeType.GEMINI]: GeminiNode,
  [NodeType.OPENAI]: OpenAiNode,
  [NodeType.ANTHROPIC]: AnthropicNode,
  [NodeType.DISCORD]: DiscordNode,
  [NodeType.SLACK]: SlackNode,
  [NodeType.STICKY_NOTE]: StickyNoteNode,
  // Phase 2: Triggers
  [NodeType.WEBHOOK_TRIGGER]: WebhookTriggerNode,
  [NodeType.SCHEDULE_TRIGGER]: ScheduleTriggerNode,
  // Phase 2: Logic & Flow Control
  [NodeType.IF_CONDITION]: IfConditionNode,
  [NodeType.SWITCH]: SwitchNode,
  [NodeType.FILTER]: FilterNode,
  [NodeType.LOOP]: LoopNode,
  [NodeType.MERGE]: MergeNode,
  [NodeType.SPLIT]: SplitNode,
  [NodeType.WAIT_DELAY]: WaitDelayNode,
  [NodeType.STOP_ERROR]: WaitDelayNode, // Reuse wait node styling for now
  [NodeType.SUB_WORKFLOW]: MergeNode, // Reuse merge node styling for now
  // Phase 2: Data Transformation
  [NodeType.CODE]: CodeNode,
  [NodeType.TRANSFORM]: TransformNode,
  [NodeType.AGGREGATE]: TransformNode, // Reuse transform styling
  [NodeType.SORT]: SortNode,
  [NodeType.REMOVE_DUPLICATES]: FilterNode, // Reuse filter styling
  [NodeType.DATE_TIME]: TransformNode,
  [NodeType.CRYPTO]: TransformNode,
  [NodeType.MARKDOWN_HTML]: TransformNode,
  [NodeType.COMPRESS]: TransformNode,
  // Phase 3: Integrations
  [NodeType.TELEGRAM]: TelegramNode,
  [NodeType.EMAIL_SMTP]: EmailSmtpNode,
  [NodeType.NOTION]: NotionNode,
  [NodeType.GOOGLE_SHEETS]: GoogleSheetsNode,
  [NodeType.GOOGLE_CALENDAR]: GoogleCalendarNode,
  [NodeType.GOOGLE_DRIVE]: GoogleDriveNode,
  [NodeType.GMAIL]: GmailNode,
  [NodeType.GITHUB]: GitHubNode,
  [NodeType.GRAPHQL]: GraphQLNode,
  [NodeType.POSTGRESQL_QUERY]: PostgresqlNode,
  [NodeType.MYSQL_QUERY]: MysqlNode,
  // Phase 4: AI & LLM
  [NodeType.AI_AGENT]: AiAgentNode,
  [NodeType.OLLAMA]: OllamaNode,
  [NodeType.TEXT_CLASSIFIER]: TextClassifierNode,
  [NodeType.SENTIMENT_ANALYSIS]: SentimentAnalysisNode,
  [NodeType.INFORMATION_EXTRACTOR]: InformationExtractorNode,
  [NodeType.AI_TRANSFORM]: AiTransformNode,
  [NodeType.SUMMARIZATION]: SummarizationNode,
  [NodeType.CHAT_TRIGGER]: ChatTriggerNode,
  // Phase 27: MCP
  [NodeType.MCP_SERVER]: McpServerNode,
} as const satisfies NodeTypes;

export type RegisteredNodeType = keyof typeof nodeComponents;
