import { describe, it, expect } from "vitest";
import {
  createMeta,
  buildContext,
  getInput,
  getInputsFromNode,
  hasInput,
  addInput,
  getVariable,
  setVariable,
  mergeVariables,
  getSecret,
  getSecretValue,
  hasAllSecrets,
  addSecret,
  redactSecrets,
  getPreviousOutput,
  setPreviousOutput,
  isTimedOut,
  getRemainingTimeMs,
  validateContext,
  summarizeContext,
  forkContext,
  mergeContexts,
  type NodeExecutionContext,
  type ExecutionMeta,
  type SecretRef,
} from "./execution-context";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeMeta(overrides: Partial<ExecutionMeta> = {}): ExecutionMeta {
  return createMeta({ executionId: "exec1", workflowId: "wf1", ...overrides });
}

function makeCtx(overrides: Partial<NodeExecutionContext> = {}): NodeExecutionContext {
  return buildContext(makeMeta(), "node1", "http-request", overrides);
}

function makeSecret(key: string, value = "secret-value", status: SecretRef["status"] = "resolved"): SecretRef {
  return { key, value, status };
}

// ─────────────────────────────────────────────────────────────────────────────
// createMeta
// ─────────────────────────────────────────────────────────────────────────────

describe("createMeta", () => {
  it("creates meta with defaults", () => {
    const meta = createMeta({ executionId: "e1", workflowId: "w1" });
    expect(meta.runNumber).toBe(1);
    expect(meta.triggeredBy).toBe("manual");
    expect(meta.retryAttempt).toBe(0);
    expect(meta.isDryRun).toBe(false);
    expect(meta.tags).toEqual([]);
  });

  it("overrides defaults", () => {
    const meta = createMeta({ executionId: "e1", workflowId: "w1", isDryRun: true, triggeredBy: "schedule" });
    expect(meta.isDryRun).toBe(true);
    expect(meta.triggeredBy).toBe("schedule");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildContext
// ─────────────────────────────────────────────────────────────────────────────

describe("buildContext", () => {
  it("builds a context with defaults", () => {
    const ctx = makeCtx();
    expect(ctx.nodeId).toBe("node1");
    expect(ctx.nodeType).toBe("http-request");
    expect(ctx.inputs).toHaveLength(0);
    expect(ctx.variables).toEqual({});
    expect(ctx.secrets).toHaveLength(0);
    expect(ctx.scope).toBe("node");
  });

  it("accepts overrides", () => {
    const ctx = buildContext(makeMeta(), "n2", "transform", {
      scope: "workflow",
      variables: { env: "production" },
    });
    expect(ctx.scope).toBe("workflow");
    expect(ctx.variables.env).toBe("production");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Input Helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("getInput", () => {
  it("returns input data for a known port", () => {
    const ctx = makeCtx({ inputs: [{ nodeId: "prev", portId: "body", data: { x: 1 } }] });
    expect(getInput(ctx, "body")).toEqual({ x: 1 });
  });

  it("returns undefined for unknown port", () => {
    expect(getInput(makeCtx(), "missing")).toBeUndefined();
  });
});

describe("getInputsFromNode", () => {
  it("returns all inputs from a node", () => {
    const ctx = makeCtx({
      inputs: [
        { nodeId: "n1", portId: "a", data: 1 },
        { nodeId: "n2", portId: "b", data: 2 },
        { nodeId: "n1", portId: "c", data: 3 },
      ],
    });
    const inputs = getInputsFromNode(ctx, "n1");
    expect(inputs).toHaveLength(2);
    expect(inputs.map((i) => i.portId)).toEqual(["a", "c"]);
  });
});

describe("hasInput", () => {
  it("returns true when port has data", () => {
    const ctx = makeCtx({ inputs: [{ nodeId: "n1", portId: "x", data: 42 }] });
    expect(hasInput(ctx, "x")).toBe(true);
  });

  it("returns false for null data", () => {
    const ctx = makeCtx({ inputs: [{ nodeId: "n1", portId: "x", data: null }] });
    expect(hasInput(ctx, "x")).toBe(false);
  });

  it("returns false when port missing", () => {
    expect(hasInput(makeCtx(), "x")).toBe(false);
  });
});

describe("addInput", () => {
  it("adds an input without mutating original", () => {
    const ctx = makeCtx();
    const updated = addInput(ctx, { nodeId: "n1", portId: "p", data: "hi" });
    expect(updated.inputs).toHaveLength(1);
    expect(ctx.inputs).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Variable Helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("getVariable", () => {
  it("gets top-level variable", () => {
    const ctx = makeCtx({ variables: { env: "prod" } });
    expect(getVariable(ctx, "env")).toBe("prod");
  });

  it("supports dot-notation path", () => {
    const ctx = makeCtx({ variables: { user: { name: "Alice", role: "admin" } } });
    expect(getVariable(ctx, "user.name")).toBe("Alice");
    expect(getVariable(ctx, "user.role")).toBe("admin");
  });

  it("returns undefined for missing key", () => {
    expect(getVariable(makeCtx(), "missing")).toBeUndefined();
  });

  it("returns undefined for deep missing path", () => {
    const ctx = makeCtx({ variables: { user: { name: "Alice" } } });
    expect(getVariable(ctx, "user.address.city")).toBeUndefined();
  });
});

describe("setVariable", () => {
  it("sets a variable without mutation", () => {
    const ctx = makeCtx();
    const updated = setVariable(ctx, "foo", "bar");
    expect(updated.variables.foo).toBe("bar");
    expect(ctx.variables.foo).toBeUndefined();
  });

  it("overwrites existing variable", () => {
    const ctx = makeCtx({ variables: { x: 1 } });
    const updated = setVariable(ctx, "x", 99);
    expect(updated.variables.x).toBe(99);
  });
});

describe("mergeVariables", () => {
  it("merges multiple maps with later maps winning", () => {
    const ctx = makeCtx({ variables: { a: 1, b: 2 } });
    const updated = mergeVariables(ctx, { b: 99, c: 3 });
    expect(updated.variables).toEqual({ a: 1, b: 99, c: 3 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Secret Helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("getSecret", () => {
  it("returns secret ref by key", () => {
    const ctx = makeCtx({ secrets: [makeSecret("API_KEY")] });
    expect(getSecret(ctx, "API_KEY")?.key).toBe("API_KEY");
  });

  it("returns undefined for missing key", () => {
    expect(getSecret(makeCtx(), "X")).toBeUndefined();
  });
});

describe("getSecretValue", () => {
  it("returns value for resolved secret", () => {
    const ctx = makeCtx({ secrets: [makeSecret("TOKEN", "abc123")] });
    expect(getSecretValue(ctx, "TOKEN")).toBe("abc123");
  });

  it("returns undefined for missing secret", () => {
    const ctx = makeCtx({ secrets: [makeSecret("TOKEN", "", "missing")] });
    expect(getSecretValue(ctx, "TOKEN")).toBeUndefined();
  });

  it("returns undefined for redacted secret", () => {
    const ctx = makeCtx({ secrets: [makeSecret("TOKEN", "***", "redacted")] });
    expect(getSecretValue(ctx, "TOKEN")).toBeUndefined();
  });
});

describe("hasAllSecrets", () => {
  it("returns true when all secrets resolved", () => {
    const ctx = makeCtx({ secrets: [makeSecret("A"), makeSecret("B")] });
    expect(hasAllSecrets(ctx, ["A", "B"])).toBe(true);
  });

  it("returns false if any secret missing", () => {
    const ctx = makeCtx({ secrets: [makeSecret("A"), makeSecret("B", "", "missing")] });
    expect(hasAllSecrets(ctx, ["A", "B"])).toBe(false);
  });
});

describe("addSecret", () => {
  it("adds a new secret", () => {
    const ctx = makeCtx();
    const updated = addSecret(ctx, makeSecret("KEY"));
    expect(updated.secrets).toHaveLength(1);
  });

  it("replaces existing secret with same key", () => {
    const ctx = makeCtx({ secrets: [makeSecret("KEY", "old")] });
    const updated = addSecret(ctx, makeSecret("KEY", "new"));
    expect(updated.secrets).toHaveLength(1);
    expect(updated.secrets[0].value).toBe("new");
  });
});

describe("redactSecrets", () => {
  it("replaces all secret values with ***", () => {
    const ctx = makeCtx({ secrets: [makeSecret("A", "real-value"), makeSecret("B", "other")] });
    const redacted = redactSecrets(ctx);
    expect(redacted.secrets.every((s) => s.value === "***")).toBe(true);
    expect(redacted.secrets.every((s) => s.status === "redacted")).toBe(true);
    // originals unchanged
    expect(ctx.secrets[0].value).toBe("real-value");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Previous Output Helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("getPreviousOutput", () => {
  it("returns output for known nodeId", () => {
    const ctx = makeCtx({ previousOutputs: { n1: { result: 42 } } });
    expect(getPreviousOutput(ctx, "n1")).toEqual({ result: 42 });
  });

  it("returns undefined for unknown nodeId", () => {
    expect(getPreviousOutput(makeCtx(), "unknown")).toBeUndefined();
  });
});

describe("setPreviousOutput", () => {
  it("sets output without mutation", () => {
    const ctx = makeCtx();
    const updated = setPreviousOutput(ctx, "n1", { data: "x" });
    expect(updated.previousOutputs.n1).toEqual({ data: "x" });
    expect(ctx.previousOutputs.n1).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Timeout Helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("isTimedOut", () => {
  it("returns false when no timeout set", () => {
    expect(isTimedOut(makeCtx())).toBe(false);
  });

  it("returns false before timeout", () => {
    const future = new Date(Date.now() + 60_000);
    const ctx = makeCtx({ meta: { ...makeMeta(), timeoutAt: future } });
    expect(isTimedOut(ctx)).toBe(false);
  });

  it("returns true when past timeout", () => {
    const past = new Date(Date.now() - 1000);
    const ctx = makeCtx({ meta: { ...makeMeta(), timeoutAt: past } });
    expect(isTimedOut(ctx)).toBe(true);
  });
});

describe("getRemainingTimeMs", () => {
  it("returns Infinity when no timeout", () => {
    expect(getRemainingTimeMs(makeCtx())).toBe(Infinity);
  });

  it("returns positive ms before timeout", () => {
    const future = new Date(Date.now() + 5000);
    const ctx = makeCtx({ meta: { ...makeMeta(), timeoutAt: future } });
    expect(getRemainingTimeMs(ctx)).toBeGreaterThan(0);
  });

  it("returns 0 after timeout", () => {
    const past = new Date(Date.now() - 1000);
    const ctx = makeCtx({ meta: { ...makeMeta(), timeoutAt: past } });
    expect(getRemainingTimeMs(ctx)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateContext
// ─────────────────────────────────────────────────────────────────────────────

describe("validateContext", () => {
  it("validates a good context", () => {
    const result = validateContext(makeCtx());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("requires executionId", () => {
    const ctx = makeCtx({ meta: { ...makeMeta(), executionId: "" } });
    const result = validateContext(ctx);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("executionId"))).toBe(true);
  });

  it("requires workflowId", () => {
    const ctx = makeCtx({ meta: { ...makeMeta(), workflowId: "" } });
    const result = validateContext(ctx);
    expect(result.valid).toBe(false);
  });

  it("requires nodeId", () => {
    const ctx = { ...makeCtx(), nodeId: "" };
    const result = validateContext(ctx);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("nodeId"))).toBe(true);
  });

  it("warns on missing secrets", () => {
    const ctx = makeCtx({ secrets: [makeSecret("KEY", "", "missing")] });
    const result = validateContext(ctx);
    expect(result.warnings.some((w) => w.includes("KEY"))).toBe(true);
  });

  it("warns when timeoutAt is before startedAt", () => {
    const startedAt = new Date("2025-06-01T10:00:00Z");
    const timeoutAt = new Date("2025-06-01T09:00:00Z");
    const ctx = makeCtx({ meta: { ...makeMeta(), startedAt, timeoutAt } });
    const result = validateContext(ctx);
    expect(result.warnings.some((w) => w.includes("timeoutAt"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summarizeContext
// ─────────────────────────────────────────────────────────────────────────────

describe("summarizeContext", () => {
  it("summarizes a context", () => {
    const ctx = makeCtx({
      inputs: [{ nodeId: "n1", portId: "p", data: 1 }],
      variables: { a: 1, b: 2 },
      secrets: [makeSecret("K1"), makeSecret("K2", "", "missing")],
    });
    const summary = summarizeContext(ctx);
    expect(summary.executionId).toBe("exec1");
    expect(summary.inputCount).toBe(1);
    expect(summary.variableCount).toBe(2);
    expect(summary.secretCount).toBe(2);
    expect(summary.missingSecrets).toEqual(["K2"]);
    expect(summary.isDryRun).toBe(false);
    expect(summary.timedOut).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// forkContext
// ─────────────────────────────────────────────────────────────────────────────

describe("forkContext", () => {
  it("creates a new context for a different node", () => {
    const ctx = makeCtx({
      inputs: [{ nodeId: "n0", portId: "p", data: "x" }],
      variables: { x: 1 },
    });
    const forked = forkContext(ctx, "node2", "transform");
    expect(forked.nodeId).toBe("node2");
    expect(forked.nodeType).toBe("transform");
    expect(forked.inputs).toHaveLength(0);
    expect(forked.variables).toEqual({ x: 1 }); // variables preserved
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mergeContexts
// ─────────────────────────────────────────────────────────────────────────────

describe("mergeContexts", () => {
  it("merges variables with overlay winning", () => {
    const base = makeCtx({ variables: { a: 1, b: 2 } });
    const result = mergeContexts(base, { variables: { b: 99, c: 3 } });
    expect(result.variables).toEqual({ a: 1, b: 99, c: 3 });
  });

  it("merges secrets with overlay replacing same key", () => {
    const base = makeCtx({ secrets: [makeSecret("K1", "v1"), makeSecret("K2", "v2")] });
    const result = mergeContexts(base, { secrets: [makeSecret("K2", "new")] });
    expect(result.secrets).toHaveLength(2);
    expect(result.secrets.find((s) => s.key === "K2")?.value).toBe("new");
  });

  it("merges previousOutputs with overlay winning", () => {
    const base = makeCtx({ previousOutputs: { n1: "old", n2: "keep" } });
    const result = mergeContexts(base, { previousOutputs: { n1: "new" } });
    expect(result.previousOutputs.n1).toBe("new");
    expect(result.previousOutputs.n2).toBe("keep");
  });

  it("uses overlay inputs when provided", () => {
    const base = makeCtx({ inputs: [{ nodeId: "n1", portId: "p", data: 1 }] });
    const result = mergeContexts(base, { inputs: [{ nodeId: "n2", portId: "q", data: 2 }] });
    expect(result.inputs).toHaveLength(1);
    expect(result.inputs[0].nodeId).toBe("n2");
  });
});
