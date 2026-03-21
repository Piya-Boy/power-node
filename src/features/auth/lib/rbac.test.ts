import { describe, it, expect } from "vitest";
import {
  can,
  getAllowedActions,
  hasMinimumInstanceRole,
  getRolePermissions,
  isValidInstanceRole,
  maxRole,
  describeRole,
  type InstanceRole,
} from "./rbac";

describe("can", () => {
  it("super_admin can do everything", () => {
    expect(can("super_admin", "workflow", "delete")).toBe(true);
    expect(can("super_admin", "user", "manage")).toBe(true);
    expect(can("super_admin", "audit_log", "read")).toBe(true);
  });

  it("admin can read audit_log but not manage users", () => {
    expect(can("admin", "audit_log", "read")).toBe(true);
    expect(can("admin", "user", "delete")).toBe(false);
    expect(can("admin", "user", "manage")).toBe(false);
  });

  it("member can create workflows", () => {
    expect(can("member", "workflow", "create")).toBe(true);
    expect(can("member", "workflow", "execute")).toBe(true);
  });

  it("member cannot share workflows", () => {
    expect(can("member", "workflow", "share")).toBe(false);
  });

  it("viewer can only read workflows", () => {
    expect(can("viewer", "workflow", "read")).toBe(true);
    expect(can("viewer", "workflow", "create")).toBe(false);
    expect(can("viewer", "workflow", "delete")).toBe(false);
  });

  it("viewer cannot access credentials", () => {
    expect(can("viewer", "credential", "read")).toBe(false);
  });
});

describe("getAllowedActions", () => {
  it("returns all actions for super_admin on workflow", () => {
    const actions = getAllowedActions("super_admin", "workflow");
    expect(actions).toContain("read");
    expect(actions).toContain("delete");
    expect(actions).toContain("manage");
  });

  it("returns empty array for viewer on credential", () => {
    expect(getAllowedActions("viewer", "credential")).toEqual([]);
  });
});

describe("hasMinimumInstanceRole", () => {
  it("super_admin passes all minimum checks", () => {
    expect(hasMinimumInstanceRole("super_admin", "viewer")).toBe(true);
    expect(hasMinimumInstanceRole("super_admin", "admin")).toBe(true);
    expect(hasMinimumInstanceRole("super_admin", "super_admin")).toBe(true);
  });

  it("viewer fails member and above", () => {
    expect(hasMinimumInstanceRole("viewer", "member")).toBe(false);
    expect(hasMinimumInstanceRole("viewer", "admin")).toBe(false);
  });

  it("member passes viewer and member", () => {
    expect(hasMinimumInstanceRole("member", "viewer")).toBe(true);
    expect(hasMinimumInstanceRole("member", "member")).toBe(true);
    expect(hasMinimumInstanceRole("member", "admin")).toBe(false);
  });
});

describe("getRolePermissions", () => {
  it("returns permissions for all resources", () => {
    const perms = getRolePermissions("admin");
    expect(perms.workflow).toContain("create");
    expect(perms.audit_log).toContain("read");
    expect(perms.user).toContain("read");
  });

  it("viewer has empty credentials permissions", () => {
    const perms = getRolePermissions("viewer");
    expect(perms.credential).toEqual([]);
  });
});

describe("isValidInstanceRole", () => {
  it("returns true for valid roles", () => {
    expect(isValidInstanceRole("super_admin")).toBe(true);
    expect(isValidInstanceRole("admin")).toBe(true);
    expect(isValidInstanceRole("member")).toBe(true);
    expect(isValidInstanceRole("viewer")).toBe(true);
  });

  it("returns false for invalid roles", () => {
    expect(isValidInstanceRole("god")).toBe(false);
    expect(isValidInstanceRole("")).toBe(false);
    expect(isValidInstanceRole("ADMIN")).toBe(false);
  });
});

describe("maxRole", () => {
  it("returns the higher role", () => {
    expect(maxRole("viewer", "admin")).toBe("admin");
    expect(maxRole("member", "super_admin")).toBe("super_admin");
    expect(maxRole("admin", "member")).toBe("admin");
  });

  it("returns same role when equal", () => {
    expect(maxRole("member", "member")).toBe("member");
  });
});

describe("describeRole", () => {
  it("returns descriptions for all roles", () => {
    const roles: InstanceRole[] = ["super_admin", "admin", "member", "viewer"];
    for (const role of roles) {
      const desc = describeRole(role);
      expect(typeof desc).toBe("string");
      expect(desc.length).toBeGreaterThan(0);
    }
  });

  it("distinguishes between roles", () => {
    expect(describeRole("super_admin")).not.toBe(describeRole("viewer"));
  });
});
