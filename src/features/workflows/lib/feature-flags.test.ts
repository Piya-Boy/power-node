import { describe, it, expect } from "vitest";
import {
  getBucket,
  getAttribute,
  evaluateCondition,
  evaluateRule,
  evaluateFlag,
  evaluateAllFlags,
  createBooleanFlag,
  toggleFlag,
  addRule,
  removeRule,
  setRollout,
  archiveFlag,
  validateFlag,
  computeFlagStats,
  type FeatureFlag,
  type FlagRule,
  type EvaluationContext,
  type TargetingRule,
} from "./feature-flags";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeFlag(overrides: Partial<FeatureFlag<boolean>> = {}): FeatureFlag<boolean> {
  return {
    id: "flag1",
    name: "Test Flag",
    type: "boolean",
    enabled: true,
    defaultVariationId: "off",
    variations: [
      { id: "on", value: true },
      { id: "off", value: false },
    ],
    rules: [],
    tags: [],
    ...overrides,
  };
}

function makeRule(overrides: Partial<FlagRule> = {}): FlagRule {
  return {
    id: "rule1",
    variationId: "on",
    priority: 1,
    conditions: [{ id: "c1", attribute: "plan", operator: "equals", value: "pro" }],
    ...overrides,
  };
}

const ctx: EvaluationContext = { userId: "u1", plan: "pro", age: 25, email: "u@example.com" };

// ─────────────────────────────────────────────────────────────────────────────
// getBucket
// ─────────────────────────────────────────────────────────────────────────────

describe("getBucket", () => {
  it("returns value in 0–99 range", () => {
    for (const key of ["user1", "user2", "abc", "xyz123"]) {
      const b = getBucket(key);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
    }
  });

  it("is deterministic", () => {
    expect(getBucket("same-key")).toBe(getBucket("same-key"));
  });

  it("distributes reasonably", () => {
    const buckets = Array.from({ length: 100 }, (_, i) => getBucket(`user${i}`));
    const under50 = buckets.filter((b) => b < 50).length;
    // expect roughly half under 50 (loose bound: 25-75)
    expect(under50).toBeGreaterThan(25);
    expect(under50).toBeLessThan(75);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getAttribute
// ─────────────────────────────────────────────────────────────────────────────

describe("getAttribute", () => {
  it("gets top-level attribute", () => {
    expect(getAttribute(ctx, "userId")).toBe("u1");
  });

  it("supports dot notation", () => {
    const nested = { user: { role: "admin" } };
    expect(getAttribute(nested, "user.role")).toBe("admin");
  });

  it("returns undefined for missing path", () => {
    expect(getAttribute(ctx, "missing.path")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateCondition
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateCondition", () => {
  function cond(operator: TargetingRule["operator"], value: unknown, attribute = "plan"): TargetingRule {
    return { id: "c1", attribute, operator, value };
  }

  it("equals", () => {
    expect(evaluateCondition(cond("equals", "pro"), ctx)).toBe(true);
    expect(evaluateCondition(cond("equals", "free"), ctx)).toBe(false);
  });

  it("not_equals", () => {
    expect(evaluateCondition(cond("not_equals", "free"), ctx)).toBe(true);
  });

  it("contains", () => {
    expect(evaluateCondition(cond("contains", "example", "email"), ctx)).toBe(true);
    expect(evaluateCondition(cond("contains", "gmail", "email"), ctx)).toBe(false);
  });

  it("not_contains", () => {
    expect(evaluateCondition(cond("not_contains", "gmail", "email"), ctx)).toBe(true);
  });

  it("starts_with", () => {
    expect(evaluateCondition(cond("starts_with", "u@", "email"), ctx)).toBe(true);
    expect(evaluateCondition(cond("starts_with", "x@", "email"), ctx)).toBe(false);
  });

  it("ends_with", () => {
    expect(evaluateCondition(cond("ends_with", ".com", "email"), ctx)).toBe(true);
  });

  it("in", () => {
    expect(evaluateCondition(cond("in", ["pro", "enterprise"]), ctx)).toBe(true);
    expect(evaluateCondition(cond("in", ["free", "basic"]), ctx)).toBe(false);
  });

  it("not_in", () => {
    expect(evaluateCondition(cond("not_in", ["free", "basic"]), ctx)).toBe(true);
  });

  it("gt/gte/lt/lte", () => {
    expect(evaluateCondition(cond("gt", 20, "age"), ctx)).toBe(true);
    expect(evaluateCondition(cond("gte", 25, "age"), ctx)).toBe(true);
    expect(evaluateCondition(cond("lt", 30, "age"), ctx)).toBe(true);
    expect(evaluateCondition(cond("lte", 25, "age"), ctx)).toBe(true);
    expect(evaluateCondition(cond("gt", 30, "age"), ctx)).toBe(false);
  });

  it("matches regex", () => {
    expect(evaluateCondition(cond("matches", "^u@.*\\.com$", "email"), ctx)).toBe(true);
    expect(evaluateCondition(cond("matches", "^admin@", "email"), ctx)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateRule
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateRule", () => {
  it("returns true when all conditions match (AND)", () => {
    const rule = makeRule({
      conditions: [
        { id: "c1", attribute: "plan", operator: "equals", value: "pro" },
        { id: "c2", attribute: "age", operator: "gte", value: 18 },
      ],
    });
    expect(evaluateRule(rule, ctx)).toBe(true);
  });

  it("returns false when any condition fails", () => {
    const rule = makeRule({
      conditions: [
        { id: "c1", attribute: "plan", operator: "equals", value: "pro" },
        { id: "c2", attribute: "age", operator: "gt", value: 30 }, // fails
      ],
    });
    expect(evaluateRule(rule, ctx)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateFlag
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateFlag", () => {
  it("returns default variation when disabled", () => {
    const flag = makeFlag({ enabled: false });
    const result = evaluateFlag(flag, ctx);
    expect(result.reason).toBe("disabled");
    expect(result.value).toBe(false);
  });

  it("returns default when no rules match", () => {
    const flag = makeFlag();
    const result = evaluateFlag(flag, ctx);
    expect(result.reason).toBe("default");
    expect(result.value).toBe(false);
  });

  it("returns matched rule variation", () => {
    const flag = makeFlag({ rules: [makeRule()] });
    const result = evaluateFlag(flag, ctx);
    expect(result.reason).toBe("rule");
    expect(result.value).toBe(true);
    expect(result.ruleId).toBe("rule1");
  });

  it("evaluates rules in priority order", () => {
    const rule1 = makeRule({ id: "r1", variationId: "off", priority: 2 });
    const rule2 = makeRule({ id: "r2", variationId: "on", priority: 1 });
    const flag = makeFlag({ rules: [rule1, rule2] });
    const result = evaluateFlag(flag, ctx);
    expect(result.ruleId).toBe("r2"); // lower priority number = evaluated first
    expect(result.value).toBe(true);
  });

  it("applies override", () => {
    const flag = makeFlag();
    const result = evaluateFlag(flag, ctx, { flag1: "on" });
    expect(result.reason).toBe("override");
    expect(result.value).toBe(true);
  });

  it("respects rollout (100% always serves)", () => {
    const flag = makeFlag({ rolloutPercent: 100 });
    const result = evaluateFlag(flag, ctx);
    // Should not be blocked by rollout
    expect(["default", "rule", "rollout"]).toContain(result.reason);
  });

  it("returns default for users outside rollout", () => {
    // Find a key that hashes to >= 1 (almost certainly any key)
    const flag = makeFlag({ rolloutPercent: 0 }); // 0% rollout = nobody gets it
    const result = evaluateFlag(flag, { userId: "u999" });
    expect(result.reason).toBe("default");
  });
});

describe("evaluateAllFlags", () => {
  it("evaluates all flags", () => {
    const flags = [makeFlag({ id: "f1" }), makeFlag({ id: "f2" })];
    const results = evaluateAllFlags(flags, ctx);
    expect(results.size).toBe(2);
    expect(results.has("f1")).toBe(true);
    expect(results.has("f2")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createBooleanFlag / toggleFlag / addRule / removeRule / setRollout / archiveFlag
// ─────────────────────────────────────────────────────────────────────────────

describe("createBooleanFlag", () => {
  it("creates a disabled-by-default boolean flag", () => {
    const flag = createBooleanFlag("ff1", "My Flag", false);
    expect(flag.type).toBe("boolean");
    expect(flag.defaultVariationId).toBe("off");
    expect(flag.enabled).toBe(true); // flag is active, just default=off
  });

  it("creates an enabled-by-default flag", () => {
    const flag = createBooleanFlag("ff1", "My Flag", true);
    expect(flag.defaultVariationId).toBe("on");
  });
});

describe("toggleFlag", () => {
  it("disables a flag", () => {
    const flag = makeFlag({ enabled: true });
    expect(toggleFlag(flag, false).enabled).toBe(false);
  });

  it("enables a flag", () => {
    const flag = makeFlag({ enabled: false });
    expect(toggleFlag(flag, true).enabled).toBe(true);
  });
});

describe("addRule / removeRule", () => {
  it("adds a rule", () => {
    const flag = makeFlag();
    const updated = addRule(flag, makeRule());
    expect(updated.rules).toHaveLength(1);
    expect(flag.rules).toHaveLength(0); // immutable
  });

  it("removes a rule by id", () => {
    const flag = makeFlag({ rules: [makeRule()] });
    const updated = removeRule(flag, "rule1");
    expect(updated.rules).toHaveLength(0);
  });
});

describe("setRollout", () => {
  it("clamps to 0–100", () => {
    expect(setRollout(makeFlag(), 150).rolloutPercent).toBe(100);
    expect(setRollout(makeFlag(), -10).rolloutPercent).toBe(0);
    expect(setRollout(makeFlag(), 50).rolloutPercent).toBe(50);
  });
});

describe("archiveFlag", () => {
  it("disables and stamps archivedAt", () => {
    const at = new Date("2025-06-01");
    const archived = archiveFlag(makeFlag(), at);
    expect(archived.enabled).toBe(false);
    expect(archived.archivedAt).toEqual(at);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateFlag
// ─────────────────────────────────────────────────────────────────────────────

describe("validateFlag", () => {
  it("validates a correct flag", () => {
    expect(validateFlag(makeFlag()).valid).toBe(true);
  });

  it("rejects empty id", () => {
    expect(validateFlag(makeFlag({ id: "" })).valid).toBe(false);
  });

  it("rejects missing variations", () => {
    expect(validateFlag(makeFlag({ variations: [] })).valid).toBe(false);
  });

  it("rejects defaultVariationId not in variations", () => {
    expect(validateFlag(makeFlag({ defaultVariationId: "nonexistent" })).valid).toBe(false);
  });

  it("rejects rule pointing to unknown variation", () => {
    const rule = makeRule({ variationId: "ghost" });
    expect(validateFlag(makeFlag({ rules: [rule] })).valid).toBe(false);
  });

  it("rejects rule with no conditions", () => {
    const rule = makeRule({ conditions: [] });
    expect(validateFlag(makeFlag({ rules: [rule] })).valid).toBe(false);
  });

  it("rejects invalid rolloutPercent", () => {
    expect(validateFlag(makeFlag({ rolloutPercent: 110 })).valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeFlagStats
// ─────────────────────────────────────────────────────────────────────────────

describe("computeFlagStats", () => {
  it("handles empty", () => {
    expect(computeFlagStats([]).totalFlags).toBe(0);
  });

  it("counts enabled/disabled/archived", () => {
    const flags = [
      makeFlag({ enabled: true }),
      makeFlag({ enabled: false }),
      archiveFlag(makeFlag()),
    ];
    const stats = computeFlagStats(flags);
    expect(stats.totalFlags).toBe(3);
    expect(stats.enabledFlags).toBe(1);
    expect(stats.disabledFlags).toBe(2); // disabled + archived (archived sets enabled=false)
    expect(stats.archivedFlags).toBe(1);
  });

  it("counts flags with rules and rollout", () => {
    const flags = [
      makeFlag({ rules: [makeRule()] }),
      makeFlag({ rolloutPercent: 50 }),
      makeFlag(),
    ];
    const stats = computeFlagStats(flags);
    expect(stats.flagsWithRules).toBe(1);
    expect(stats.flagsWithRollout).toBe(1);
  });

  it("counts by type", () => {
    const flags = [
      makeFlag({ type: "boolean" }),
      makeFlag({ type: "boolean" }),
      makeFlag({ type: "string" }),
    ];
    const stats = computeFlagStats(flags);
    expect(stats.byType.boolean).toBe(2);
    expect(stats.byType.string).toBe(1);
  });
});
