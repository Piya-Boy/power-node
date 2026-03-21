import type { WorkflowExport } from "./export-import";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: "automation" | "ai" | "integration" | "data";
  icon: string;
  workflow: WorkflowExport;
}

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: "webhook-to-slack",
    name: "Webhook to Slack",
    description: "Receive a webhook and send a notification to Slack",
    category: "automation",
    icon: "🔔",
    workflow: {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      workflow: {
        name: "Webhook to Slack",
        description: "Receive a webhook and send a notification to Slack",
        tags: ["webhook", "slack", "notification"],
      },
      nodes: [
        {
          id: "node_1",
          type: "WEBHOOK_TRIGGER",
          name: "Webhook Trigger",
          position: { x: 100, y: 200 },
          data: { variableName: "webhook" },
        },
        {
          id: "node_2",
          type: "SLACK",
          name: "Send to Slack",
          position: { x: 400, y: 200 },
          data: {
            variableName: "slack",
            text: "New webhook received: {{webhook.body}}",
          },
        },
      ],
      connections: [
        { fromNodeId: "node_1", toNodeId: "node_2", fromOutput: "main", toInput: "main" },
      ],
    },
  },
  {
    id: "ai-content-generator",
    name: "AI Content Generator",
    description: "Generate content with AI and send via email",
    category: "ai",
    icon: "✨",
    workflow: {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      workflow: {
        name: "AI Content Generator",
        description: "Generate content using OpenAI and send it via email",
        tags: ["ai", "openai", "email", "content"],
      },
      nodes: [
        {
          id: "node_1",
          type: "MANUAL_TRIGGER",
          name: "Manual Trigger",
          position: { x: 100, y: 200 },
          data: { variableName: "trigger" },
        },
        {
          id: "node_2",
          type: "OPENAI",
          name: "Generate Content",
          position: { x: 400, y: 200 },
          data: {
            variableName: "ai",
            systemPrompt: "You are a helpful content writer.",
            userPrompt: "Write a short blog post about productivity tips.",
          },
        },
        {
          id: "node_3",
          type: "EMAIL_SMTP",
          name: "Send Email",
          position: { x: 700, y: 200 },
          data: {
            variableName: "email",
            subject: "Generated Content",
            body: "{{ai.text}}",
          },
        },
      ],
      connections: [
        { fromNodeId: "node_1", toNodeId: "node_2", fromOutput: "main", toInput: "main" },
        { fromNodeId: "node_2", toNodeId: "node_3", fromOutput: "main", toInput: "main" },
      ],
    },
  },
  {
    id: "github-issue-tracker",
    name: "GitHub Issue Tracker",
    description: "Monitor GitHub issues and send notifications to Discord",
    category: "integration",
    icon: "🐙",
    workflow: {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      workflow: {
        name: "GitHub Issue Tracker",
        description: "Periodically check for new GitHub issues and notify via Discord",
        tags: ["github", "discord", "monitoring"],
      },
      nodes: [
        {
          id: "node_1",
          type: "SCHEDULE_TRIGGER",
          name: "Every Hour",
          position: { x: 100, y: 200 },
          data: { variableName: "schedule", cron: "0 * * * *" },
        },
        {
          id: "node_2",
          type: "GITHUB",
          name: "List Issues",
          position: { x: 400, y: 200 },
          data: {
            variableName: "issues",
            operation: "list_issues",
            owner: "your-org",
            repo: "your-repo",
          },
        },
        {
          id: "node_3",
          type: "DISCORD",
          name: "Notify Discord",
          position: { x: 700, y: 200 },
          data: {
            variableName: "discord",
            content: "📋 New issues found: {{issues.data.length}} issues",
          },
        },
      ],
      connections: [
        { fromNodeId: "node_1", toNodeId: "node_2", fromOutput: "main", toInput: "main" },
        { fromNodeId: "node_2", toNodeId: "node_3", fromOutput: "main", toInput: "main" },
      ],
    },
  },
  {
    id: "data-etl-pipeline",
    name: "Data ETL Pipeline",
    description: "Extract data via HTTP, transform with code, load to database",
    category: "data",
    icon: "📊",
    workflow: {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      workflow: {
        name: "Data ETL Pipeline",
        description: "Extract, transform, and load data from API to database",
        tags: ["etl", "data", "api", "database"],
      },
      nodes: [
        {
          id: "node_1",
          type: "SCHEDULE_TRIGGER",
          name: "Daily Schedule",
          position: { x: 100, y: 200 },
          data: { variableName: "schedule", cron: "0 0 * * *" },
        },
        {
          id: "node_2",
          type: "HTTP_REQUEST",
          name: "Fetch Data",
          position: { x: 350, y: 200 },
          data: {
            variableName: "rawData",
            method: "GET",
            endpoint: "https://api.example.com/data",
          },
        },
        {
          id: "node_3",
          type: "CODE",
          name: "Transform",
          position: { x: 600, y: 200 },
          data: {
            variableName: "transformed",
            language: "javascript",
            code: "return context.rawData.items.map(item => ({ id: item.id, value: item.value }));",
          },
        },
        {
          id: "node_4",
          type: "POSTGRESQL_QUERY",
          name: "Load to DB",
          position: { x: 850, y: 200 },
          data: {
            variableName: "dbResult",
            query: "INSERT INTO data_table (id, value) VALUES ($1, $2)",
          },
        },
      ],
      connections: [
        { fromNodeId: "node_1", toNodeId: "node_2", fromOutput: "main", toInput: "main" },
        { fromNodeId: "node_2", toNodeId: "node_3", fromOutput: "main", toInput: "main" },
        { fromNodeId: "node_3", toNodeId: "node_4", fromOutput: "main", toInput: "main" },
      ],
    },
  },
  {
    id: "sentiment-monitor",
    name: "Sentiment Monitor",
    description: "Analyze text sentiment and route based on results",
    category: "ai",
    icon: "🧠",
    workflow: {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      workflow: {
        name: "Sentiment Monitor",
        description: "Analyze sentiment of incoming messages and route responses",
        tags: ["ai", "sentiment", "routing"],
      },
      nodes: [
        {
          id: "node_1",
          type: "WEBHOOK_TRIGGER",
          name: "Receive Feedback",
          position: { x: 100, y: 200 },
          data: { variableName: "webhook" },
        },
        {
          id: "node_2",
          type: "SENTIMENT_ANALYSIS",
          name: "Analyze Sentiment",
          position: { x: 400, y: 200 },
          data: {
            variableName: "sentiment",
            text: "{{webhook.body.message}}",
          },
        },
        {
          id: "node_3",
          type: "IF_CONDITION",
          name: "Is Negative?",
          position: { x: 700, y: 200 },
          data: {
            variableName: "check",
            field: "sentiment.sentiment",
            operator: "equals",
            value: "negative",
          },
        },
        {
          id: "node_4",
          type: "TELEGRAM",
          name: "Alert Team",
          position: { x: 1000, y: 100 },
          data: {
            variableName: "telegram",
            message: "⚠️ Negative feedback: {{webhook.body.message}}",
          },
        },
      ],
      connections: [
        { fromNodeId: "node_1", toNodeId: "node_2", fromOutput: "main", toInput: "main" },
        { fromNodeId: "node_2", toNodeId: "node_3", fromOutput: "main", toInput: "main" },
        { fromNodeId: "node_3", toNodeId: "node_4", fromOutput: "true", toInput: "main" },
      ],
    },
  },
];

export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return workflowTemplates.find((t) => t.id === id);
}

export function getTemplatesByCategory(category: WorkflowTemplate["category"]): WorkflowTemplate[] {
  return workflowTemplates.filter((t) => t.category === category);
}
