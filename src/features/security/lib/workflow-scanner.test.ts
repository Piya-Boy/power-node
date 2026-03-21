import { describe, it, expect } from "vitest";
import {
  scanWorkflow,
  summarizeScanResults,
  filterFindingsBySeverity,
  type ScanWorkflow,
} from "./workflow-scanner";

const makeWorkflow = (overrides: Partial<ScanWorkflow> = {}): ScanWorkflow => ({
  id: "wf-1",
  name: "Test Workflow",
  nodes: [],
  isActive: true,
  webhookSecret: "super-secret",
  ...overrides,
});

describe("scanWorkflow", () => {
  it("returns clean result for empty workflow with secret", () => {
    // isActive=false so the "active with no nodes" finding won't trigger
    const result = scanWorkflow(makeWorkflow({ isActive: false }));
    expect(result.findings).toHaveLength(0);
    expect(result.score).toBe(100);
  });

  it("detects webhook without secret", () => {
    const workflow = makeWorkflow({
      webhookSecret: null,
      nodes: [{ id: "n1", name: "Webhook", type: "WEBHOOK_TRIGGER", data: {} }],
    });
    const result = scanWorkflow(workflow);
    const finding = result.findings.find((f) => f.title.includes("Webhook trigger without secret"));
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("high");
  });

  it("detects API token in URL query string", () => {
    const workflow = makeWorkflow({
      nodes: [{
        id: "n1",
        name: "HTTP Node",
        type: "HTTP_REQUEST",
        data: { url: "https://api.example.com/data?api_key=mytoken123" },
      }],
    });
    const result = scanWorkflow(workflow);
    const finding = result.findings.find((f) => f.title.includes("API token in URL"));
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("high");
    expect(finding?.nodeId).toBe("n1");
  });

  it("detects insecure HTTP endpoint", () => {
    const workflow = makeWorkflow({
      nodes: [{
        id: "n1",
        name: "HTTP Node",
        type: "HTTP_REQUEST",
        data: { url: "http://api.external.com/data" },
      }],
    });
    const result = scanWorkflow(workflow);
    const finding = result.findings.find((f) => f.title.includes("Insecure HTTP"));
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("medium");
  });

  it("allows http://localhost", () => {
    const workflow = makeWorkflow({
      nodes: [{
        id: "n1",
        name: "HTTP Node",
        type: "HTTP_REQUEST",
        data: { url: "http://localhost:3000/api" },
      }],
    });
    const result = scanWorkflow(workflow);
    expect(result.findings.find((f) => f.title.includes("Insecure HTTP"))).toBeUndefined();
  });

  it("detects eval in CODE node", () => {
    const workflow = makeWorkflow({
      nodes: [{
        id: "n1",
        name: "Code",
        type: "CODE",
        data: { code: "const result = eval(input.expression);" },
      }],
    });
    const result = scanWorkflow(workflow);
    const finding = result.findings.find((f) => f.title.includes("Dynamic code"));
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("critical");
  });

  it("detects new Function in CODE node", () => {
    const workflow = makeWorkflow({
      nodes: [{
        id: "n1",
        name: "Code",
        type: "CODE",
        data: { code: 'const fn = new Function("x", "return x + 1");' },
      }],
    });
    const result = scanWorkflow(workflow);
    expect(result.findings.find((f) => f.severity === "critical")).toBeDefined();
  });

  it("detects process.env in CODE node", () => {
    const workflow = makeWorkflow({
      nodes: [{
        id: "n1",
        name: "Code",
        type: "CODE",
        data: { code: "return process.env.SECRET_KEY;" },
      }],
    });
    const result = scanWorkflow(workflow);
    const finding = result.findings.find((f) => f.title.includes("environment variables"));
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("medium");
  });

  it("detects active workflow with no nodes", () => {
    const workflow = makeWorkflow({ nodes: [], isActive: true });
    const result = scanWorkflow(workflow);
    const finding = result.findings.find((f) => f.title.includes("no nodes"));
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("low");
  });

  it("score decreases with findings", () => {
    const clean = scanWorkflow(makeWorkflow({ nodes: [] }));
    const risky = scanWorkflow(makeWorkflow({
      webhookSecret: null,
      nodes: [{ id: "n1", name: "WH", type: "WEBHOOK_TRIGGER", data: {} }],
    }));
    expect(clean.score).toBeGreaterThan(risky.score);
  });

  it("score is never negative", () => {
    const workflow = makeWorkflow({
      webhookSecret: null,
      nodes: [
        { id: "n1", name: "WH", type: "WEBHOOK_TRIGGER", data: {} },
        { id: "n2", name: "Code", type: "CODE", data: { code: "eval(x); process.env.S" } },
        ...Array.from({ length: 25 }, (_, i) => ({
          id: `n${i + 10}`,
          name: `HTTP ${i}`,
          type: "HTTP_REQUEST",
          data: { url: "http://external.com?api_key=bad" },
        })),
      ],
    });
    const result = scanWorkflow(workflow);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

describe("summarizeScanResults", () => {
  it("returns empty summary for no results", () => {
    const summary = summarizeScanResults([]);
    expect(summary.totalWorkflows).toBe(0);
    expect(summary.averageScore).toBe(100);
    expect(summary.mostVulnerable).toBeNull();
  });

  it("aggregates findings across workflows", () => {
    const r1 = scanWorkflow(makeWorkflow({
      id: "wf-1",
      webhookSecret: null,
      nodes: [{ id: "n1", name: "WH", type: "WEBHOOK_TRIGGER", data: {} }],
    }));
    const r2 = scanWorkflow(makeWorkflow({ id: "wf-2" }));
    const summary = summarizeScanResults([r1, r2]);
    expect(summary.totalWorkflows).toBe(2);
    expect(summary.totalFindings).toBeGreaterThan(0);
    expect(summary.mostVulnerable?.workflowId).toBe("wf-1");
  });

  it("counts critical findings", () => {
    const r = scanWorkflow(makeWorkflow({
      nodes: [{
        id: "n1",
        name: "Code",
        type: "CODE",
        data: { code: "eval(x)" },
      }],
    }));
    const summary = summarizeScanResults([r]);
    expect(summary.criticalCount).toBeGreaterThan(0);
  });
});

describe("filterFindingsBySeverity", () => {
  const findings = [
    { id: "1", severity: "info" as const, title: "Info", description: "", recommendation: "" },
    { id: "2", severity: "low" as const, title: "Low", description: "", recommendation: "" },
    { id: "3", severity: "medium" as const, title: "Medium", description: "", recommendation: "" },
    { id: "4", severity: "high" as const, title: "High", description: "", recommendation: "" },
    { id: "5", severity: "critical" as const, title: "Critical", description: "", recommendation: "" },
  ];

  it("returns all when minSeverity is info", () => {
    expect(filterFindingsBySeverity(findings, "info")).toHaveLength(5);
  });

  it("returns only high and critical for minSeverity=high", () => {
    const result = filterFindingsBySeverity(findings, "high");
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.severity)).toEqual(["high", "critical"]);
  });

  it("returns only critical for minSeverity=critical", () => {
    expect(filterFindingsBySeverity(findings, "critical")).toHaveLength(1);
  });
});
