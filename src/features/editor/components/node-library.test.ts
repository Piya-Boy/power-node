import { describe, expect, it } from "vitest";
import {
  allNodeCatalogOptions,
  filterNodeCatalogOptions,
} from "@/features/editor/lib/node-catalog";
import { NodeType } from "@/generated/prisma";

describe("Node catalog filtering", () => {
  it("should return all nodes when search is empty", () => {
    const result = filterNodeCatalogOptions("", allNodeCatalogOptions);
    expect(result.length).toBe(allNodeCatalogOptions.length);
  });

  it("should filter by node label", () => {
    const result = filterNodeCatalogOptions("OpenAI", allNodeCatalogOptions);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe(NodeType.OPENAI);
  });

  it("should filter by description", () => {
    const result = filterNodeCatalogOptions(
      "HTTP request",
      allNodeCatalogOptions,
    );
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: NodeType.HTTP_REQUEST }),
      ]),
    );
  });

  it("should filter case-insensitively", () => {
    const result = filterNodeCatalogOptions("discord", allNodeCatalogOptions);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe(NodeType.DISCORD);
  });

  it("should return multiple matches", () => {
    const result = filterNodeCatalogOptions("message", allNodeCatalogOptions);
    expect(result.length).toBeGreaterThan(1);
    const types = result.map((n) => n.type);
    expect(types).toContain(NodeType.DISCORD);
    expect(types).toContain(NodeType.SLACK);
  });

  it("should return empty array for no matches", () => {
    const result = filterNodeCatalogOptions(
      "xyznonexistent123",
      allNodeCatalogOptions,
    );
    expect(result.length).toBe(0);
  });

  it("should find nodes by partial label match", () => {
    const result = filterNodeCatalogOptions("IF", allNodeCatalogOptions);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: NodeType.IF_CONDITION }),
      ]),
    );
  });

  it("should categorize nodes correctly", () => {
    const triggers = allNodeCatalogOptions.filter(
      (n) => n.category === "trigger",
    );
    const executions = allNodeCatalogOptions.filter(
      (n) => n.category === "execution",
    );
    const integrations = allNodeCatalogOptions.filter(
      (n) => n.category === "integration",
    );
    const ai = allNodeCatalogOptions.filter((n) => n.category === "ai");
    const logic = allNodeCatalogOptions.filter((n) => n.category === "logic");
    const data = allNodeCatalogOptions.filter((n) => n.category === "data");
    const utility = allNodeCatalogOptions.filter(
      (n) => n.category === "utility",
    );

    expect(triggers.length).toBe(8);
    expect(executions.length).toBe(6);
    expect(integrations.length).toBe(11);
    expect(ai.length).toBe(7);
    expect(logic.length).toBe(9);
    expect(data.length).toBe(9);
    expect(utility.length).toBe(1);
  });

  it("should find Code node by 'javascript' in description", () => {
    const result = filterNodeCatalogOptions(
      "javascript",
      allNodeCatalogOptions,
    );
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: NodeType.CODE }),
      ]),
    );
  });

  it("should find Telegram node", () => {
    const result = filterNodeCatalogOptions("Telegram", allNodeCatalogOptions);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe(NodeType.TELEGRAM);
  });

  it("should find multiple Google integrations", () => {
    const result = filterNodeCatalogOptions("Google", allNodeCatalogOptions);
    expect(result.length).toBeGreaterThanOrEqual(4);
    const types = result.map((n) => n.type);
    expect(types).toContain(NodeType.GOOGLE_SHEETS);
    expect(types).toContain(NodeType.GOOGLE_CALENDAR);
    expect(types).toContain(NodeType.GOOGLE_DRIVE);
  });

  it("should find database nodes by SQL", () => {
    const result = filterNodeCatalogOptions("SQL", allNodeCatalogOptions);
    expect(result.length).toBe(2);
    const types = result.map((n) => n.type);
    expect(types).toContain(NodeType.POSTGRESQL_QUERY);
    expect(types).toContain(NodeType.MYSQL_QUERY);
  });

  it("should find email-related nodes", () => {
    const result = filterNodeCatalogOptions("email", allNodeCatalogOptions);
    expect(result.length).toBeGreaterThanOrEqual(2);
    const types = result.map((n) => n.type);
    expect(types).toContain(NodeType.EMAIL_TRIGGER);
    expect(types).toContain(NodeType.EMAIL_SMTP);
    expect(types).toContain(NodeType.GMAIL);
  });

  it("should find GitHub by searching repos", () => {
    const result = filterNodeCatalogOptions("repos", allNodeCatalogOptions);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: NodeType.GITHUB }),
      ]),
    );
  });

  it("should find AI nodes by sentiment", () => {
    const result = filterNodeCatalogOptions("sentiment", allNodeCatalogOptions);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe(NodeType.SENTIMENT_ANALYSIS);
  });

  it("should find Ollama node by LLM", () => {
    const result = filterNodeCatalogOptions("LLM", allNodeCatalogOptions);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: NodeType.OLLAMA }),
      ]),
    );
  });

  it("should find AI Agent node", () => {
    const result = filterNodeCatalogOptions("AI Agent", allNodeCatalogOptions);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].type).toBe(NodeType.AI_AGENT);
  });

  it("should find summarize node", () => {
    const result = filterNodeCatalogOptions("Summarize", allNodeCatalogOptions);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const types = result.map((n) => n.type);
    expect(types).toContain(NodeType.SUMMARIZATION);
  });
});
