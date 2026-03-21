"use client";

import { useState, useCallback, type DragEvent } from "react";
import { useReactFlow } from "@xyflow/react";
import { createId } from "@paralleldrive/cuid2";
import {
  GlobeIcon,
  MousePointerIcon,
  SearchIcon,
  GripVerticalIcon,
  StickyNoteIcon,
  WebhookIcon,
  ClockIcon,
  GitBranchIcon,
  RouteIcon,
  FilterIcon,
  RepeatIcon,
  MergeIcon,
  SplitIcon,
  TimerIcon,
  OctagonXIcon,
  WorkflowIcon,
  CodeIcon,
  WandIcon,
  LayersIcon,
  ArrowUpDownIcon,
  CopyXIcon,
  CalendarIcon,
  LockIcon,
  FileTextIcon,
  ArchiveIcon,
  SendIcon,
  MailIcon,
  BookOpenIcon,
  TableIcon,
  CalendarIcon as CalendarIcon2,
  HardDriveIcon,
  BracesIcon,
  DatabaseIcon,
  BotIcon,
  CpuIcon,
  TagsIcon,
  HeartIcon,
  FileSearchIcon,
  SparklesIcon,
  FileTextIcon as FileText2Icon,
  MessageCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import { NodeType } from "@/generated/prisma";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export type NodeTypeOption = {
  type: NodeType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }> | string;
  category: "trigger" | "execution" | "logic" | "data" | "utility" | "integration" | "ai";
};

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
  { type: NodeType.IF_CONDITION, label: "IF Condition", description: "Branch based on a condition", icon: GitBranchIcon, category: "logic" },
  { type: NodeType.SWITCH, label: "Switch", description: "Route based on value", icon: RouteIcon, category: "logic" },
  { type: NodeType.FILTER, label: "Filter", description: "Filter items by condition", icon: FilterIcon, category: "logic" },
  { type: NodeType.LOOP, label: "Loop", description: "Iterate over items", icon: RepeatIcon, category: "logic" },
  { type: NodeType.MERGE, label: "Merge", description: "Merge multiple inputs", icon: MergeIcon, category: "logic" },
  { type: NodeType.SPLIT, label: "Split", description: "Split array into items", icon: SplitIcon, category: "logic" },
  { type: NodeType.WAIT_DELAY, label: "Wait / Delay", description: "Wait before continuing", icon: TimerIcon, category: "logic" },
  { type: NodeType.STOP_ERROR, label: "Stop & Error", description: "Stop workflow with error", icon: OctagonXIcon, category: "logic" },
  { type: NodeType.SUB_WORKFLOW, label: "Sub-workflow", description: "Call another workflow", icon: WorkflowIcon, category: "logic" },
];

const dataNodes: NodeTypeOption[] = [
  { type: NodeType.CODE, label: "Code", description: "Run custom JavaScript", icon: CodeIcon, category: "data" },
  { type: NodeType.TRANSFORM, label: "Transform", description: "Transform data structure", icon: WandIcon, category: "data" },
  { type: NodeType.AGGREGATE, label: "Aggregate", description: "Aggregate multiple items", icon: LayersIcon, category: "data" },
  { type: NodeType.SORT, label: "Sort", description: "Sort items", icon: ArrowUpDownIcon, category: "data" },
  { type: NodeType.REMOVE_DUPLICATES, label: "Remove Duplicates", description: "Remove duplicate items", icon: CopyXIcon, category: "data" },
  { type: NodeType.DATE_TIME, label: "Date/Time", description: "Format and manipulate dates", icon: CalendarIcon, category: "data" },
  { type: NodeType.CRYPTO, label: "Crypto", description: "Hash, encrypt, decrypt", icon: LockIcon, category: "data" },
  { type: NodeType.MARKDOWN_HTML, label: "Markdown/HTML", description: "Convert markdown to HTML", icon: FileTextIcon, category: "data" },
  { type: NodeType.COMPRESS, label: "Compress", description: "Zip/unzip files", icon: ArchiveIcon, category: "data" },
];

const integrationNodes: NodeTypeOption[] = [
  { type: NodeType.TELEGRAM, label: "Telegram", description: "Send messages via Telegram Bot", icon: SendIcon, category: "integration" },
  { type: NodeType.EMAIL_SMTP, label: "Email (SMTP)", description: "Send emails via SMTP", icon: MailIcon, category: "integration" },
  { type: NodeType.NOTION, label: "Notion", description: "Read/write Notion databases", icon: BookOpenIcon, category: "integration" },
  { type: NodeType.GOOGLE_SHEETS, label: "Google Sheets", description: "Read/write Google Sheets", icon: TableIcon, category: "integration" },
  { type: NodeType.GOOGLE_CALENDAR, label: "Google Calendar", description: "Manage Google Calendar events", icon: CalendarIcon2, category: "integration" },
  { type: NodeType.GOOGLE_DRIVE, label: "Google Drive", description: "Manage Google Drive files", icon: HardDriveIcon, category: "integration" },
  { type: NodeType.GMAIL, label: "Gmail", description: "Send/read emails via Gmail", icon: MailIcon, category: "integration" },
  { type: NodeType.GITHUB, label: "GitHub", description: "Manage repos, issues, PRs", icon: "/logos/github.svg", category: "integration" },
  { type: NodeType.GRAPHQL, label: "GraphQL", description: "Execute GraphQL queries", icon: BracesIcon, category: "integration" },
  { type: NodeType.POSTGRESQL_QUERY, label: "PostgreSQL", description: "Execute SQL on PostgreSQL", icon: DatabaseIcon, category: "integration" },
  { type: NodeType.MYSQL_QUERY, label: "MySQL", description: "Execute SQL on MySQL", icon: DatabaseIcon, category: "integration" },
];

const aiNodes: NodeTypeOption[] = [
  { type: NodeType.AI_AGENT, label: "AI Agent", description: "AI agent with tool use", icon: BotIcon, category: "ai" },
  { type: NodeType.OLLAMA, label: "Ollama", description: "Run local LLMs (Llama, Mistral)", icon: CpuIcon, category: "ai" },
  { type: NodeType.TEXT_CLASSIFIER, label: "Text Classifier", description: "Classify text into categories", icon: TagsIcon, category: "ai" },
  { type: NodeType.SENTIMENT_ANALYSIS, label: "Sentiment Analysis", description: "Analyze text sentiment", icon: HeartIcon, category: "ai" },
  { type: NodeType.INFORMATION_EXTRACTOR, label: "Info Extractor", description: "Extract structured data from text", icon: FileSearchIcon, category: "ai" },
  { type: NodeType.AI_TRANSFORM, label: "AI Transform", description: "Transform data with AI", icon: SparklesIcon, category: "ai" },
  { type: NodeType.SUMMARIZATION, label: "Summarize", description: "Summarize text automatically", icon: FileText2Icon, category: "ai" },
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

const allNodes = [...triggerNodes, ...executionNodes, ...integrationNodes, ...aiNodes, ...logicNodes, ...dataNodes, ...utilityNodes];

function NodeIcon({ icon, label }: { icon: NodeTypeOption["icon"]; label: string }) {
  if (typeof icon === "string") {
    return <img src={icon} alt={label} className="size-5 object-contain rounded-sm shrink-0" />;
  }
  const Icon = icon;
  return <Icon className="size-5 shrink-0" />;
}

function DraggableNodeItem({ node }: { node: NodeTypeOption }) {
  const onDragStart = useCallback(
    (event: DragEvent) => {
      event.dataTransfer.setData("application/powernode-type", node.type);
      event.dataTransfer.effectAllowed = "move";
    },
    [node.type],
  );

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex items-center gap-3 px-3 py-2.5 rounded-md cursor-grab active:cursor-grabbing hover:bg-accent transition-colors group"
    >
      <GripVerticalIcon className="size-3.5 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0" />
      <NodeIcon icon={node.icon} label={node.label} />
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium truncate">{node.label}</span>
        <span className="text-xs text-muted-foreground truncate">{node.description}</span>
      </div>
    </div>
  );
}

interface NodeLibraryProps {
  className?: string;
}

export function NodeLibrary({ className }: NodeLibraryProps) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? allNodes.filter(
        (n) =>
          n.label.toLowerCase().includes(search.toLowerCase()) ||
          n.description.toLowerCase().includes(search.toLowerCase()),
      )
    : allNodes;

  const filteredTriggers = filtered.filter((n) => n.category === "trigger");
  const filteredExecutions = filtered.filter((n) => n.category === "execution");
  const filteredIntegrations = filtered.filter((n) => n.category === "integration");
  const filteredAi = filtered.filter((n) => n.category === "ai");
  const filteredLogic = filtered.filter((n) => n.category === "logic");
  const filteredData = filtered.filter((n) => n.category === "data");
  const filteredUtilities = filtered.filter((n) => n.category === "utility");

  return (
    <div className={className}>
      <div className="p-3">
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search nodes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        {filteredTriggers.length > 0 && (
          <div className="px-3 pb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-3">
              Triggers
            </p>
            {filteredTriggers.map((node) => (
              <DraggableNodeItem key={node.type} node={node} />
            ))}
          </div>
        )}
        {filteredTriggers.length > 0 && filteredExecutions.length > 0 && (
          <Separator className="my-1" />
        )}
        {filteredExecutions.length > 0 && (
          <div className="px-3 pb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-3">
              Actions
            </p>
            {filteredExecutions.map((node) => (
              <DraggableNodeItem key={node.type} node={node} />
            ))}
          </div>
        )}
        {filteredIntegrations.length > 0 && (
          <>
            <Separator className="my-1" />
            <div className="px-3 pb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-3">
                Integrations
              </p>
              {filteredIntegrations.map((node) => (
                <DraggableNodeItem key={node.type} node={node} />
              ))}
            </div>
          </>
        )}
        {filteredAi.length > 0 && (
          <>
            <Separator className="my-1" />
            <div className="px-3 pb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-3">
                AI & LLM
              </p>
              {filteredAi.map((node) => (
                <DraggableNodeItem key={node.type} node={node} />
              ))}
            </div>
          </>
        )}
        {filteredLogic.length > 0 && (
          <>
            <Separator className="my-1" />
            <div className="px-3 pb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-3">
                Logic & Flow
              </p>
              {filteredLogic.map((node) => (
                <DraggableNodeItem key={node.type} node={node} />
              ))}
            </div>
          </>
        )}
        {filteredData.length > 0 && (
          <>
            <Separator className="my-1" />
            <div className="px-3 pb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-3">
                Data Transformation
              </p>
              {filteredData.map((node) => (
                <DraggableNodeItem key={node.type} node={node} />
              ))}
            </div>
          </>
        )}
        {filteredUtilities.length > 0 && (
          <>
            <Separator className="my-1" />
            <div className="px-3 pb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-3">
                Utilities
              </p>
              {filteredUtilities.map((node) => (
                <DraggableNodeItem key={node.type} node={node} />
              ))}
            </div>
          </>
        )}
        {filtered.length === 0 && (
          <div className="px-6 py-8 text-center text-sm text-muted-foreground">
            No nodes found
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export function useNodeDrop() {
  const { setNodes, getNodes, screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData("application/powernode-type") as NodeType;
      if (!nodeType) return;

      if (nodeType === NodeType.MANUAL_TRIGGER) {
        const nodes = getNodes();
        if (nodes.some((n) => n.type === NodeType.MANUAL_TRIGGER)) {
          toast.error("Only one manual trigger is allowed per workflow");
          return;
        }
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      setNodes((nodes) => {
        const hasInitial = nodes.some((n) => n.type === NodeType.INITIAL);
        const newNode = {
          id: createId(),
          data: {},
          position,
          type: nodeType,
        };

        if (hasInitial) {
          return [newNode];
        }
        return [...nodes, newNode];
      });
    },
    [setNodes, getNodes, screenToFlowPosition],
  );

  return { onDragOver, onDrop };
}
