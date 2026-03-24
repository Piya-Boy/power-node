import { describe, expect, it } from "vitest";
import {
  buildErrorTriggerInitialData,
  matchesErrorTrigger,
  type WorkflowFailurePayload,
} from "./error-trigger";

const payload: WorkflowFailurePayload = {
  sourceWorkflowId: "workflow_source",
  sourceWorkflowName: "Failed Import",
  sourceEventId: "evt_123",
  errorMessage: "SMTP connection timed out",
  errorStack: "stack",
  failedAt: "2026-03-24T09:00:00.000Z",
};

describe("error trigger helpers", () => {
  it("matches when no filters are configured", () => {
    expect(matchesErrorTrigger({}, payload)).toBe(true);
  });

  it("matches a specific workflow id", () => {
    expect(
      matchesErrorTrigger({ sourceWorkflowId: "workflow_source" }, payload),
    ).toBe(true);
    expect(
      matchesErrorTrigger({ sourceWorkflowId: "workflow_other" }, payload),
    ).toBe(false);
  });

  it("matches error message filters case-insensitively", () => {
    expect(matchesErrorTrigger({ messageIncludes: "timed out" }, payload)).toBe(
      true,
    );
    expect(matchesErrorTrigger({ messageIncludes: "network" }, payload)).toBe(
      false,
    );
  });

  it("builds initial data using the configured variable name", () => {
    expect(
      buildErrorTriggerInitialData({ variableName: "failure" }, payload),
    ).toEqual({
      errorTrigger: payload,
      failure: payload,
    });
  });

  it("falls back to the error variable name", () => {
    expect(buildErrorTriggerInitialData({}, payload)).toEqual({
      errorTrigger: payload,
      error: payload,
    });
  });
});
