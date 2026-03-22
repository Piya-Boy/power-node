import { describe, it, expect, beforeEach } from "vitest";
import {
  ERROR_DEFINITIONS,
  createError,
  createCustomError,
  classifyHttpStatus,
  fromHttpStatus,
  classifyByMessage,
  fromMessage,
  markRetried,
  markResolved,
  escalateSeverity,
  addErrorTag,
  attachContext,
  filterByCategory,
  filterBySeverity,
  filterByNode,
  getRetryableErrors,
  getUnresolvedErrors,
  getErrorsAboveSeverity,
  computeErrorStats,
  groupErrorsByNode,
  serializeError,
  deserializeError,
  summarizeError,
  toUserMessage,
  resetErrorIdSeq,
  type WorkflowError,
} from "./error-catalog";

beforeEach(() => {
  resetErrorIdSeq();
});

// ─────────────────────────────────────────────────────────────────────────────
// ERROR_DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

describe("ERROR_DEFINITIONS", () => {
  it("contains expected codes", () => {
    expect(ERROR_DEFINITIONS["ERR_NETWORK_TIMEOUT"]).toBeDefined();
    expect(ERROR_DEFINITIONS["ERR_AUTH_INVALID_TOKEN"]).toBeDefined();
    expect(ERROR_DEFINITIONS["ERR_RATE_LIMITED"]).toBeDefined();
    expect(ERROR_DEFINITIONS["ERR_UNKNOWN"]).toBeDefined();
  });

  it("ERR_NETWORK_TIMEOUT is retryable", () => {
    expect(ERROR_DEFINITIONS["ERR_NETWORK_TIMEOUT"].retryable).toBe(true);
  });

  it("ERR_AUTH_INVALID_TOKEN is not retryable", () => {
    expect(ERROR_DEFINITIONS["ERR_AUTH_INVALID_TOKEN"].retryable).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createError
// ─────────────────────────────────────────────────────────────────────────────

describe("createError", () => {
  it("creates error from known code", () => {
    const e = createError("ERR_NETWORK_TIMEOUT");
    expect(e.code).toBe("ERR_NETWORK_TIMEOUT");
    expect(e.category).toBe("timeout");
    expect(e.retryable).toBe(true);
    expect(e.resolved).toBe(false);
    expect(e.retryCount).toBe(0);
    expect(e.id).toBe("err_1");
  });

  it("falls back to ERR_UNKNOWN for unknown code", () => {
    const e = createError("NOT_A_REAL_CODE");
    expect(e.category).toBe("unknown");
  });

  it("allows overriding fields", () => {
    const e = createError("ERR_SERVER_ERROR", {
      nodeId: "node_abc",
      message: "Custom message",
    });
    expect(e.nodeId).toBe("node_abc");
    expect(e.message).toBe("Custom message");
  });

  it("auto-increments id", () => {
    const e1 = createError("ERR_UNKNOWN");
    const e2 = createError("ERR_UNKNOWN");
    expect(e1.id).toBe("err_1");
    expect(e2.id).toBe("err_2");
  });
});

describe("createCustomError", () => {
  it("creates fully custom error", () => {
    const e = createCustomError("e_custom", "MY_ERROR", "config", "critical", "Custom failure");
    expect(e.id).toBe("e_custom");
    expect(e.code).toBe("MY_ERROR");
    expect(e.severity).toBe("critical");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// classifyHttpStatus
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyHttpStatus", () => {
  it("401 → auth error", () => expect(classifyHttpStatus(401).code).toBe("ERR_AUTH_INVALID_TOKEN"));
  it("403 → forbidden", () => expect(classifyHttpStatus(403).code).toBe("ERR_AUTH_FORBIDDEN"));
  it("404 → not found", () => expect(classifyHttpStatus(404).code).toBe("ERR_NOT_FOUND"));
  it("408 → timeout", () => expect(classifyHttpStatus(408).code).toBe("ERR_NETWORK_TIMEOUT"));
  it("422 → validation", () => expect(classifyHttpStatus(422).code).toBe("ERR_VALIDATION_FAILED"));
  it("429 → rate limit", () => expect(classifyHttpStatus(429).code).toBe("ERR_RATE_LIMITED"));
  it("500 → server error", () => expect(classifyHttpStatus(500).code).toBe("ERR_SERVER_ERROR"));
  it("503 → server error", () => expect(classifyHttpStatus(503).code).toBe("ERR_SERVER_ERROR"));
  it("unknown → ERR_UNKNOWN", () => expect(classifyHttpStatus(200).code).toBe("ERR_UNKNOWN"));
});

describe("fromHttpStatus", () => {
  it("creates error from http status", () => {
    const e = fromHttpStatus(429);
    expect(e.category).toBe("rate_limit");
    expect(e.retryable).toBe(true);
  });

  it("applies overrides", () => {
    const e = fromHttpStatus(404, { nodeId: "node1" });
    expect(e.nodeId).toBe("node1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// classifyByMessage
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyByMessage", () => {
  it("matches timeout message", () => {
    const m = classifyByMessage("Request timed out after 30s");
    expect(m?.code).toBe("ERR_NETWORK_TIMEOUT");
  });

  it("matches rate limit message", () => {
    const m = classifyByMessage("Too many requests — rate limit exceeded");
    expect(m?.code).toBe("ERR_RATE_LIMITED");
  });

  it("matches auth message", () => {
    const m = classifyByMessage("Unauthorized: invalid token");
    expect(m?.code).toBe("ERR_AUTH_INVALID_TOKEN");
  });

  it("returns undefined for unknown message", () => {
    expect(classifyByMessage("Something completely different")).toBeUndefined();
  });

  it("matches ECONNREFUSED", () => {
    const m = classifyByMessage("connect ECONNREFUSED 127.0.0.1:3000");
    expect(m?.code).toBe("ERR_NETWORK_UNREACHABLE");
  });
});

describe("fromMessage", () => {
  it("creates error with classified code", () => {
    const e = fromMessage("Request timed out");
    expect(e.code).toBe("ERR_NETWORK_TIMEOUT");
    expect(e.message).toBe("Request timed out");
  });

  it("falls back to ERR_UNKNOWN", () => {
    const e = fromMessage("Something weird happened");
    expect(e.code).toBe("ERR_UNKNOWN");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe("markRetried", () => {
  it("increments retryCount", () => {
    const e = createError("ERR_NETWORK_TIMEOUT");
    expect(markRetried(e).retryCount).toBe(1);
    expect(markRetried(markRetried(e)).retryCount).toBe(2);
  });

  it("is immutable", () => {
    const e = createError("ERR_NETWORK_TIMEOUT");
    markRetried(e);
    expect(e.retryCount).toBe(0);
  });
});

describe("markResolved", () => {
  it("sets resolved to true", () => {
    const e = createError("ERR_UNKNOWN");
    expect(markResolved(e).resolved).toBe(true);
    expect(e.resolved).toBe(false);
  });
});

describe("escalateSeverity", () => {
  it("escalates from warning to error", () => {
    const e = createError("ERR_VALIDATION_FAILED"); // warning
    expect(escalateSeverity(e).severity).toBe("error");
  });

  it("caps at fatal", () => {
    const e = createCustomError("e1", "X", "unknown", "fatal", "msg");
    expect(escalateSeverity(e).severity).toBe("fatal");
  });
});

describe("addErrorTag", () => {
  it("adds a tag", () => {
    const e = createError("ERR_UNKNOWN");
    expect(addErrorTag(e, "critical").tags).toContain("critical");
  });

  it("does not duplicate tags", () => {
    let e = createError("ERR_UNKNOWN");
    e = addErrorTag(e, "t1");
    e = addErrorTag(e, "t1");
    expect(e.tags.filter((t) => t === "t1")).toHaveLength(1);
  });
});

describe("attachContext", () => {
  it("attaches node and workflow context", () => {
    const e = createError("ERR_UNKNOWN");
    const enriched = attachContext(e, { nodeId: "n1", workflowId: "wf1", executionId: "ex1" });
    expect(enriched.nodeId).toBe("n1");
    expect(enriched.workflowId).toBe("wf1");
    expect(enriched.executionId).toBe("ex1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Filtering
// ─────────────────────────────────────────────────────────────────────────────

function makeErrors(): WorkflowError[] {
  return [
    createError("ERR_NETWORK_TIMEOUT", { nodeId: "n1" }),
    createError("ERR_AUTH_INVALID_TOKEN", { nodeId: "n1" }),
    createError("ERR_RATE_LIMITED", { nodeId: "n2" }),
    markResolved(createError("ERR_VALIDATION_FAILED")),
    createError("ERR_CONFIG_MISSING"),
  ];
}

describe("filterByCategory", () => {
  it("filters by category", () => {
    expect(filterByCategory(makeErrors(), "auth")).toHaveLength(1);
    expect(filterByCategory(makeErrors(), "timeout")).toHaveLength(1);
  });
});

describe("filterBySeverity", () => {
  it("filters by severity", () => {
    const errors = makeErrors();
    const warnings = filterBySeverity(errors, "warning");
    expect(warnings.every((e) => e.severity === "warning")).toBe(true);
  });
});

describe("filterByNode", () => {
  it("filters by nodeId", () => {
    expect(filterByNode(makeErrors(), "n1")).toHaveLength(2);
  });
});

describe("getRetryableErrors", () => {
  it("returns unresolved retryable errors", () => {
    const retryable = getRetryableErrors(makeErrors());
    expect(retryable.every((e) => e.retryable)).toBe(true);
    expect(retryable.every((e) => !e.resolved)).toBe(true);
  });
});

describe("getUnresolvedErrors", () => {
  it("returns only unresolved", () => {
    const errors = makeErrors();
    const unresolved = getUnresolvedErrors(errors);
    expect(unresolved.every((e) => !e.resolved)).toBe(true);
  });
});

describe("getErrorsAboveSeverity", () => {
  it("returns errors at or above severity threshold", () => {
    const errors = makeErrors();
    const above = getErrorsAboveSeverity(errors, "error");
    expect(above.every((e) => ["error", "critical", "fatal"].includes(e.severity))).toBe(true);
  });

  it("includes critical severity", () => {
    const errors = makeErrors();
    const critical = getErrorsAboveSeverity(errors, "critical");
    expect(critical.some((e) => e.code === "ERR_CONFIG_MISSING")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeErrorStats
// ─────────────────────────────────────────────────────────────────────────────

describe("computeErrorStats", () => {
  it("counts totals", () => {
    const stats = computeErrorStats(makeErrors());
    expect(stats.total).toBe(5);
    expect(stats.resolved).toBe(1);
    expect(stats.unresolved).toBe(4);
  });

  it("counts by category", () => {
    const stats = computeErrorStats(makeErrors());
    expect(stats.byCategory.auth).toBe(1);
    expect(stats.byCategory.timeout).toBe(1);
    expect(stats.byCategory.rate_limit).toBe(1);
  });

  it("identifies most frequent code", () => {
    const errors = [
      createError("ERR_UNKNOWN"),
      createError("ERR_UNKNOWN"),
      createError("ERR_SERVER_ERROR"),
    ];
    const stats = computeErrorStats(errors);
    expect(stats.mostFrequentCode).toBe("ERR_UNKNOWN");
  });

  it("handles empty array", () => {
    const stats = computeErrorStats([]);
    expect(stats.total).toBe(0);
    expect(stats.mostFrequentCode).toBeUndefined();
  });
});

describe("groupErrorsByNode", () => {
  it("groups by nodeId", () => {
    const groups = groupErrorsByNode(makeErrors());
    expect(groups["n1"]).toHaveLength(2);
    expect(groups["n2"]).toHaveLength(1);
    expect(groups["__none__"]).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Serialization
// ─────────────────────────────────────────────────────────────────────────────

describe("serializeError / deserializeError", () => {
  it("round-trips an error", () => {
    const e = createError("ERR_SERVER_ERROR", { nodeId: "n1" });
    const json = serializeError(e);
    const restored = deserializeError(json);
    expect(restored).toEqual(e);
  });

  it("deserializeError returns undefined for invalid JSON", () => {
    expect(deserializeError("not-json")).toBeUndefined();
  });
});

describe("summarizeError", () => {
  it("summarizes unresolved error", () => {
    const e = createError("ERR_SERVER_ERROR");
    const s = summarizeError(e);
    expect(s).toContain("ERROR");
    expect(s).toContain("ERR_SERVER_ERROR");
  });

  it("includes retry count", () => {
    const e = markRetried(markRetried(createError("ERR_NETWORK_TIMEOUT")));
    expect(summarizeError(e)).toContain("retried 2x");
  });
});

describe("toUserMessage", () => {
  it("network error message", () => {
    const e = createError("ERR_NETWORK_TIMEOUT");
    expect(toUserMessage(e)).toContain("network");
  });

  it("auth error message", () => {
    const e = createError("ERR_AUTH_INVALID_TOKEN");
    expect(toUserMessage(e)).toContain("Authentication");
  });

  it("rate limit message", () => {
    const e = createError("ERR_RATE_LIMITED");
    expect(toUserMessage(e)).toContain("Too many");
  });

  it("config error message", () => {
    const e = createError("ERR_CONFIG_MISSING");
    expect(toUserMessage(e)).toContain("Configuration");
  });
});
