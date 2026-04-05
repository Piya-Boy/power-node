import {
  ArchiveIcon,
  ArrowUpDownIcon,
  BookOpenIcon,
  BotIcon,
  BracesIcon,
  CalendarIcon,
  CalendarIcon as CalendarIcon2,
  ClockIcon,
  CodeIcon,
  CopyXIcon,
  CpuIcon,
  DatabaseIcon,
  FileSearchIcon,
  FileTextIcon as FileText2Icon,
  FileTextIcon,
  FilterIcon,
  GitBranchIcon,
  GlobeIcon,
  HardDriveIcon,
  HeartIcon,
  LayersIcon,
  LockIcon,
  MailIcon,
  MergeIcon,
  MessageCircleIcon,
  MousePointerIcon,
  OctagonXIcon,
  RepeatIcon,
  RouteIcon,
  SendIcon,
  ServerIcon,
  SparklesIcon,
  SplitIcon,
  StickyNoteIcon,
  TableIcon,
  TagsIcon,
  TimerIcon,
  WandIcon,
  WebhookIcon,
  WorkflowIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { NodeType } from "@/generated/prisma";

export type NodeCatalogCategory =
  | "trigger"
  | "execution"
  | "logic"
  | "data"
  | "utility"
  | "integration"
  | "ai";

export type NodeTypeOption = {
  type: NodeType;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }> | string;
  category: NodeCatalogCategory;
};

export const NODE_CATEGORY_SECTIONS: {
  key: NodeCatalogCategory;
  label: string;
}[] = [
  { key: "trigger", label: "Triggers" },
  { key: "execution", label: "Actions" },
  { key: "integration", label: "Integrations" },
  { key: "ai", label: "AI & LLM" },
  { key: "logic", label: "Logic & Flow" },
  { key: "data", label: "Data Transformation" },
  { key: "utility", label: "Utilities" },
];

const triggerNodes: NodeTypeOption[] = [
  {
    type: NodeType.MANUAL_TRIGGER,
    label: "Trigger manually",
    description: "Runs the flow on clicking a button",
    icon: MousePointerIcon,
    category: "trigger",
  },
  {
    type: NodeType.GOOGLE_FORM_TRIGGER,
    label: "Google Form",
    description: "Runs when a Google Form is submitted",
    icon: "/logos/googleform.svg",
    category: "trigger",
  },
  {
    type: NodeType.STRIPE_TRIGGER,
    label: "Stripe Event",
    description: "Runs when a Stripe Event is captured",
    icon: "/logos/stripe.svg",
    category: "trigger",
  },
  {
    type: NodeType.EMAIL_TRIGGER,
    label: "Email",
    description: "Poll an IMAP inbox for new messages",
    icon: MailIcon,
    category: "trigger",
  },
  {
    type: NodeType.ERROR_TRIGGER,
    label: "Workflow Error",
    description: "Runs when another workflow fails",
    icon: OctagonXIcon,
    category: "trigger",
  },
  {
    type: NodeType.WEBHOOK_TRIGGER,
    label: "Webhook",
    description: "Receives HTTP webhook requests",
    icon: WebhookIcon,
    category: "trigger",
  },
  {
    type: NodeType.SCHEDULE_TRIGGER,
    label: "Schedule",
    description: "Runs on a cron schedule",
    icon: ClockIcon,
    category: "trigger",
  },
  {
    type: NodeType.CHAT_TRIGGER,
    label: "Chat",
    description: "Runs when a chat message is received",
    icon: MessageCircleIcon,
    category: "trigger",
  },
];

const executionNodes: NodeTypeOption[] = [
  {
    type: NodeType.HTTP_REQUEST,
    label: "HTTP Request",
    description: "Makes an HTTP request",
    icon: GlobeIcon,
    category: "execution",
  },
  {
    type: NodeType.GEMINI,
    label: "Gemini",
    description: "Uses Google Gemini to generate text",
    icon: "/logos/gemini.svg",
    category: "execution",
  },
  {
    type: NodeType.OPENAI,
    label: "OpenAI",
    description: "Uses OpenAI to generate text",
    icon: "/logos/openai.svg",
    category: "execution",
  },
  {
    type: NodeType.ANTHROPIC,
    label: "Anthropic",
    description: "Uses Anthropic to generate text",
    icon: "/logos/anthropic.svg",
    category: "execution",
  },
  {
    type: NodeType.DISCORD,
    label: "Discord",
    description: "Send a message to Discord",
    icon: "/logos/discord.svg",
    category: "execution",
  },
  {
    type: NodeType.SLACK,
    label: "Slack",
    description: "Send a message to Slack",
    icon: "/logos/slack.svg",
    category: "execution",
  },
];

const logicNodes: NodeTypeOption[] = [
  {
    type: NodeType.IF_CONDITION,
    label: "IF Condition",
    description: "Branch based on a condition",
    icon: GitBranchIcon,
    category: "logic",
  },
  {
    type: NodeType.SWITCH,
    label: "Switch",
    description: "Route based on value",
    icon: RouteIcon,
    category: "logic",
  },
  {
    type: NodeType.FILTER,
    label: "Filter",
    description: "Filter items by condition",
    icon: FilterIcon,
    category: "logic",
  },
  {
    type: NodeType.LOOP,
    label: "Loop",
    description: "Iterate over items",
    icon: RepeatIcon,
    category: "logic",
  },
  {
    type: NodeType.MERGE,
    label: "Merge",
    description: "Merge multiple inputs",
    icon: MergeIcon,
    category: "logic",
  },
  {
    type: NodeType.SPLIT,
    label: "Split",
    description: "Split array into items",
    icon: SplitIcon,
    category: "logic",
  },
  {
    type: NodeType.WAIT_DELAY,
    label: "Wait / Delay",
    description: "Wait before continuing",
    icon: TimerIcon,
    category: "logic",
  },
  {
    type: NodeType.STOP_ERROR,
    label: "Stop & Error",
    description: "Stop workflow with error",
    icon: OctagonXIcon,
    category: "logic",
  },
  {
    type: NodeType.SUB_WORKFLOW,
    label: "Sub-workflow",
    description: "Call another workflow",
    icon: WorkflowIcon,
    category: "logic",
  },
];

const dataNodes: NodeTypeOption[] = [
  {
    type: NodeType.CODE,
    label: "Code",
    description: "Run custom JavaScript",
    icon: CodeIcon,
    category: "data",
  },
  {
    type: NodeType.TRANSFORM,
    label: "Transform",
    description: "Transform data structure",
    icon: WandIcon,
    category: "data",
  },
  {
    type: NodeType.AGGREGATE,
    label: "Aggregate",
    description: "Aggregate multiple items",
    icon: LayersIcon,
    category: "data",
  },
  {
    type: NodeType.SORT,
    label: "Sort",
    description: "Sort items",
    icon: ArrowUpDownIcon,
    category: "data",
  },
  {
    type: NodeType.REMOVE_DUPLICATES,
    label: "Remove Duplicates",
    description: "Remove duplicate items",
    icon: CopyXIcon,
    category: "data",
  },
  {
    type: NodeType.DATE_TIME,
    label: "Date/Time",
    description: "Format and manipulate dates",
    icon: CalendarIcon,
    category: "data",
  },
  {
    type: NodeType.CRYPTO,
    label: "Crypto",
    description: "Hash, encrypt, decrypt",
    icon: LockIcon,
    category: "data",
  },
  {
    type: NodeType.MARKDOWN_HTML,
    label: "Markdown/HTML",
    description: "Convert markdown to HTML",
    icon: FileTextIcon,
    category: "data",
  },
  {
    type: NodeType.COMPRESS,
    label: "Compress",
    description: "Zip/unzip files",
    icon: ArchiveIcon,
    category: "data",
  },
];

const integrationNodes: NodeTypeOption[] = [
  {
    type: NodeType.TELEGRAM,
    label: "Telegram",
    description: "Send messages via Telegram Bot",
    icon: SendIcon,
    category: "integration",
  },
  {
    type: NodeType.EMAIL_SMTP,
    label: "Email (SMTP)",
    description: "Send emails via SMTP",
    icon: MailIcon,
    category: "integration",
  },
  {
    type: NodeType.NOTION,
    label: "Notion",
    description: "Read/write Notion databases",
    icon: BookOpenIcon,
    category: "integration",
  },
  {
    type: NodeType.GOOGLE_SHEETS,
    label: "Google Sheets",
    description: "Read/write Google Sheets",
    icon: TableIcon,
    category: "integration",
  },
  {
    type: NodeType.GOOGLE_CALENDAR,
    label: "Google Calendar",
    description: "Manage Google Calendar events",
    icon: CalendarIcon2,
    category: "integration",
  },
  {
    type: NodeType.GOOGLE_DRIVE,
    label: "Google Drive",
    description: "Manage Google Drive files",
    icon: HardDriveIcon,
    category: "integration",
  },
  {
    type: NodeType.GMAIL,
    label: "Gmail",
    description: "Send/read emails via Gmail",
    icon: MailIcon,
    category: "integration",
  },
  {
    type: NodeType.GITHUB,
    label: "GitHub",
    description: "Manage repos, issues, PRs",
    icon: "/logos/github.svg",
    category: "integration",
  },
  {
    type: NodeType.GRAPHQL,
    label: "GraphQL",
    description: "Execute GraphQL queries",
    icon: BracesIcon,
    category: "integration",
  },
  {
    type: NodeType.POSTGRESQL_QUERY,
    label: "PostgreSQL",
    description: "Execute SQL on PostgreSQL",
    icon: DatabaseIcon,
    category: "integration",
  },
  {
    type: NodeType.MYSQL_QUERY,
    label: "MySQL",
    description: "Execute SQL on MySQL",
    icon: DatabaseIcon,
    category: "integration",
  },
  // Phase 27: MCP
  {
    type: NodeType.MCP_SERVER,
    label: "MCP Server",
    description: "Call a tool on an external MCP server",
    icon: ServerIcon,
    category: "integration",
  },
];

const aiNodes: NodeTypeOption[] = [
  {
    type: NodeType.AI_AGENT,
    label: "AI Agent",
    description: "AI agent with tool use",
    icon: BotIcon,
    category: "ai",
  },
  {
    type: NodeType.OLLAMA,
    label: "Ollama",
    description: "Run local LLMs (Llama, Mistral)",
    icon: CpuIcon,
    category: "ai",
  },
  {
    type: NodeType.TEXT_CLASSIFIER,
    label: "Text Classifier",
    description: "Classify text into categories",
    icon: TagsIcon,
    category: "ai",
  },
  {
    type: NodeType.SENTIMENT_ANALYSIS,
    label: "Sentiment Analysis",
    description: "Analyze text sentiment",
    icon: HeartIcon,
    category: "ai",
  },
  {
    type: NodeType.INFORMATION_EXTRACTOR,
    label: "Info Extractor",
    description: "Extract structured data from text",
    icon: FileSearchIcon,
    category: "ai",
  },
  {
    type: NodeType.AI_TRANSFORM,
    label: "AI Transform",
    description: "Transform data with AI",
    icon: SparklesIcon,
    category: "ai",
  },
  {
    type: NodeType.SUMMARIZATION,
    label: "Summarize",
    description: "Summarize text automatically",
    icon: FileText2Icon,
    category: "ai",
  },
];

const utilityNodes: NodeTypeOption[] = [
  {
    type: NodeType.STICKY_NOTE,
    label: "Sticky Note",
    description: "Add a note or comment to the canvas",
    icon: StickyNoteIcon,
    category: "utility",
  },
];

export const allNodeCatalogOptions: NodeTypeOption[] = [
  ...triggerNodes,
  ...executionNodes,
  ...integrationNodes,
  ...aiNodes,
  ...logicNodes,
  ...dataNodes,
  ...utilityNodes,
];

export function filterNodeCatalogOptions(
  search: string,
  nodes: NodeTypeOption[] = allNodeCatalogOptions,
): NodeTypeOption[] {
  const q = search.trim().toLowerCase();
  if (!q) return nodes;
  return nodes.filter(
    (n) =>
      n.label.toLowerCase().includes(q) ||
      n.description.toLowerCase().includes(q),
  );
}

export function NodeCatalogIcon({
  icon,
  label,
  className = "size-5 shrink-0",
}: {
  icon: NodeTypeOption["icon"];
  label: string;
  className?: string;
}) {
  if (typeof icon === "string") {
    return (
      // biome-ignore lint/performance/noImgElement: public SVG/PNG paths, not Next Image srcSet use-case
      <img
        src={icon}
        alt={label}
        className={`object-contain rounded-sm ${className}`}
      />
    );
  }
  const Icon = icon;
  return <Icon className={className} />;
}
