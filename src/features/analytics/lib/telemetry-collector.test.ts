import { describe, it, expect, beforeEach } from "vitest";
import {
  logLevelIndex,
  isLogLevelAtLeast,
  createBuffer,
  addMetric,
  addLog,
  addEvent,
  clearBuffer,
  counter,
  gauge,
  histogram,
  log,
  telemetryEvent,
  shouldSample,
  sampleLogs,
  sampleMetrics,
  filterLogsByLevel,
  filterLogsByWorkflow,
  filterMetricsByName,
  filterMetricsByLabel,
  filterEventsByName,
  filterEventsByKind,
  aggregateMetrics,
  summarizeLogs,
  filterMetricsByWindow,
  filterLogsByWindow,
  getBufferStats,
  resetSeq,
  type TelemetryBuffer,
  type SamplingConfig,
} from "./telemetry-collector";

const NOW = 1_700_000_000_000;

beforeEach(() => {
  resetSeq();
});

// ─────────────────────────────────────────────────────────────────────────────
// Log Level
// ─────────────────────────────────────────────────────────────────────────────

describe("logLevelIndex", () => {
  it("trace is lowest", () => expect(logLevelIndex("trace")).toBe(0));
  it("fatal is highest", () => expect(logLevelIndex("fatal")).toBe(5));
});

describe("isLogLevelAtLeast", () => {
  it("true when actual >= min", () => {
    expect(isLogLevelAtLeast("error", "warn")).toBe(true);
    expect(isLogLevelAtLeast("info", "info")).toBe(true);
  });
  it("false when actual < min", () => {
    expect(isLogLevelAtLeast("debug", "info")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Buffer
// ─────────────────────────────────────────────────────────────────────────────

describe("createBuffer", () => {
  it("creates empty buffer", () => {
    const buf = createBuffer(100);
    expect(buf.metrics).toHaveLength(0);
    expect(buf.logs).toHaveLength(0);
    expect(buf.maxSize).toBe(100);
    expect(buf.droppedCount).toBe(0);
  });
});

describe("addMetric", () => {
  it("adds metric", () => {
    const buf = addMetric(createBuffer(), counter("req.count", 1, {}, NOW));
    expect(buf.metrics).toHaveLength(1);
  });

  it("drops when at maxSize", () => {
    let buf = createBuffer(2);
    buf = addMetric(buf, counter("x", 1, {}, NOW));
    buf = addMetric(buf, counter("x", 2, {}, NOW));
    buf = addMetric(buf, counter("x", 3, {}, NOW));
    expect(buf.metrics).toHaveLength(2);
    expect(buf.droppedCount).toBe(1);
  });

  it("is immutable", () => {
    const original = createBuffer();
    addMetric(original, counter("x", 1, {}, NOW));
    expect(original.metrics).toHaveLength(0);
  });
});

describe("addLog", () => {
  it("adds log entry", () => {
    const buf = addLog(createBuffer(), log("info", "Hello", {}, NOW));
    expect(buf.logs).toHaveLength(1);
  });
});

describe("addEvent", () => {
  it("adds telemetry event", () => {
    const buf = addEvent(createBuffer(), telemetryEvent("workflow.started", "event", { timestamp: NOW }));
    expect(buf.events).toHaveLength(1);
  });
});

describe("clearBuffer", () => {
  it("clears all data", () => {
    let buf = createBuffer();
    buf = addMetric(buf, counter("x", 1, {}, NOW));
    buf = addLog(buf, log("info", "test", {}, NOW));
    buf = clearBuffer(buf);
    expect(buf.metrics).toHaveLength(0);
    expect(buf.logs).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Builders
// ─────────────────────────────────────────────────────────────────────────────

describe("counter / gauge / histogram", () => {
  it("counter has correct type", () => expect(counter("c", 5, {}, NOW).type).toBe("counter"));
  it("gauge has correct type", () => expect(gauge("g", 3.14, {}, NOW).type).toBe("gauge"));
  it("histogram has correct type", () => expect(histogram("h", 100, {}, NOW).type).toBe("histogram"));
  it("labels attached", () => {
    expect(counter("c", 1, { env: "prod" }, NOW).labels.env).toBe("prod");
  });
});

describe("log builder", () => {
  it("creates log entry", () => {
    const entry = log("warn", "Something is off", { key: "val" }, NOW);
    expect(entry.level).toBe("warn");
    expect(entry.message).toBe("Something is off");
    expect(entry.context.key).toBe("val");
  });
});

describe("telemetryEvent", () => {
  it("creates event with auto-id", () => {
    const e = telemetryEvent("page.view", "event", { timestamp: NOW });
    expect(e.id).toBe("tel_1");
    expect(e.name).toBe("page.view");
    expect(e.kind).toBe("event");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sampling
// ─────────────────────────────────────────────────────────────────────────────

describe("shouldSample", () => {
  it("always samples when rate=1.0", () => {
    expect(shouldSample("any", { rate: 1.0 })).toBe(true);
  });

  it("never samples when rate=0.0", () => {
    expect(shouldSample("any", { rate: 0.0 })).toBe(false);
  });

  it("is deterministic with same seed", () => {
    const config: SamplingConfig = { rate: 0.5, seed: 42 };
    expect(shouldSample("test-id", config)).toBe(shouldSample("test-id", config));
  });
});

describe("sampleLogs", () => {
  const logs = [
    log("debug", "dbg", {}, NOW),
    log("info", "info", {}, NOW),
    log("error", "err", {}, NOW),
  ];

  it("always includes errors when alwaysSampleOnError=true", () => {
    const config: SamplingConfig = { rate: 0.0, alwaysSampleOnError: true };
    const sampled = sampleLogs(logs, config);
    expect(sampled.some((l) => l.level === "error")).toBe(true);
  });

  it("filters by minLevel", () => {
    const config: SamplingConfig = { rate: 1.0, minLevel: "warn" };
    const sampled = sampleLogs(logs, config);
    expect(sampled.every((l) => logLevelIndex(l.level) >= logLevelIndex("warn"))).toBe(true);
  });
});

describe("sampleMetrics", () => {
  const metrics = Array.from({ length: 10 }, (_, i) =>
    counter("req", i, {}, NOW + i)
  );

  it("returns all when rate=1.0", () => {
    expect(sampleMetrics(metrics, { rate: 1.0 })).toHaveLength(10);
  });

  it("returns empty when rate=0.0", () => {
    expect(sampleMetrics(metrics, { rate: 0.0 })).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Filtering
// ─────────────────────────────────────────────────────────────────────────────

describe("filterLogsByLevel", () => {
  const logs = [
    log("debug", "dbg", {}, NOW),
    log("info", "info", {}, NOW),
    log("error", "err", {}, NOW),
  ];

  it("returns logs at or above level", () => {
    const result = filterLogsByLevel(logs, "info");
    expect(result).toHaveLength(2);
    expect(result.every((l) => logLevelIndex(l.level) >= logLevelIndex("info"))).toBe(true);
  });
});

describe("filterLogsByWorkflow", () => {
  it("filters by workflowId", () => {
    const logs = [
      { ...log("info", "a", {}, NOW), workflowId: "wf1" },
      { ...log("info", "b", {}, NOW), workflowId: "wf2" },
    ];
    expect(filterLogsByWorkflow(logs, "wf1")).toHaveLength(1);
  });
});

describe("filterMetricsByName", () => {
  it("filters by metric name", () => {
    const metrics = [counter("a", 1, {}, NOW), counter("b", 2, {}, NOW)];
    expect(filterMetricsByName(metrics, "a")).toHaveLength(1);
  });
});

describe("filterMetricsByLabel", () => {
  it("filters by label key/value", () => {
    const metrics = [
      counter("req", 1, { env: "prod" }, NOW),
      counter("req", 2, { env: "dev" }, NOW),
    ];
    expect(filterMetricsByLabel(metrics, "env", "prod")).toHaveLength(1);
  });
});

describe("filterEventsByName / filterEventsByKind", () => {
  const events = [
    telemetryEvent("workflow.started", "event", { timestamp: NOW }),
    telemetryEvent("node.done", "span", { timestamp: NOW }),
  ];

  it("filterEventsByName", () => {
    expect(filterEventsByName(events, "workflow.started")).toHaveLength(1);
  });

  it("filterEventsByKind", () => {
    expect(filterEventsByKind(events, "span")).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// aggregateMetrics
// ─────────────────────────────────────────────────────────────────────────────

describe("aggregateMetrics", () => {
  const metrics = [
    histogram("latency", 100, {}, NOW),
    histogram("latency", 200, {}, NOW + 1000),
    histogram("latency", 150, {}, NOW + 2000),
    counter("req", 5, {}, NOW),
    counter("req", 3, {}, NOW + 1000),
  ];

  it("aggregates by metric name", () => {
    const result = aggregateMetrics(metrics);
    expect(result).toHaveLength(2);
  });

  it("computes sum, min, max, avg", () => {
    const latency = aggregateMetrics(metrics).find((m) => m.name === "latency")!;
    expect(latency.count).toBe(3);
    expect(latency.sum).toBe(450);
    expect(latency.min).toBe(100);
    expect(latency.max).toBe(200);
    expect(latency.avg).toBe(150);
  });

  it("computes percentiles", () => {
    const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    const ms = values.map((v) => histogram("lat", v, {}, NOW));
    const agg = aggregateMetrics(ms).find((m) => m.name === "lat")!;
    expect(agg.p50).toBe(500);
    expect(agg.p95).toBeGreaterThanOrEqual(900);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summarizeLogs
// ─────────────────────────────────────────────────────────────────────────────

describe("summarizeLogs", () => {
  const logs = [
    log("info", "started", {}, NOW),
    log("info", "running", {}, NOW),
    log("error", "crash", {}, NOW),
    log("fatal", "crash", {}, NOW), // same message
  ];

  it("counts by level", () => {
    const summary = summarizeLogs(logs);
    expect(summary.byLevel.info).toBe(2);
    expect(summary.byLevel.error).toBe(1);
    expect(summary.byLevel.fatal).toBe(1);
  });

  it("collects error messages", () => {
    const summary = summarizeLogs(logs);
    expect(summary.errorMessages).toContain("crash");
  });

  it("counts unique messages", () => {
    const summary = summarizeLogs(logs);
    expect(summary.uniqueMessages).toBe(3); // "started", "running", "crash"
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Time window filters
// ─────────────────────────────────────────────────────────────────────────────

describe("filterMetricsByWindow", () => {
  const metrics = [
    counter("x", 1, {}, NOW),
    counter("x", 2, {}, NOW + 5000),
    counter("x", 3, {}, NOW + 10000),
  ];

  it("returns metrics in window", () => {
    const result = filterMetricsByWindow(metrics, NOW + 1000, NOW + 9000);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(2);
  });
});

describe("filterLogsByWindow", () => {
  it("returns logs in window", () => {
    const logs = [
      log("info", "a", {}, NOW),
      log("info", "b", {}, NOW + 5000),
    ];
    expect(filterLogsByWindow(logs, NOW + 1000, NOW + 9000)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getBufferStats
// ─────────────────────────────────────────────────────────────────────────────

describe("getBufferStats", () => {
  it("computes buffer statistics", () => {
    let buf = createBuffer(1000);
    buf = addMetric(buf, counter("req", 1, {}, NOW));
    buf = addMetric(buf, gauge("cpu", 80, {}, NOW));
    buf = addLog(buf, log("info", "a", {}, NOW));
    buf = addLog(buf, log("error", "b", {}, NOW));
    buf = addEvent(buf, telemetryEvent("ev", "event", { timestamp: NOW }));

    const stats = getBufferStats(buf);
    expect(stats.metricCount).toBe(2);
    expect(stats.logCount).toBe(2);
    expect(stats.eventCount).toBe(1);
    expect(stats.total).toBe(5);
    expect(stats.logLevelBreakdown.info).toBe(1);
    expect(stats.logLevelBreakdown.error).toBe(1);
    expect(stats.metricNameBreakdown.req).toBe(1);
    expect(stats.fillPercent).toBe(0.5);
  });
});
