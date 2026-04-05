import { describe, expect, it } from "vitest";
import { ExecutionStatus, NodeType } from "@/generated/prisma";
import {
  buildWorkflowInsightsSnapshot,
  estimateManualTimeMinutes,
  inferExecutionCost,
  inferExecutionTrigger,
  mapExecutionRecordToDataPoint,
  pickInsightsGranularity,
} from "./workflow-insights";

describe("inferExecutionTrigger", () => {
  it("prefers schedule when a scheduled trigger exists", () => {
    expect(inferExecutionTrigger([NodeType.SCHEDULE_TRIGGER])).toBe("schedule");
  });

  it("detects webhook-driven workflows", () => {
    expect(inferExecutionTrigger([NodeType.WEBHOOK_TRIGGER])).toBe("webhook");
  });

  it("falls back to manual for manual/chat triggers", () => {
    expect(inferExecutionTrigger([NodeType.MANUAL_TRIGGER])).toBe("manual");
  });
});

describe("inferExecutionCost", () => {
  it("reads top-level cost fields from execution output", () => {
    expect(inferExecutionCost({ cost: 1.25 })).toBe(1.25);
    expect(inferExecutionCost({ totalCost: 2.5 })).toBe(2.5);
  });

  it("returns zero for unsupported payloads", () => {
    expect(inferExecutionCost(null)).toBe(0);
  });
});

describe("estimateManualTimeMinutes", () => {
  it("uses a sensible floor for small workflows", () => {
    expect(estimateManualTimeMinutes(1)).toBe(5);
  });

  it("scales with larger node counts", () => {
    expect(estimateManualTimeMinutes(10)).toBe(15);
  });
});

describe("pickInsightsGranularity", () => {
  it("uses day granularity for short windows", () => {
    expect(pickInsightsGranularity(7)).toBe("day");
  });

  it("uses week granularity for monthly windows", () => {
    expect(pickInsightsGranularity(30)).toBe("week");
  });
});

describe("mapExecutionRecordToDataPoint", () => {
  it("maps prisma execution records into analytics datapoints", () => {
    const dataPoint = mapExecutionRecordToDataPoint({
      id: "exec_1",
      workflowId: "wf_1",
      status: ExecutionStatus.SUCCESS,
      startedAt: new Date("2026-03-20T10:00:00.000Z"),
      completedAt: new Date("2026-03-20T10:00:03.000Z"),
      output: { cost: 0.15 },
      workflow: {
        id: "wf_1",
        name: "Importer",
        nodes: [
          { type: NodeType.WEBHOOK_TRIGGER },
          { type: NodeType.HTTP_REQUEST },
        ],
      },
    });

    expect(dataPoint).toMatchObject({
      workflowId: "wf_1",
      workflowName: "Importer",
      status: "success",
      triggeredBy: "webhook",
      durationMs: 3000,
      cost: 0.15,
    });
  });
});

describe("buildWorkflowInsightsSnapshot", () => {
  it("builds an insights snapshot for the requested window", () => {
    const snapshot = buildWorkflowInsightsSnapshot(
      [
        {
          id: "exec_1",
          workflowId: "wf_1",
          status: ExecutionStatus.SUCCESS,
          startedAt: new Date("2026-03-20T10:00:00.000Z"),
          completedAt: new Date("2026-03-20T10:01:00.000Z"),
          output: { cost: 0.5 },
          workflow: {
            id: "wf_1",
            name: "Importer",
            nodes: [
              { type: NodeType.WEBHOOK_TRIGGER },
              { type: NodeType.HTTP_REQUEST },
            ],
          },
        },
        {
          id: "exec_2",
          workflowId: "wf_1",
          status: ExecutionStatus.FAILED,
          startedAt: new Date("2026-03-21T10:00:00.000Z"),
          completedAt: new Date("2026-03-21T10:00:30.000Z"),
          output: null,
          workflow: {
            id: "wf_1",
            name: "Importer",
            nodes: [
              { type: NodeType.WEBHOOK_TRIGGER },
              { type: NodeType.HTTP_REQUEST },
            ],
          },
        },
      ],
      {
        now: new Date("2026-03-24T12:00:00.000Z"),
        windowDays: 30,
      },
    );

    expect(snapshot.metrics.totalExecutions).toBe(2);
    expect(snapshot.metrics.failedExecutions).toBe(1);
    expect(snapshot.workflows).toHaveLength(1);
    expect(snapshot.executionSeries.points.length).toBeGreaterThan(0);
  });
});
