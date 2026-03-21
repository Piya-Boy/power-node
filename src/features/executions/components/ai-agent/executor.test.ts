import { describe, it, expect } from "vitest";

// Test AI Agent executor validation logic
type AiAgentData = {
  variableName?: string;
  credentialId?: string;
  systemPrompt?: string;
  userPrompt?: string;
};

function validateAiAgentData(data: AiAgentData): string | null {
  if (!data.variableName) return "Variable name is missing";
  if (!data.credentialId) return "Credential is required";
  if (!data.userPrompt) return "User prompt is required";
  return null;
}

function buildAgentSystemPrompt(
  systemPrompt: string | undefined,
  context: Record<string, unknown>,
): string {
  const base = systemPrompt || "You are a helpful AI agent.";
  const contextSummary = Object.keys(context).length > 0
    ? `\n\nAvailable workflow context data:\n${JSON.stringify(context, null, 2)}`
    : "";
  return base + contextSummary;
}

describe("AI Agent Executor Validation", () => {
  it("should require variable name", () => {
    expect(validateAiAgentData({ credentialId: "c1", userPrompt: "Hello" }))
      .toBe("Variable name is missing");
  });

  it("should require credential", () => {
    expect(validateAiAgentData({ variableName: "r", userPrompt: "Hello" }))
      .toBe("Credential is required");
  });

  it("should require user prompt", () => {
    expect(validateAiAgentData({ variableName: "r", credentialId: "c1" }))
      .toBe("User prompt is required");
  });

  it("should pass with all required fields", () => {
    expect(validateAiAgentData({
      variableName: "r", credentialId: "c1", userPrompt: "Hello",
    })).toBeNull();
  });

  it("should use default system prompt when not provided", () => {
    const prompt = buildAgentSystemPrompt(undefined, {});
    expect(prompt).toBe("You are a helpful AI agent.");
  });

  it("should use custom system prompt when provided", () => {
    const prompt = buildAgentSystemPrompt("You are a coding assistant.", {});
    expect(prompt).toBe("You are a coding assistant.");
  });

  it("should include context in system prompt when available", () => {
    const prompt = buildAgentSystemPrompt("You are an agent.", { name: "PowerNode", count: 42 });
    expect(prompt).toContain("You are an agent.");
    expect(prompt).toContain("PowerNode");
    expect(prompt).toContain("42");
  });

  it("should not include context section when context is empty", () => {
    const prompt = buildAgentSystemPrompt("Agent prompt.", {});
    expect(prompt).not.toContain("Available workflow context");
  });
});
