import { describe, it, expect } from "vitest";
import { NodeType } from "@/generated/prisma";

// Test the node data/filtering logic without React rendering
type NodeTypeOption = {
  type: NodeType;
  label: string;
  description: string;
  category: "trigger" | "execution" | "logic" | "data" | "utility" | "integration" | "ai";
};

// Mirror the data from node-library.tsx for testing
const triggerNodes: NodeTypeOption[] = [
  { type: NodeType.MANUAL_TRIGGER, label: "Trigger manually", description: "Runs the flow on clicking a button", category: "trigger" },
  { type: NodeType.GOOGLE_FORM_TRIGGER, label: "Google Form", description: "Runs when a Google Form is submitted", category: "trigger" },
  { type: NodeType.STRIPE_TRIGGER, label: "Stripe Event", description: "Runs when a Stripe Event is captured", category: "trigger" },
  { type: NodeType.WEBHOOK_TRIGGER, label: "Webhook", description: "Receives HTTP webhook requests", category: "trigger" },
  { type: NodeType.SCHEDULE_TRIGGER, label: "Schedule", description: "Runs on a cron schedule", category: "trigger" },
  { type: NodeType.CHAT_TRIGGER, label: "Chat", description: "Runs when a chat message is received", category: "trigger" },
];

const executionNodes: NodeTypeOption[] = [
  { type: NodeType.HTTP_REQUEST, label: "HTTP Request", description: "Makes an HTTP request", category: "execution" },
  { type: NodeType.OPENAI, label: "OpenAI", description: "Uses OpenAI to generate text", category: "execution" },
  { type: NodeType.ANTHROPIC, label: "Anthropic", description: "Uses Anthropic to generate text", category: "execution" },
  { type: NodeType.DISCORD, label: "Discord", description: "Send a message to Discord", category: "execution" },
  { type: NodeType.SLACK, label: "Slack", description: "Send a message to Slack", category: "execution" },
];

const integrationNodes: NodeTypeOption[] = [
  { type: NodeType.TELEGRAM, label: "Telegram", description: "Send messages via Telegram Bot", category: "integration" },
  { type: NodeType.EMAIL_SMTP, label: "Email (SMTP)", description: "Send emails via SMTP", category: "integration" },
  { type: NodeType.NOTION, label: "Notion", description: "Read/write Notion databases", category: "integration" },
  { type: NodeType.GOOGLE_SHEETS, label: "Google Sheets", description: "Read/write Google Sheets", category: "integration" },
  { type: NodeType.GOOGLE_CALENDAR, label: "Google Calendar", description: "Manage Google Calendar events", category: "integration" },
  { type: NodeType.GOOGLE_DRIVE, label: "Google Drive", description: "Manage Google Drive files", category: "integration" },
  { type: NodeType.GMAIL, label: "Gmail", description: "Send/read emails via Gmail", category: "integration" },
  { type: NodeType.GITHUB, label: "GitHub", description: "Manage repos, issues, PRs", category: "integration" },
  { type: NodeType.GRAPHQL, label: "GraphQL", description: "Execute GraphQL queries", category: "integration" },
  { type: NodeType.POSTGRESQL_QUERY, label: "PostgreSQL", description: "Execute SQL on PostgreSQL", category: "integration" },
  { type: NodeType.MYSQL_QUERY, label: "MySQL", description: "Execute SQL on MySQL", category: "integration" },
];

const aiNodes: NodeTypeOption[] = [
  { type: NodeType.AI_AGENT, label: "AI Agent", description: "AI agent with tool use", category: "ai" },
  { type: NodeType.OLLAMA, label: "Ollama", description: "Run local LLMs (Llama, Mistral)", category: "ai" },
  { type: NodeType.TEXT_CLASSIFIER, label: "Text Classifier", description: "Classify text into categories", category: "ai" },
  { type: NodeType.SENTIMENT_ANALYSIS, label: "Sentiment Analysis", description: "Analyze text sentiment", category: "ai" },
  { type: NodeType.INFORMATION_EXTRACTOR, label: "Info Extractor", description: "Extract structured data from text", category: "ai" },
  { type: NodeType.AI_TRANSFORM, label: "AI Transform", description: "Transform data with AI", category: "ai" },
  { type: NodeType.SUMMARIZATION, label: "Summarize", description: "Summarize text automatically", category: "ai" },
];

const logicNodes: NodeTypeOption[] = [
  { type: NodeType.IF_CONDITION, label: "IF Condition", description: "Branch based on a condition", category: "logic" },
  { type: NodeType.SWITCH, label: "Switch", description: "Route based on value", category: "logic" },
  { type: NodeType.FILTER, label: "Filter", description: "Filter items by condition", category: "logic" },
  { type: NodeType.LOOP, label: "Loop", description: "Iterate over items", category: "logic" },
];

const dataNodes: NodeTypeOption[] = [
  { type: NodeType.CODE, label: "Code", description: "Run custom JavaScript", category: "data" },
  { type: NodeType.TRANSFORM, label: "Transform", description: "Transform data structure", category: "data" },
  { type: NodeType.SORT, label: "Sort", description: "Sort items", category: "data" },
];

const utilityNodes: NodeTypeOption[] = [
  { type: NodeType.STICKY_NOTE, label: "Sticky Note", description: "Add a note or comment to the canvas", category: "utility" },
];

const allNodes = [...triggerNodes, ...executionNodes, ...integrationNodes, ...aiNodes, ...logicNodes, ...dataNodes, ...utilityNodes];

function filterNodes(search: string): NodeTypeOption[] {
  if (!search) return allNodes;
  return allNodes.filter(
    (n) =>
      n.label.toLowerCase().includes(search.toLowerCase()) ||
      n.description.toLowerCase().includes(search.toLowerCase()),
  );
}

describe("Node Library Filtering", () => {
  it("should return all nodes when search is empty", () => {
    const result = filterNodes("");
    expect(result.length).toBe(allNodes.length);
  });

  it("should filter by node label", () => {
    const result = filterNodes("OpenAI");
    expect(result.length).toBe(1);
    expect(result[0].type).toBe(NodeType.OPENAI);
  });

  it("should filter by description", () => {
    const result = filterNodes("HTTP request");
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: NodeType.HTTP_REQUEST }),
      ]),
    );
  });

  it("should filter case-insensitively", () => {
    const result = filterNodes("discord");
    expect(result.length).toBe(1);
    expect(result[0].type).toBe(NodeType.DISCORD);
  });

  it("should return multiple matches", () => {
    const result = filterNodes("message");
    expect(result.length).toBeGreaterThan(1);
    const types = result.map((n) => n.type);
    expect(types).toContain(NodeType.DISCORD);
    expect(types).toContain(NodeType.SLACK);
  });

  it("should return empty array for no matches", () => {
    const result = filterNodes("xyznonexistent123");
    expect(result.length).toBe(0);
  });

  it("should find nodes by partial label match", () => {
    const result = filterNodes("IF");
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: NodeType.IF_CONDITION }),
      ]),
    );
  });

  it("should categorize nodes correctly", () => {
    const triggers = allNodes.filter((n) => n.category === "trigger");
    const executions = allNodes.filter((n) => n.category === "execution");
    const integrations = allNodes.filter((n) => n.category === "integration");
    const ai = allNodes.filter((n) => n.category === "ai");
    const logic = allNodes.filter((n) => n.category === "logic");
    const data = allNodes.filter((n) => n.category === "data");
    const utility = allNodes.filter((n) => n.category === "utility");

    expect(triggers.length).toBe(6);
    expect(executions.length).toBe(5);
    expect(integrations.length).toBe(11);
    expect(ai.length).toBe(7);
    expect(logic.length).toBe(4);
    expect(data.length).toBe(3);
    expect(utility.length).toBe(1);
  });

  it("should find Code node by 'javascript' in description", () => {
    const result = filterNodes("javascript");
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: NodeType.CODE }),
      ]),
    );
  });

  // Phase 3 Integration tests
  it("should find Telegram node", () => {
    const result = filterNodes("Telegram");
    expect(result.length).toBe(1);
    expect(result[0].type).toBe(NodeType.TELEGRAM);
  });

  it("should find multiple Google integrations", () => {
    const result = filterNodes("Google");
    expect(result.length).toBeGreaterThanOrEqual(4);
    const types = result.map((n) => n.type);
    expect(types).toContain(NodeType.GOOGLE_SHEETS);
    expect(types).toContain(NodeType.GOOGLE_CALENDAR);
    expect(types).toContain(NodeType.GOOGLE_DRIVE);
  });

  it("should find database nodes by SQL", () => {
    const result = filterNodes("SQL");
    expect(result.length).toBe(2);
    const types = result.map((n) => n.type);
    expect(types).toContain(NodeType.POSTGRESQL_QUERY);
    expect(types).toContain(NodeType.MYSQL_QUERY);
  });

  it("should find email-related nodes", () => {
    const result = filterNodes("email");
    expect(result.length).toBeGreaterThanOrEqual(2);
    const types = result.map((n) => n.type);
    expect(types).toContain(NodeType.EMAIL_SMTP);
    expect(types).toContain(NodeType.GMAIL);
  });

  it("should find GitHub by searching repos", () => {
    const result = filterNodes("repos");
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: NodeType.GITHUB }),
      ]),
    );
  });

  // Phase 4 AI tests
  it("should find AI nodes by sentiment", () => {
    const result = filterNodes("sentiment");
    expect(result.length).toBe(1);
    expect(result[0].type).toBe(NodeType.SENTIMENT_ANALYSIS);
  });

  it("should find Ollama node by LLM", () => {
    const result = filterNodes("LLM");
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: NodeType.OLLAMA }),
      ]),
    );
  });

  it("should find AI Agent node", () => {
    const result = filterNodes("AI Agent");
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].type).toBe(NodeType.AI_AGENT);
  });

  it("should find summarize node", () => {
    const result = filterNodes("Summarize");
    expect(result.length).toBeGreaterThanOrEqual(1);
    const types = result.map((n) => n.type);
    expect(types).toContain(NodeType.SUMMARIZATION);
  });
});
