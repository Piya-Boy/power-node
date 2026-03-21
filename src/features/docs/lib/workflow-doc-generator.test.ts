import { describe, it, expect } from "vitest";
import {
  describeNodeType,
  findTriggerNodes,
  buildExecutionPath,
  categorizeNodes,
  generateWorkflowDoc,
  generateOneLiner,
  type DocNode,
  type DocConnection,
  type DocWorkflow,
} from "./workflow-doc-generator";

const makeNode = (id: string, type: string, name?: string): DocNode => ({
  id,
  name: name ?? `${type} Node`,
  type,
  data: {},
  inputs: ["main"],
  outputs: ["main"],
});

const makeConn = (from: string, to: string): DocConnection => ({
  fromNodeId: from,
  toNodeId: to,
  fromOutput: "main",
  toInput: "main",
});

const makeWorkflow = (overrides: Partial<DocWorkflow> = {}): DocWorkflow => ({
  id: "wf-1",
  name: "Test Workflow",
  description: "A test workflow",
  tags: ["test"],
  nodes: [
    makeNode("n1", "WEBHOOK_TRIGGER", "Webhook"),
    makeNode("n2", "HTTP_REQUEST", "Fetch Data"),
    makeNode("n3", "SLACK", "Notify Slack"),
  ],
  connections: [makeConn("n1", "n2"), makeConn("n2", "n3")],
  isActive: true,
  ...overrides,
});

describe("describeNodeType", () => {
  it("returns description for known types", () => {
    expect(describeNodeType("WEBHOOK_TRIGGER")).toContain("webhook");
    expect(describeNodeType("HTTP_REQUEST")).toContain("HTTP");
    expect(describeNodeType("OPENAI")).toContain("OpenAI");
  });

  it("generates fallback for unknown types", () => {
    const desc = describeNodeType("CUSTOM_NODE");
    expect(typeof desc).toBe("string");
    expect(desc.length).toBeGreaterThan(0);
  });
});

describe("findTriggerNodes", () => {
  it("identifies trigger nodes", () => {
    const nodes = [
      makeNode("n1", "WEBHOOK_TRIGGER"),
      makeNode("n2", "HTTP_REQUEST"),
      makeNode("n3", "MANUAL_TRIGGER"),
    ];
    const triggers = findTriggerNodes(nodes);
    expect(triggers).toHaveLength(2);
    expect(triggers.every((n) => n.type.includes("TRIGGER") || n.type === "INITIAL")).toBe(true);
  });

  it("returns empty for no trigger nodes", () => {
    const nodes = [makeNode("n1", "HTTP_REQUEST"), makeNode("n2", "SLACK")];
    expect(findTriggerNodes(nodes)).toHaveLength(0);
  });
});

describe("buildExecutionPath", () => {
  it("builds linear execution path", () => {
    const nodes = [makeNode("n1", "WEBHOOK_TRIGGER"), makeNode("n2", "HTTP_REQUEST"), makeNode("n3", "SLACK")];
    const conns = [makeConn("n1", "n2"), makeConn("n2", "n3")];
    const paths = buildExecutionPath(nodes, conns);
    expect(paths).toHaveLength(1);
    expect(paths[0].map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
  });

  it("builds branching paths", () => {
    // n1 -> n2, n1 -> n3 (branch)
    const nodes = [makeNode("n1", "WEBHOOK_TRIGGER"), makeNode("n2", "SLACK"), makeNode("n3", "HTTP_REQUEST")];
    const conns = [makeConn("n1", "n2"), makeConn("n1", "n3")];
    const paths = buildExecutionPath(nodes, conns);
    expect(paths).toHaveLength(2);
  });

  it("handles disconnected (isolated) nodes", () => {
    const nodes = [makeNode("n1", "HTTP_REQUEST"), makeNode("n2", "SLACK")]; // no connections, no triggers
    const paths = buildExecutionPath(nodes, []);
    expect(paths.length).toBeGreaterThan(0);
  });
});

describe("categorizeNodes", () => {
  it("categorizes nodes into correct groups", () => {
    const nodes = [
      makeNode("n1", "WEBHOOK_TRIGGER"),
      makeNode("n2", "OPENAI"),
      makeNode("n3", "SLACK"),
      makeNode("n4", "IF"),
      makeNode("n5", "CODE"),
    ];
    const categories = categorizeNodes(nodes);
    expect(categories["Triggers"]).toHaveLength(1);
    expect(categories["AI & LLM"]).toHaveLength(1);
    expect(categories["Integrations"]).toHaveLength(1);
    expect(categories["Logic & Flow"]).toHaveLength(1);
    expect(categories["Data Processing"]).toHaveLength(1);
  });

  it("puts unknown types in Other", () => {
    const nodes = [makeNode("n1", "UNKNOWN_NODE_TYPE")];
    const categories = categorizeNodes(nodes);
    expect(categories["Other"]).toHaveLength(1);
  });
});

describe("generateWorkflowDoc", () => {
  it("generates a document with required fields", () => {
    const doc = generateWorkflowDoc(makeWorkflow());
    expect(doc.title).toBe("Test Workflow");
    expect(doc.summary).toBeTruthy();
    expect(doc.sections.length).toBeGreaterThan(0);
    expect(doc.markdown).toContain("# Test Workflow");
  });

  it("includes overview section", () => {
    const doc = generateWorkflowDoc(makeWorkflow());
    const overviewSection = doc.sections.find((s) => s.heading === "Overview");
    expect(overviewSection).toBeDefined();
    expect(overviewSection?.content).toContain("Nodes:");
  });

  it("includes execution flow section", () => {
    const doc = generateWorkflowDoc(makeWorkflow());
    const flowSection = doc.sections.find((s) => s.heading === "Execution Flow");
    expect(flowSection).toBeDefined();
    expect(flowSection?.content).toContain("Webhook");
  });

  it("includes integration section for integration nodes", () => {
    const doc = generateWorkflowDoc(makeWorkflow());
    const section = doc.sections.find((s) => s.heading === "Integrations");
    expect(section).toBeDefined();
  });

  it("generates valid markdown", () => {
    const doc = generateWorkflowDoc(makeWorkflow());
    expect(doc.markdown).toContain("##");
    expect(doc.markdown.split("\n").length).toBeGreaterThan(5);
  });

  it("handles workflow with no description", () => {
    const wf = makeWorkflow({ description: undefined });
    const doc = generateWorkflowDoc(wf);
    expect(doc.summary).toBeTruthy();
  });

  it("shows inactive status", () => {
    const doc = generateWorkflowDoc(makeWorkflow({ isActive: false }));
    const overview = doc.sections.find((s) => s.heading === "Overview");
    expect(overview?.content).toContain("Inactive");
  });
});

describe("generateOneLiner", () => {
  it("generates a one-liner", () => {
    const wf = makeWorkflow();
    const oneLiner = generateOneLiner(wf);
    expect(typeof oneLiner).toBe("string");
    expect(oneLiner.length).toBeGreaterThan(5);
    expect(oneLiner).toContain("→");
  });

  it("handles workflow with no trigger", () => {
    const wf = makeWorkflow({
      nodes: [makeNode("n1", "HTTP_REQUEST"), makeNode("n2", "SLACK")],
      connections: [makeConn("n1", "n2")],
    });
    const oneLiner = generateOneLiner(wf);
    expect(oneLiner).toContain("Manual");
  });
});
