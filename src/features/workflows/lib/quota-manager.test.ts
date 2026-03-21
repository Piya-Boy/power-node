import { describe, it, expect } from "vitest";
import {
  getQuotaLimit,
  isUnlimited,
  checkQuota,
  checkMultipleQuotas,
  canConsume,
  buildUsageSummary,
  comparePlans,
  meetsMinimumPlan,
  getNextPlan,
  getUpgradeImpact,
  getResetTime,
  isResetDue,
  formatQuotaResult,
  formatUsageSummary,
  PLAN_QUOTAS,
  type QuotaUsage,
} from "./quota-manager";

// ─────────────────────────────────────────────────────────────────────────────
// PLAN_QUOTAS
// ─────────────────────────────────────────────────────────────────────────────

describe("PLAN_QUOTAS", () => {
  it("defines all four plan tiers", () => {
    expect(Object.keys(PLAN_QUOTAS)).toEqual(["free", "starter", "pro", "enterprise"]);
  });

  it("enterprise has unlimited quotas", () => {
    PLAN_QUOTAS.enterprise.quotas.forEach((q) => {
      expect(q.limit).toBe(-1);
    });
  });

  it("free plan has lowest limits", () => {
    const freeExec = PLAN_QUOTAS.free.quotas.find((q) => q.resource === "workflow_executions")!;
    const proExec = PLAN_QUOTAS.pro.quotas.find((q) => q.resource === "workflow_executions")!;
    expect(freeExec.limit).toBeLessThan(proExec.limit);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getQuotaLimit
// ─────────────────────────────────────────────────────────────────────────────

describe("getQuotaLimit", () => {
  it("returns quota for known resource", () => {
    const limit = getQuotaLimit("free", "workflow_executions");
    expect(limit).not.toBeNull();
    expect(limit?.limit).toBe(100);
  });

  it("returns null for unknown resource", () => {
    // @ts-expect-error testing unknown resource
    expect(getQuotaLimit("free", "unknown_resource")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isUnlimited
// ─────────────────────────────────────────────────────────────────────────────

describe("isUnlimited", () => {
  it("returns true for enterprise plan resources", () => {
    expect(isUnlimited("enterprise", "workflow_executions")).toBe(true);
    expect(isUnlimited("enterprise", "active_workflows")).toBe(true);
  });

  it("returns false for free plan resources", () => {
    expect(isUnlimited("free", "workflow_executions")).toBe(false);
  });

  it("returns true for pro unlimited resource", () => {
    expect(isUnlimited("pro", "workflow_count")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkQuota
// ─────────────────────────────────────────────────────────────────────────────

describe("checkQuota", () => {
  it("returns allowed when under limit", () => {
    const result = checkQuota("free", { resource: "workflow_executions", used: 50 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(50);
    expect(result.percentUsed).toBe(50);
    expect(result.isAtHardLimit).toBe(false);
  });

  it("returns not allowed when at hard limit", () => {
    const result = checkQuota("free", { resource: "workflow_executions", used: 100 });
    expect(result.allowed).toBe(false);
    expect(result.isAtHardLimit).toBe(true);
    expect(result.remaining).toBe(0);
    expect(result.message).toContain("exceeded");
  });

  it("returns soft limit warning at 80% usage", () => {
    const result = checkQuota("free", { resource: "workflow_executions", used: 85 });
    expect(result.isAtSoftLimit).toBe(true);
    expect(result.allowed).toBe(true);
    expect(result.message).toContain("approaching");
  });

  it("unlimited resources are always allowed", () => {
    const result = checkQuota("enterprise", { resource: "workflow_executions", used: 9_999_999 });
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(-1);
    expect(result.remaining).toBe(-1);
  });

  it("includes resetAt when provided", () => {
    const resetAt = new Date(Date.now() + 3600_000);
    const result = checkQuota("free", { resource: "api_requests", used: 10, resetAt });
    expect(result.resetAt).toEqual(resetAt);
  });

  it("uses plan soft limit when defined", () => {
    // starter plan has softLimit: 2000 for workflow_executions
    const result = checkQuota("starter", { resource: "workflow_executions", used: 2100 });
    expect(result.isAtSoftLimit).toBe(true);
    expect(result.allowed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkMultipleQuotas
// ─────────────────────────────────────────────────────────────────────────────

describe("checkMultipleQuotas", () => {
  it("checks multiple resources", () => {
    const usages: QuotaUsage[] = [
      { resource: "workflow_executions", used: 10 },
      { resource: "active_workflows", used: 2 },
      { resource: "api_requests", used: 30 },
    ];
    const results = checkMultipleQuotas("free", usages);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.allowed)).toBe(true);
  });

  it("identifies violations", () => {
    const usages: QuotaUsage[] = [
      { resource: "workflow_executions", used: 150 },
    ];
    const results = checkMultipleQuotas("free", usages);
    expect(results[0].allowed).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// canConsume
// ─────────────────────────────────────────────────────────────────────────────

describe("canConsume", () => {
  it("allows when under limit", () => {
    expect(canConsume("free", "workflow_executions", 50, 1)).toBe(true);
  });

  it("allows when exactly at limit", () => {
    expect(canConsume("free", "workflow_executions", 99, 1)).toBe(true);
  });

  it("blocks when would exceed limit", () => {
    expect(canConsume("free", "workflow_executions", 100, 1)).toBe(false);
  });

  it("blocks bulk increment that exceeds limit", () => {
    expect(canConsume("free", "workflow_executions", 95, 10)).toBe(false);
  });

  it("always allows for enterprise (unlimited)", () => {
    expect(canConsume("enterprise", "workflow_executions", 999_999, 1)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildUsageSummary
// ─────────────────────────────────────────────────────────────────────────────

describe("buildUsageSummary", () => {
  it("builds summary with no violations for low usage", () => {
    const usages: QuotaUsage[] = [
      { resource: "workflow_executions", used: 10 },
      { resource: "active_workflows", used: 1 },
    ];
    const summary = buildUsageSummary("free", usages);
    expect(summary.plan).toBe("free");
    expect(summary.violations).toHaveLength(0);
    expect(summary.overallHealthScore).toBeGreaterThan(50);
  });

  it("reports violations when over limit", () => {
    const usages: QuotaUsage[] = [
      { resource: "workflow_executions", used: 150 },
    ];
    const summary = buildUsageSummary("free", usages);
    expect(summary.violations).toHaveLength(1);
    expect(summary.violations[0].resource).toBe("workflow_executions");
    expect(summary.violations[0].overage).toBe(50);
  });

  it("fills in zero for unspecified resources", () => {
    const summary = buildUsageSummary("free", []);
    const execResult = summary.resources.find((r) => r.resource === "workflow_executions");
    expect(execResult?.used).toBe(0);
  });

  it("reports nearing limits for soft limit usage", () => {
    const usages: QuotaUsage[] = [
      { resource: "workflow_executions", used: 85 }, // 85/100 = 85% > 80% soft
    ];
    const summary = buildUsageSummary("free", usages);
    expect(summary.nearingLimits.some((r) => r.resource === "workflow_executions")).toBe(true);
  });

  it("enterprise plan has health score of 100", () => {
    const summary = buildUsageSummary("enterprise", []);
    expect(summary.overallHealthScore).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Plan comparison
// ─────────────────────────────────────────────────────────────────────────────

describe("comparePlans", () => {
  it("free < starter < pro < enterprise", () => {
    expect(comparePlans("free", "starter")).toBeLessThan(0);
    expect(comparePlans("starter", "pro")).toBeLessThan(0);
    expect(comparePlans("pro", "enterprise")).toBeLessThan(0);
    expect(comparePlans("enterprise", "free")).toBeGreaterThan(0);
  });

  it("same plan = 0", () => {
    expect(comparePlans("pro", "pro")).toBe(0);
  });
});

describe("meetsMinimumPlan", () => {
  it("pro meets pro minimum", () => {
    expect(meetsMinimumPlan("pro", "pro")).toBe(true);
  });

  it("pro meets starter minimum", () => {
    expect(meetsMinimumPlan("pro", "starter")).toBe(true);
  });

  it("free does not meet pro minimum", () => {
    expect(meetsMinimumPlan("free", "pro")).toBe(false);
  });
});

describe("getNextPlan", () => {
  it("returns correct next plan", () => {
    expect(getNextPlan("free")).toBe("starter");
    expect(getNextPlan("starter")).toBe("pro");
    expect(getNextPlan("pro")).toBe("enterprise");
  });

  it("returns null for enterprise", () => {
    expect(getNextPlan("enterprise")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getUpgradeImpact
// ─────────────────────────────────────────────────────────────────────────────

describe("getUpgradeImpact", () => {
  it("shows impact of upgrading from free to pro", () => {
    const impact = getUpgradeImpact("free", "pro");
    expect(impact.length).toBeGreaterThan(0);
    const execImpact = impact.find((i) => i.resource === "workflow_executions");
    expect(execImpact?.current).toBe(100);
    expect(execImpact?.upgraded).toBe(25_000);
  });

  it("returns empty when downgrading", () => {
    expect(getUpgradeImpact("pro", "free")).toHaveLength(0);
  });

  it("returns empty when same plan", () => {
    expect(getUpgradeImpact("starter", "starter")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getResetTime
// ─────────────────────────────────────────────────────────────────────────────

describe("getResetTime", () => {
  it("returns next hour boundary", () => {
    const now = new Date("2024-06-15T10:30:00Z");
    const reset = getResetTime("hour", now);
    expect(reset.getUTCHours()).toBe(11);
    expect(reset.getUTCMinutes()).toBe(0);
  });

  it("returns next day boundary", () => {
    const now = new Date("2024-06-15T15:45:00Z");
    const reset = getResetTime("day", now);
    expect(reset.getDate()).toBe(16);
    expect(reset.getHours()).toBe(0);
  });

  it("returns first of next month for billing period", () => {
    const now = new Date("2024-06-15T10:30:00Z");
    const reset = getResetTime("billing_period", now);
    expect(reset.getMonth()).toBe(6); // July (0-indexed)
    expect(reset.getDate()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isResetDue
// ─────────────────────────────────────────────────────────────────────────────

describe("isResetDue", () => {
  it("returns true when reset time has passed", () => {
    const usage: QuotaUsage = {
      resource: "workflow_executions",
      used: 50,
      resetAt: new Date(Date.now() - 1000),
    };
    expect(isResetDue(usage)).toBe(true);
  });

  it("returns false when reset is in future", () => {
    const usage: QuotaUsage = {
      resource: "workflow_executions",
      used: 50,
      resetAt: new Date(Date.now() + 3600_000),
    };
    expect(isResetDue(usage)).toBe(false);
  });

  it("returns false when no resetAt set", () => {
    const usage: QuotaUsage = { resource: "workflow_executions", used: 50 };
    expect(isResetDue(usage)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────

describe("formatQuotaResult", () => {
  it("formats unlimited resource", () => {
    const result = checkQuota("enterprise", { resource: "workflow_executions", used: 0 });
    expect(formatQuotaResult(result)).toContain("unlimited");
  });

  it("formats normal usage", () => {
    const result = checkQuota("free", { resource: "workflow_executions", used: 50 });
    const formatted = formatQuotaResult(result);
    expect(formatted).toContain("50/100");
    expect(formatted).toContain("50%");
    expect(formatted).toContain("✅");
  });

  it("formats exceeded quota", () => {
    const result = checkQuota("free", { resource: "workflow_executions", used: 100 });
    expect(formatQuotaResult(result)).toContain("❌");
  });
});

describe("formatUsageSummary", () => {
  it("formats summary with plan and health score", () => {
    const summary = buildUsageSummary("free", [{ resource: "workflow_executions", used: 10 }]);
    const formatted = formatUsageSummary(summary);
    expect(formatted).toContain("free");
    expect(formatted).toContain("Health:");
    expect(formatted).toContain("workflow_executions");
  });

  it("includes violations section when present", () => {
    const summary = buildUsageSummary("free", [{ resource: "workflow_executions", used: 200 }]);
    expect(formatUsageSummary(summary)).toContain("Violations:");
  });
});
