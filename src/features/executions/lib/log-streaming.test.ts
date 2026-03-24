import { describe, expect, it, vi } from "vitest";
import {
  buildExecutionLogPayload,
  getExecutionLifecycleLevel,
  shouldStreamExecutionLog,
  streamExecutionLog,
} from "./log-streaming";

describe("getExecutionLifecycleLevel", () => {
  it("maps failed executions to error level", () => {
    expect(getExecutionLifecycleLevel("failed")).toBe("error");
  });

  it("maps started and completed executions to info level", () => {
    expect(getExecutionLifecycleLevel("started")).toBe("info");
    expect(getExecutionLifecycleLevel("completed")).toBe("info");
  });
});

describe("shouldStreamExecutionLog", () => {
  it("skips disabled workflows", () => {
    expect(
      shouldStreamExecutionLog(
        { enabled: false, url: "https://example.com/logs" },
        "failed",
      ),
    ).toBe(false);
  });

  it("filters info events when min level is error", () => {
    expect(
      shouldStreamExecutionLog(
        {
          enabled: true,
          url: "https://example.com/logs",
          minLevel: "error",
        },
        "completed",
      ),
    ).toBe(false);
  });

  it("allows failed events when min level is error", () => {
    expect(
      shouldStreamExecutionLog(
        {
          enabled: true,
          url: "https://example.com/logs",
          minLevel: "error",
        },
        "failed",
      ),
    ).toBe(true);
  });
});

describe("buildExecutionLogPayload", () => {
  it("builds a stable envelope", () => {
    const payload = buildExecutionLogPayload({
      workflowId: "wf_1",
      workflowName: "Example",
      executionId: "exec_1",
      inngestEventId: "evt_1",
      lifecycle: "failed",
      status: "FAILED",
      timestamp: new Date("2026-03-24T12:00:00.000Z"),
      durationMs: 4200,
      error: "Boom",
    });

    expect(payload).toMatchObject({
      event: "workflow.execution.failed",
      level: "error",
      workflowId: "wf_1",
      executionId: "exec_1",
      status: "FAILED",
      durationMs: 4200,
      error: "Boom",
    });
  });
});

describe("streamExecutionLog", () => {
  it("posts the execution log payload to the configured endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
    });

    const result = await streamExecutionLog(
      {
        enabled: true,
        url: "https://example.com/logs",
      },
      {
        workflowId: "wf_1",
        workflowName: "Example",
        executionId: "exec_1",
        inngestEventId: "evt_1",
        lifecycle: "completed",
        status: "SUCCESS",
        timestamp: new Date("2026-03-24T12:00:00.000Z"),
      },
      fetchMock as typeof fetch,
    );

    expect(result).toEqual({
      sent: true,
      status: 202,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBeInstanceOf(URL);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        "content-type": "application/json",
      }),
    });
  });

  it("returns filtered when the event level is below the workflow threshold", async () => {
    const fetchMock = vi.fn();

    const result = await streamExecutionLog(
      {
        enabled: true,
        url: "https://example.com/logs",
        minLevel: "error",
      },
      {
        workflowId: "wf_1",
        workflowName: "Example",
        executionId: "exec_1",
        inngestEventId: "evt_1",
        lifecycle: "started",
        status: "RUNNING",
      },
      fetchMock as typeof fetch,
    );

    expect(result).toEqual({
      sent: false,
      reason: "filtered",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
