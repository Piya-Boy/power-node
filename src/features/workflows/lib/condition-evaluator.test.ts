import { describe, it, expect } from "vitest";
import {
  extractField,
  evaluateSimple,
  evaluateCondition,
  simple,
  and,
  or,
  not,
  evaluateSwitch,
  filterData,
  partitionData,
  describeCondition,
  type SimpleCondition,
  type SwitchCase,
} from "./condition-evaluator";

// ─────────────────────────────────────────────────────────────────────────────
// extractField
// ─────────────────────────────────────────────────────────────────────────────

describe("extractField", () => {
  it("extracts top-level field", () => {
    expect(extractField({ name: "Alice" }, "name")).toBe("Alice");
  });

  it("extracts nested field", () => {
    expect(extractField({ user: { role: "admin" } }, "user.role")).toBe("admin");
  });

  it("returns undefined for missing path", () => {
    expect(extractField({}, "missing")).toBeUndefined();
    expect(extractField({ a: null }, "a.b")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateSimple — comparison operators
// ─────────────────────────────────────────────────────────────────────────────

const data = { name: "Alice", age: 30, active: true, tags: ["admin", "user"], score: null, bio: "" };

describe("evaluateSimple — ==", () => {
  it("matches equal values", () => expect(evaluateSimple(simple("name", "==", "Alice"), data).result).toBe(true));
  it("rejects unequal values", () => expect(evaluateSimple(simple("name", "==", "Bob"), data).result).toBe(false));
  it("loose equality string/number", () => expect(evaluateSimple(simple("age", "==", "30"), data).result).toBe(true));
});

describe("evaluateSimple — !=", () => {
  it("true when different", () => expect(evaluateSimple(simple("name", "!=", "Bob"), data).result).toBe(true));
  it("false when equal", () => expect(evaluateSimple(simple("name", "!=", "Alice"), data).result).toBe(false));
});

describe("evaluateSimple — > / >= / < / <=", () => {
  it("> passes", () => expect(evaluateSimple(simple("age", ">", 20), data).result).toBe(true));
  it("> fails", () => expect(evaluateSimple(simple("age", ">", 30), data).result).toBe(false));
  it(">= passes on equal", () => expect(evaluateSimple(simple("age", ">=", 30), data).result).toBe(true));
  it("< passes", () => expect(evaluateSimple(simple("age", "<", 40), data).result).toBe(true));
  it("<= passes on equal", () => expect(evaluateSimple(simple("age", "<=", 30), data).result).toBe(true));
});

describe("evaluateSimple — contains", () => {
  it("checks substring", () => expect(evaluateSimple(simple("name", "contains", "lic"), data).result).toBe(true));
  it("case-insensitive option", () => {
    const cond: SimpleCondition = { type: "simple", field: "name", operator: "contains", value: "ALICE", caseSensitive: false };
    expect(evaluateSimple(cond, data).result).toBe(true);
  });
  it("checks array membership", () => expect(evaluateSimple(simple("tags", "contains", "admin"), data).result).toBe(true));
  it("fails for missing", () => expect(evaluateSimple(simple("name", "contains", "xyz"), data).result).toBe(false));
});

describe("evaluateSimple — not_contains", () => {
  it("true when absent", () => expect(evaluateSimple(simple("name", "not_contains", "xyz"), data).result).toBe(true));
});

describe("evaluateSimple — starts_with / ends_with", () => {
  it("starts_with", () => expect(evaluateSimple(simple("name", "starts_with", "Al"), data).result).toBe(true));
  it("ends_with", () => expect(evaluateSimple(simple("name", "ends_with", "ce"), data).result).toBe(true));
  it("starts_with case-insensitive", () => {
    const cond: SimpleCondition = { type: "simple", field: "name", operator: "starts_with", value: "al", caseSensitive: false };
    expect(evaluateSimple(cond, data).result).toBe(true);
  });
});

describe("evaluateSimple — matches / not_matches", () => {
  it("matches regex", () => expect(evaluateSimple(simple("name", "matches", "^Al"), data).result).toBe(true));
  it("not_matches", () => expect(evaluateSimple(simple("name", "not_matches", "^Bob"), data).result).toBe(true));
});

describe("evaluateSimple — in / not_in", () => {
  it("in checks array membership", () => expect(evaluateSimple(simple("age", "in", [25, 30, 35]), data).result).toBe(true));
  it("not_in", () => expect(evaluateSimple(simple("age", "not_in", [10, 20]), data).result).toBe(true));
});

describe("evaluateSimple — is_null / is_not_null", () => {
  it("is_null passes for null", () => expect(evaluateSimple(simple("score", "is_null"), data).result).toBe(true));
  it("is_null fails for non-null", () => expect(evaluateSimple(simple("name", "is_null"), data).result).toBe(false));
  it("is_not_null passes for non-null", () => expect(evaluateSimple(simple("name", "is_not_null"), data).result).toBe(true));
});

describe("evaluateSimple — is_empty / is_not_empty", () => {
  it("is_empty for empty string", () => expect(evaluateSimple(simple("bio", "is_empty"), data).result).toBe(true));
  it("is_empty for null", () => expect(evaluateSimple(simple("score", "is_empty"), data).result).toBe(true));
  it("is_not_empty for non-empty string", () => expect(evaluateSimple(simple("name", "is_not_empty"), data).result).toBe(true));
  it("is_empty for empty array", () => {
    const d = { arr: [] };
    expect(evaluateSimple(simple("arr", "is_empty"), d).result).toBe(true);
  });
});

describe("evaluateSimple — is_true / is_false", () => {
  it("is_true", () => expect(evaluateSimple(simple("active", "is_true"), data).result).toBe(true));
  it("is_false", () => expect(evaluateSimple(simple("active", "is_false"), data).result).toBe(false));
  it("is_true for string 'true'", () => {
    expect(evaluateSimple(simple("flag", "is_true"), { flag: "true" }).result).toBe(true);
  });
});

describe("evaluateSimple — between", () => {
  it("true when in range", () => expect(evaluateSimple(simple("age", "between", [20, 40]), data).result).toBe(true));
  it("false when out of range", () => expect(evaluateSimple(simple("age", "between", [35, 45]), data).result).toBe(false));
  it("inclusive bounds", () => {
    expect(evaluateSimple(simple("age", "between", [30, 30]), data).result).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateCondition — compound
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateCondition — AND", () => {
  it("true when all match", () => {
    const cond = and(simple("age", ">=", 18), simple("active", "is_true"));
    expect(evaluateCondition(cond, data).result).toBe(true);
  });

  it("false when any fails", () => {
    const cond = and(simple("age", ">=", 18), simple("name", "==", "Bob"));
    expect(evaluateCondition(cond, data).result).toBe(false);
  });
});

describe("evaluateCondition — OR", () => {
  it("true when any matches", () => {
    const cond = or(simple("name", "==", "Bob"), simple("age", ">", 20));
    expect(evaluateCondition(cond, data).result).toBe(true);
  });

  it("false when none match", () => {
    const cond = or(simple("name", "==", "Bob"), simple("age", ">", 100));
    expect(evaluateCondition(cond, data).result).toBe(false);
  });
});

describe("evaluateCondition — NOT", () => {
  it("negates a condition", () => {
    const cond = not(simple("name", "==", "Bob"));
    expect(evaluateCondition(cond, data).result).toBe(true);
  });
});

describe("evaluateCondition — nested", () => {
  it("evaluates deeply nested conditions", () => {
    const cond = and(
      or(simple("name", "==", "Alice"), simple("name", "==", "Bob")),
      not(simple("age", ">", 100))
    );
    expect(evaluateCondition(cond, data).result).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateSwitch
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateSwitch", () => {
  const cases: SwitchCase[] = [
    { id: "admin", condition: simple("role", "==", "admin") },
    { id: "user", condition: simple("role", "==", "user") },
    { id: "default", condition: simple("role", "is_not_null") },
  ];

  it("returns first matching case", () => {
    const result = evaluateSwitch(cases, { role: "admin" });
    expect(result.matchedCaseId).toBe("admin");
  });

  it("falls through to default", () => {
    const result = evaluateSwitch(cases, { role: "guest" });
    expect(result.matchedCaseId).toBe("default");
  });

  it("returns undefined when no case matches", () => {
    const result = evaluateSwitch(
      [{ id: "c1", condition: simple("x", "==", 1) }],
      { x: 2 }
    );
    expect(result.matchedCaseId).toBeUndefined();
  });

  it("returns all results", () => {
    const result = evaluateSwitch(cases, { role: "user" });
    expect(result.allResults).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// filterData / partitionData
// ─────────────────────────────────────────────────────────────────────────────

describe("filterData", () => {
  const records = [
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
    { name: "Charlie", age: 35 },
  ];

  it("filters by condition", () => {
    const result = filterData(records, simple("age", ">=", 30));
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.name)).toEqual(["Alice", "Charlie"]);
  });

  it("returns empty when none match", () => {
    expect(filterData(records, simple("age", ">", 100))).toHaveLength(0);
  });
});

describe("partitionData", () => {
  const records = [
    { active: true },
    { active: false },
    { active: true },
  ];

  it("splits into matching and non-matching", () => {
    const { matching, nonMatching } = partitionData(records, simple("active", "is_true"));
    expect(matching).toHaveLength(2);
    expect(nonMatching).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// describeCondition
// ─────────────────────────────────────────────────────────────────────────────

describe("describeCondition", () => {
  it("describes simple condition", () => {
    const desc = describeCondition(simple("age", ">=", 18));
    expect(desc).toContain("age");
    expect(desc).toContain(">=");
    expect(desc).toContain("18");
  });

  it("describes AND condition", () => {
    const desc = describeCondition(and(simple("a", "==", 1), simple("b", "==", 2)));
    expect(desc).toContain("AND");
  });

  it("describes NOT condition", () => {
    const desc = describeCondition(not(simple("x", "is_null")));
    expect(desc).toContain("NOT");
  });
});
