/**
 * Phase 33 — Workflow Documentation Generator
 * Generate human-readable documentation from workflow structure.
 */

export interface DocNode {
  id: string;
  name: string;
  type: string;
  data: Record<string, unknown>;
  inputs: string[];
  outputs: string[];
}

export interface DocConnection {
  fromNodeId: string;
  toNodeId: string;
  fromOutput: string;
  toInput: string;
}

export interface DocWorkflow {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  nodes: DocNode[];
  connections: DocConnection[];
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface GeneratedDoc {
  title: string;
  summary: string;
  sections: DocSection[];
  markdown: string;
}

export interface DocSection {
  heading: string;
  content: string;
}

// Simple node type descriptions for documentation
const NODE_TYPE_DESCRIPTIONS: Record<string, string> = {
  INITIAL: "Starting point of the workflow",
  MANUAL_TRIGGER: "Manually triggered by user action",
  WEBHOOK_TRIGGER: "Triggered by an incoming HTTP webhook",
  SCHEDULE_TRIGGER: "Runs automatically on a schedule",
  HTTP_REQUEST: "Makes an HTTP request to an external API",
  CODE: "Executes custom JavaScript code",
  IF: "Branches flow based on a condition",
  SWITCH: "Routes flow to different paths based on value",
  FILTER: "Filters items based on a condition",
  LOOP: "Iterates over a list of items",
  MERGE: "Combines outputs from multiple branches",
  SPLIT: "Splits a single input into multiple items",
  WAIT: "Pauses execution for a specified duration",
  STOP_ERROR: "Stops workflow with an error message",
  SUB_WORKFLOW: "Calls another workflow as a subroutine",
  TRANSFORM: "Transforms data structure",
  AGGREGATE: "Aggregates multiple items into one",
  SORT: "Sorts items by a key",
  REMOVE_DUPLICATES: "Removes duplicate items",
  DATE_TIME: "Processes date/time values",
  CRYPTO: "Performs cryptographic operations",
  OPENAI: "Calls OpenAI GPT models",
  ANTHROPIC: "Calls Anthropic Claude models",
  GEMINI: "Calls Google Gemini models",
  OLLAMA: "Runs a local LLM via Ollama",
  AI_AGENT: "AI agent with context awareness",
  TEXT_CLASSIFIER: "Classifies text into categories",
  SENTIMENT_ANALYSIS: "Analyzes sentiment of text",
  INFORMATION_EXTRACTOR: "Extracts structured data from text",
  AI_TRANSFORM: "Transforms data using AI",
  SUMMARIZATION: "Summarizes text content",
  SLACK: "Sends a message to Slack",
  EMAIL_SMTP: "Sends an email via SMTP",
  TELEGRAM: "Sends a Telegram message",
  DISCORD: "Sends a Discord message",
  GITHUB: "Interacts with GitHub API",
  NOTION: "Reads/writes Notion database",
  GOOGLE_SHEETS: "Reads/writes Google Sheets",
  GOOGLE_CALENDAR: "Manages Google Calendar events",
  GOOGLE_DRIVE: "Accesses Google Drive files",
  GMAIL: "Reads/sends Gmail messages",
  POSTGRESQL_QUERY: "Queries a PostgreSQL database",
  MYSQL_QUERY: "Queries a MySQL database",
  GRAPHQL: "Executes a GraphQL query",
};

/**
 * Get a human-readable description for a node type.
 */
export function describeNodeType(type: string): string {
  return NODE_TYPE_DESCRIPTIONS[type] ?? `${type.replace(/_/g, " ").toLowerCase()} node`;
}

/**
 * Find the trigger node(s) in a workflow.
 */
export function findTriggerNodes(nodes: DocNode[]): DocNode[] {
  const triggerTypes = new Set([
    "INITIAL", "MANUAL_TRIGGER", "WEBHOOK_TRIGGER", "SCHEDULE_TRIGGER",
    "GOOGLE_FORM_TRIGGER", "STRIPE_TRIGGER", "CHAT_TRIGGER",
  ]);
  return nodes.filter((n) => triggerTypes.has(n.type));
}

/**
 * Build an ordered execution path from triggers to leaves (simple DFS).
 */
export function buildExecutionPath(
  nodes: DocNode[],
  connections: DocConnection[]
): DocNode[][] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, string[]>();
  for (const conn of connections) {
    if (!outgoing.has(conn.fromNodeId)) outgoing.set(conn.fromNodeId, []);
    outgoing.get(conn.fromNodeId)!.push(conn.toNodeId);
  }

  const triggers = findTriggerNodes(nodes);
  const paths: DocNode[][] = [];

  const dfs = (nodeId: string, path: DocNode[], visited: Set<string>): void => {
    if (visited.has(nodeId)) return;
    const node = nodeMap.get(nodeId);
    if (!node) return;

    path.push(node);
    visited.add(nodeId);

    const nexts = outgoing.get(nodeId) ?? [];
    if (nexts.length === 0) {
      paths.push([...path]);
    } else {
      for (const next of nexts) {
        dfs(next, path, new Set(visited));
      }
    }
    path.pop();
  };

  for (const trigger of triggers) {
    dfs(trigger.id, [], new Set());
  }

  // Also handle isolated nodes not connected to any trigger
  if (paths.length === 0) {
    const connected = new Set(connections.flatMap((c) => [c.fromNodeId, c.toNodeId]));
    const isolated = nodes.filter((n) => !connected.has(n.id));
    isolated.forEach((n) => paths.push([n]));
  }

  return paths;
}

/**
 * Categorize nodes in the workflow.
 */
export function categorizeNodes(nodes: DocNode[]): Record<string, DocNode[]> {
  const categories: Record<string, DocNode[]> = {
    "Triggers": [],
    "AI & LLM": [],
    "Integrations": [],
    "Logic & Flow": [],
    "Data Processing": [],
    "Other": [],
  };

  const TRIGGER_TYPES = new Set(["INITIAL", "MANUAL_TRIGGER", "WEBHOOK_TRIGGER", "SCHEDULE_TRIGGER", "GOOGLE_FORM_TRIGGER", "STRIPE_TRIGGER", "CHAT_TRIGGER"]);
  const AI_TYPES = new Set(["OPENAI", "ANTHROPIC", "GEMINI", "OLLAMA", "AI_AGENT", "TEXT_CLASSIFIER", "SENTIMENT_ANALYSIS", "INFORMATION_EXTRACTOR", "AI_TRANSFORM", "SUMMARIZATION"]);
  const INTEGRATION_TYPES = new Set(["HTTP_REQUEST", "SLACK", "EMAIL_SMTP", "TELEGRAM", "DISCORD", "GITHUB", "NOTION", "GOOGLE_SHEETS", "GOOGLE_CALENDAR", "GOOGLE_DRIVE", "GMAIL", "POSTGRESQL_QUERY", "MYSQL_QUERY", "GRAPHQL"]);
  const LOGIC_TYPES = new Set(["IF", "SWITCH", "FILTER", "LOOP", "MERGE", "SPLIT", "WAIT", "STOP_ERROR", "SUB_WORKFLOW"]);
  const DATA_TYPES = new Set(["CODE", "TRANSFORM", "AGGREGATE", "SORT", "REMOVE_DUPLICATES", "DATE_TIME", "CRYPTO", "MARKDOWN_HTML", "COMPRESS"]);

  for (const node of nodes) {
    if (TRIGGER_TYPES.has(node.type)) categories["Triggers"].push(node);
    else if (AI_TYPES.has(node.type)) categories["AI & LLM"].push(node);
    else if (INTEGRATION_TYPES.has(node.type)) categories["Integrations"].push(node);
    else if (LOGIC_TYPES.has(node.type)) categories["Logic & Flow"].push(node);
    else if (DATA_TYPES.has(node.type)) categories["Data Processing"].push(node);
    else categories["Other"].push(node);
  }

  return categories;
}

/**
 * Generate Markdown documentation for a workflow.
 */
export function generateWorkflowDoc(workflow: DocWorkflow): GeneratedDoc {
  const sections: DocSection[] = [];
  const triggers = findTriggerNodes(workflow.nodes);
  const categories = categorizeNodes(workflow.nodes);

  // Summary section
  const triggerDesc = triggers.length > 0
    ? triggers.map((t) => describeNodeType(t.type)).join(", ")
    : "No trigger configured";

  const summary = `${workflow.description ?? "Workflow with " + workflow.nodes.length + " nodes."} Triggered by: ${triggerDesc}.`;

  // Overview section
  const overviewLines = [
    `- **Nodes:** ${workflow.nodes.length}`,
    `- **Connections:** ${workflow.connections.length}`,
    `- **Status:** ${workflow.isActive ? "Active" : "Inactive"}`,
    workflow.tags && workflow.tags.length > 0 ? `- **Tags:** ${workflow.tags.join(", ")}` : null,
    workflow.createdAt ? `- **Created:** ${workflow.createdAt.toDateString()}` : null,
    workflow.updatedAt ? `- **Last Updated:** ${workflow.updatedAt.toDateString()}` : null,
  ].filter(Boolean).join("\n");

  sections.push({ heading: "Overview", content: overviewLines });

  // Node inventory by category
  for (const [category, nodes] of Object.entries(categories)) {
    if (nodes.length === 0) continue;
    const lines = nodes.map((n) => `- **${n.name}** (${n.type}): ${describeNodeType(n.type)}`).join("\n");
    sections.push({ heading: category, content: lines });
  }

  // Execution flow
  const paths = buildExecutionPath(workflow.nodes, workflow.connections);
  if (paths.length > 0) {
    const flowLines = paths.map((path, i) => {
      const pathStr = path.map((n) => `\`${n.name}\``).join(" → ");
      return paths.length > 1 ? `**Path ${i + 1}:** ${pathStr}` : pathStr;
    }).join("\n\n");
    sections.push({ heading: "Execution Flow", content: flowLines });
  }

  // Build full Markdown
  const markdownParts = [
    `# ${workflow.name}`,
    "",
    summary,
    "",
    ...sections.flatMap((s) => [`## ${s.heading}`, "", s.content, ""]),
  ];

  return {
    title: workflow.name,
    summary,
    sections,
    markdown: markdownParts.join("\n"),
  };
}

/**
 * Generate a brief one-line description of a workflow.
 */
export function generateOneLiner(workflow: DocWorkflow): string {
  const triggers = findTriggerNodes(workflow.nodes);
  const triggerStr = triggers.length > 0 ? describeNodeType(triggers[0].type) : "Manual";

  const nodeTypes = [...new Set(workflow.nodes.filter((n) => !findTriggerNodes([n]).length).map((n) => n.type))];
  const actions = nodeTypes.slice(0, 3).map((t) => t.replace(/_/g, " ").toLowerCase());

  return `${triggerStr} → ${actions.join(", ")}${nodeTypes.length > 3 ? ` and ${nodeTypes.length - 3} more` : ""}`;
}
