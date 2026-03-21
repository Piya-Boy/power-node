import { NodeType } from "@/generated/prisma";
import { NodeExecutor } from "../types";
import { manualTriggerExecutor } from "@/features/triggers/components/manual-trigger/executor";
import { httpRequestExecutor } from "../components/http-request/executor";
import { googleFormTriggerExecutor } from "@/features/triggers/components/google-form-trigger/executor";
import { stripeTriggerExecutor } from "@/features/triggers/components/stripe-trigger/executor";
import { geminiExecutor } from "../components/gemini/executor";
import { openAiExecutor } from "../components/openai/executor";
import { anthropicExecutor } from "../components/anthropic/executor";
import { discordExecutor } from "../components/discord/executor";
import { slackExecutor } from "../components/slack/executor";

// Phase 2
import { webhookTriggerExecutor } from "@/features/triggers/components/webhook-trigger/executor";
import { scheduleTriggerExecutor } from "@/features/triggers/components/schedule-trigger/executor";
import { ifConditionExecutor } from "../components/if-condition/executor";
import { codeExecutor } from "../components/code/executor";

// No-op executor for nodes that don't execute (e.g., sticky notes, placeholder nodes)
const noopExecutor: NodeExecutor = async ({ context }) => context;

export const executorRegistry: Record<NodeType, NodeExecutor> = {
  [NodeType.INITIAL]: manualTriggerExecutor,
  [NodeType.MANUAL_TRIGGER]: manualTriggerExecutor,
  [NodeType.HTTP_REQUEST]: httpRequestExecutor,
  [NodeType.GOOGLE_FORM_TRIGGER]: googleFormTriggerExecutor,
  [NodeType.STRIPE_TRIGGER]: stripeTriggerExecutor,
  [NodeType.GEMINI]: geminiExecutor,
  [NodeType.ANTHROPIC]: anthropicExecutor,
  [NodeType.OPENAI]: openAiExecutor,
  [NodeType.DISCORD]: discordExecutor,
  [NodeType.SLACK]: slackExecutor,
  [NodeType.STICKY_NOTE]: noopExecutor,
  // Phase 2: Triggers
  [NodeType.WEBHOOK_TRIGGER]: webhookTriggerExecutor,
  [NodeType.SCHEDULE_TRIGGER]: scheduleTriggerExecutor,
  // Phase 2: Logic & Flow Control
  [NodeType.IF_CONDITION]: ifConditionExecutor,
  [NodeType.SWITCH]: noopExecutor,
  [NodeType.FILTER]: noopExecutor,
  [NodeType.LOOP]: noopExecutor,
  [NodeType.MERGE]: noopExecutor,
  [NodeType.SPLIT]: noopExecutor,
  [NodeType.WAIT_DELAY]: noopExecutor,
  [NodeType.STOP_ERROR]: noopExecutor,
  [NodeType.SUB_WORKFLOW]: noopExecutor,
  // Phase 2: Data Transformation
  [NodeType.CODE]: codeExecutor,
  [NodeType.TRANSFORM]: noopExecutor,
  [NodeType.AGGREGATE]: noopExecutor,
  [NodeType.SORT]: noopExecutor,
  [NodeType.REMOVE_DUPLICATES]: noopExecutor,
  [NodeType.DATE_TIME]: noopExecutor,
  [NodeType.CRYPTO]: noopExecutor,
  [NodeType.MARKDOWN_HTML]: noopExecutor,
  [NodeType.COMPRESS]: noopExecutor,
};

export const getExecutor = (type: NodeType): NodeExecutor => {
  const executor = executorRegistry[type];
  if (!executor) {
    throw new Error(`No executor found for node type: ${type}`);
  }

  return executor;
};
