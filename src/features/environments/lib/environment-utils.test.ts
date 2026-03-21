import { describe, it, expect } from "vitest";
import {
  isValidPromotion,
  getNextTier,
  getPreviousTier,
  mergeEnvironmentVariables,
  diffEnvironments,
  buildPromotionPlan,
  validateEnvironmentVariables,
  sanitizeEnvironmentName,
  formatPromotionPlan,
  type Environment,
} from "./environment-utils";

const makeEnv = (tier: "development" | "staging" | "production", vars: Record<string, string> = {}): Environment => ({
  id: `env-${tier}`,
  name: tier,
  tier,
  variables: vars,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("isValidPromotion", () => {
  it("allows dev → staging", () => expect(isValidPromotion("development", "staging")).toBe(true));
  it("allows staging → production", () => expect(isValidPromotion("staging", "production")).toBe(true));
  it("allows dev → production (skip staging)", () => expect(isValidPromotion("development", "production")).toBe(true));
  it("rejects backward promotions", () => {
    expect(isValidPromotion("production", "staging")).toBe(false);
    expect(isValidPromotion("staging", "development")).toBe(false);
    expect(isValidPromotion("production", "development")).toBe(false);
  });
  it("rejects same-tier promotion", () => {
    expect(isValidPromotion("staging", "staging")).toBe(false);
  });
});

describe("getNextTier", () => {
  it("returns next tier", () => {
    expect(getNextTier("development")).toBe("staging");
    expect(getNextTier("staging")).toBe("production");
  });
  it("returns null for production", () => {
    expect(getNextTier("production")).toBeNull();
  });
});

describe("getPreviousTier", () => {
  it("returns previous tier", () => {
    expect(getPreviousTier("staging")).toBe("development");
    expect(getPreviousTier("production")).toBe("staging");
  });
  it("returns null for development", () => {
    expect(getPreviousTier("development")).toBeNull();
  });
});

describe("mergeEnvironmentVariables", () => {
  it("overrides base with environment vars", () => {
    const base = { A: "1", B: "2" };
    const override = { B: "20", C: "30" };
    const result = mergeEnvironmentVariables(base, override);
    expect(result).toEqual({ A: "1", B: "20", C: "30" });
  });

  it("returns base unchanged when no overrides", () => {
    const base = { A: "1" };
    expect(mergeEnvironmentVariables(base, {})).toEqual({ A: "1" });
  });
});

describe("diffEnvironments", () => {
  it("detects added variables", () => {
    const env1 = makeEnv("development", { A: "1" });
    const env2 = makeEnv("staging", { A: "1", B: "2" });
    const diff = diffEnvironments(env1, env2);
    expect(diff.added).toContain("B");
    expect(diff.same).toContain("A");
  });

  it("detects removed variables", () => {
    const env1 = makeEnv("development", { A: "1", B: "2" });
    const env2 = makeEnv("staging", { A: "1" });
    const diff = diffEnvironments(env1, env2);
    expect(diff.removed).toContain("B");
  });

  it("detects changed variables", () => {
    const env1 = makeEnv("development", { A: "dev-value" });
    const env2 = makeEnv("staging", { A: "staging-value" });
    const diff = diffEnvironments(env1, env2);
    expect(diff.changed).toContain("A");
    expect(diff.same).toHaveLength(0);
  });

  it("identifies same variables", () => {
    const env1 = makeEnv("development", { A: "shared" });
    const env2 = makeEnv("staging", { A: "shared" });
    const diff = diffEnvironments(env1, env2);
    expect(diff.same).toContain("A");
    expect(diff.changed).toHaveLength(0);
  });
});

describe("buildPromotionPlan", () => {
  it("creates a valid plan for dev → staging", () => {
    const dev = makeEnv("development", { API_URL: "http://localhost", KEY: "dev-key" });
    const staging = makeEnv("staging", { API_URL: "https://staging.example.com" });
    const plan = buildPromotionPlan("wf-1", dev, staging);
    expect(plan.canPromote).toBe(true);
    expect(plan.from).toBe("development");
    expect(plan.to).toBe("staging");
  });

  it("rejects backward promotion", () => {
    const prod = makeEnv("production", {});
    const dev = makeEnv("development", {});
    const plan = buildPromotionPlan("wf-1", prod, dev);
    expect(plan.canPromote).toBe(false);
    expect(plan.warnings[0]).toContain("Cannot promote");
  });

  it("includes warning for production promotion", () => {
    const staging = makeEnv("staging", {});
    const prod = makeEnv("production", {});
    const plan = buildPromotionPlan("wf-1", staging, prod);
    expect(plan.warnings.some((w) => w.includes("production"))).toBe(true);
  });

  it("includes activation change when requested", () => {
    const dev = makeEnv("development", {});
    const staging = makeEnv("staging", {});
    const plan = buildPromotionPlan("wf-1", dev, staging, { activateInTarget: true });
    expect(plan.changes.some((c) => c.type === "activation_change")).toBe(true);
  });

  it("reports changed variables", () => {
    const dev = makeEnv("development", { URL: "http://dev.example.com" });
    const staging = makeEnv("staging", { URL: "http://staging.example.com" });
    const plan = buildPromotionPlan("wf-1", dev, staging);
    expect(plan.changes.some((c) => c.description.includes("URL"))).toBe(true);
  });
});

describe("validateEnvironmentVariables", () => {
  it("passes when all required keys present", () => {
    const result = validateEnvironmentVariables({ A: "1", B: "2" }, ["A", "B"]);
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("fails when required keys missing", () => {
    const result = validateEnvironmentVariables({ A: "1" }, ["A", "B", "C"]);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("B");
    expect(result.missing).toContain("C");
  });

  it("fails for empty string values", () => {
    const result = validateEnvironmentVariables({ A: "" }, ["A"]);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("A");
  });
});

describe("sanitizeEnvironmentName", () => {
  it("lowercases and replaces special chars with dash", () => {
    expect(sanitizeEnvironmentName("My Env!")).toBe("my-env");
  });

  it("collapses multiple dashes", () => {
    expect(sanitizeEnvironmentName("dev--env")).toBe("dev-env");
  });

  it("trims leading/trailing dashes", () => {
    expect(sanitizeEnvironmentName("-staging-")).toBe("staging");
  });

  it("handles normal names", () => {
    expect(sanitizeEnvironmentName("production")).toBe("production");
  });
});

describe("formatPromotionPlan", () => {
  it("formats a valid plan", () => {
    const dev = makeEnv("development", {});
    const staging = makeEnv("staging", {});
    const plan = buildPromotionPlan("wf-1", dev, staging);
    const formatted = formatPromotionPlan(plan);
    expect(formatted).toContain("development → staging");
    expect(formatted).toContain("Ready");
  });

  it("formats a blocked plan", () => {
    const prod = makeEnv("production", {});
    const dev = makeEnv("development", {});
    const plan = buildPromotionPlan("wf-1", prod, dev);
    const formatted = formatPromotionPlan(plan);
    expect(formatted).toContain("Blocked");
    expect(formatted).toContain("Warning");
  });
});
