import { describe, it, expect } from "vitest";

type SummarizationData = {
  variableName?: string;
  credentialId?: string;
  text?: string;
  style?: "brief" | "detailed" | "bullet_points" | "executive";
  maxLength?: number;
  language?: string;
};

function validateSummarizationData(data: SummarizationData): string | null {
  if (!data.variableName) return "Variable name is missing";
  if (!data.credentialId) return "Credential is required";
  if (!data.text) return "Text is required";
  return null;
}

function getStyleInstruction(style: string): string {
  const instructions: Record<string, string> = {
    brief: "Provide a concise summary in 2-3 sentences.",
    detailed: "Provide a comprehensive summary covering all key points.",
    bullet_points: "Summarize the text as bullet points, covering each main topic.",
    executive: "Write an executive summary suitable for leadership review.",
  };
  return instructions[style] || instructions.brief;
}

describe("Summarization Executor", () => {
  it("should require variable name", () => {
    expect(validateSummarizationData({ credentialId: "c1", text: "hello" }))
      .toBe("Variable name is missing");
  });

  it("should require credential", () => {
    expect(validateSummarizationData({ variableName: "r", text: "hello" }))
      .toBe("Credential is required");
  });

  it("should require text", () => {
    expect(validateSummarizationData({ variableName: "r", credentialId: "c1" }))
      .toBe("Text is required");
  });

  it("should pass with all required fields", () => {
    expect(validateSummarizationData({
      variableName: "r", credentialId: "c1", text: "Some long text...",
    })).toBeNull();
  });

  it("should return brief instruction for brief style", () => {
    expect(getStyleInstruction("brief")).toContain("concise");
  });

  it("should return detailed instruction for detailed style", () => {
    expect(getStyleInstruction("detailed")).toContain("comprehensive");
  });

  it("should return bullet points instruction", () => {
    expect(getStyleInstruction("bullet_points")).toContain("bullet points");
  });

  it("should return executive instruction", () => {
    expect(getStyleInstruction("executive")).toContain("executive summary");
  });

  it("should default to brief for unknown style", () => {
    expect(getStyleInstruction("unknown")).toContain("concise");
  });
});
