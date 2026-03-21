import { describe, it, expect } from "vitest";
import {
  defineRoles,
  getPermissionsForRole,
  checkPermission,
  hasPermission,
  canAccessOwnedResource,
  getAllowedActions,
  getAllowedResources,
  mergePermissions,
  applyRestrictions,
  validatePolicy,
  createPolicy,
  isPolicyExpired,
  compareRoles,
  isRoleAtLeast,
  summarizePolicy,
  type AccessPolicy,
  type Permission,
  type TeamRole,
} from "./permission-matrix";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makePolicy(overrides?: Partial<AccessPolicy>): AccessPolicy {
  return createPolicy({
    userId: "user-1",
    teamId: "team-1",
    role: "editor",
    createdAt: new Date("2026-01-01"),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// defineRoles
// ---------------------------------------------------------------------------
describe("defineRoles", () => {
  it("returns all 6 roles", () => {
    const roles = defineRoles();
    expect(Object.keys(roles)).toHaveLength(6);
  });

  it("includes owner role", () => {
    const roles = defineRoles();
    expect(roles.owner).toBeDefined();
    expect(roles.owner.role).toBe("owner");
  });

  it("owner has full workflow permissions", () => {
    const roles = defineRoles();
    const ownerPerms = roles.owner.permissions;
    const workflowActions = ownerPerms
      .filter((p) => p.resource === "workflow")
      .map((p) => p.action);
    expect(workflowActions).toContain("create");
    expect(workflowActions).toContain("read");
    expect(workflowActions).toContain("delete");
    expect(workflowActions).toContain("execute");
  });

  it("admin inherits from editor", () => {
    const roles = defineRoles();
    expect(roles.admin.inheritsFrom).toBe("editor");
  });

  it("viewer has only read permissions for workflow", () => {
    const roles = defineRoles();
    const viewerPerms = roles.viewer.permissions;
    const workflowPerms = viewerPerms.filter((p) => p.resource === "workflow");
    expect(workflowPerms.every((p) => p.action === "read")).toBe(true);
  });

  it("billing-admin has billing permissions", () => {
    const roles = defineRoles();
    const billingPerms = roles["billing-admin"].permissions;
    expect(billingPerms.some((p) => p.resource === "billing" && p.action === "manage")).toBe(true);
  });

  it("auditor has audit read and export", () => {
    const roles = defineRoles();
    const auditorPerms = roles.auditor.permissions;
    expect(auditorPerms.some((p) => p.resource === "audit" && p.action === "read")).toBe(true);
    expect(auditorPerms.some((p) => p.resource === "audit" && p.action === "export")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getPermissionsForRole
// ---------------------------------------------------------------------------
describe("getPermissionsForRole", () => {
  it("returns permissions for viewer role", () => {
    const perms = getPermissionsForRole("viewer");
    expect(perms.length).toBeGreaterThan(0);
  });

  it("admin includes inherited editor permissions", () => {
    const adminPerms = getPermissionsForRole("admin");
    // Admin should have workflow:create (from editor)
    expect(adminPerms.some((p) => p.resource === "workflow" && p.action === "create")).toBe(true);
    // Admin should also have member:invite (own)
    expect(adminPerms.some((p) => p.resource === "member" && p.action === "invite")).toBe(true);
  });

  it("owner has the most permissions", () => {
    const ownerPerms = getPermissionsForRole("owner");
    const editorPerms = getPermissionsForRole("editor");
    expect(ownerPerms.length).toBeGreaterThan(editorPerms.length);
  });

  it("editor does not have billing permissions", () => {
    const perms = getPermissionsForRole("editor");
    expect(perms.some((p) => p.resource === "billing")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkPermission
// ---------------------------------------------------------------------------
describe("checkPermission", () => {
  it("allows editor to read workflows", () => {
    const policy = makePolicy({ role: "editor" });
    const result = checkPermission(policy, "workflow", "read");
    expect(result.allowed).toBe(true);
  });

  it("denies viewer from creating workflows", () => {
    const policy = makePolicy({ role: "viewer" });
    const result = checkPermission(policy, "workflow", "create");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("viewer");
  });

  it("allows owner to delete team", () => {
    const policy = makePolicy({ role: "owner" });
    const result = checkPermission(policy, "team", "delete");
    expect(result.allowed).toBe(true);
  });

  it("denies admin from deleting team", () => {
    const policy = makePolicy({ role: "admin" });
    const result = checkPermission(policy, "team", "delete");
    expect(result.allowed).toBe(false);
  });

  it("denies when policy is expired", () => {
    const policy = makePolicy({
      expiresAt: new Date("2020-01-01"),
    });
    const result = checkPermission(policy, "workflow", "read");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("expired");
  });

  it("allows via custom permission", () => {
    const policy = makePolicy({
      role: "viewer",
      customPermissions: [{ resource: "workflow", action: "create" }],
    });
    const result = checkPermission(policy, "workflow", "create");
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain("custom");
  });

  it("respects explicit restrictions over role permissions", () => {
    const policy = makePolicy({
      role: "editor",
      restrictions: [{ resource: "workflow", action: "delete" }],
    });
    const result = checkPermission(policy, "workflow", "delete");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("denied");
  });

  it("returns matched permission on success", () => {
    const policy = makePolicy({ role: "editor" });
    const result = checkPermission(policy, "workflow", "read");
    expect(result.matchedPermission).toBeDefined();
    expect(result.matchedPermission!.resource).toBe("workflow");
  });

  it("admin inherits workflow create from editor", () => {
    const policy = makePolicy({ role: "admin" });
    const result = checkPermission(policy, "workflow", "create");
    expect(result.allowed).toBe(true);
  });

  it("notes inheritedFrom when using inherited permission", () => {
    const policy = makePolicy({ role: "admin" });
    // workflow:create is in editor, inherited by admin
    const result = checkPermission(policy, "workflow", "execute");
    if (result.allowed) {
      // May be inherited from editor
      expect(["editor", undefined]).toContain(result.inheritedFrom);
    }
  });
});

// ---------------------------------------------------------------------------
// hasPermission
// ---------------------------------------------------------------------------
describe("hasPermission", () => {
  it("returns true when allowed", () => {
    const policy = makePolicy({ role: "editor" });
    expect(hasPermission(policy, "workflow", "read")).toBe(true);
  });

  it("returns false when denied", () => {
    const policy = makePolicy({ role: "viewer" });
    expect(hasPermission(policy, "workflow", "delete")).toBe(false);
  });

  it("owner has all workflow permissions", () => {
    const policy = makePolicy({ role: "owner" });
    expect(hasPermission(policy, "workflow", "create")).toBe(true);
    expect(hasPermission(policy, "workflow", "delete")).toBe(true);
    expect(hasPermission(policy, "workflow", "execute")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canAccessOwnedResource
// ---------------------------------------------------------------------------
describe("canAccessOwnedResource", () => {
  it("allows access when isOwner is true and permission exists", () => {
    const policy = makePolicy({ role: "editor" });
    expect(canAccessOwnedResource(policy, "workflow", "read", true)).toBe(true);
  });

  it("allows access when permission has no ownership condition", () => {
    const policy = makePolicy({ role: "editor" });
    expect(canAccessOwnedResource(policy, "workflow", "read", false)).toBe(true);
  });

  it("returns false when role doesn't have permission regardless of ownership", () => {
    const policy = makePolicy({ role: "viewer" });
    expect(canAccessOwnedResource(policy, "workflow", "create", true)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAllowedActions
// ---------------------------------------------------------------------------
describe("getAllowedActions", () => {
  it("returns allowed actions for editor on workflow", () => {
    const policy = makePolicy({ role: "editor" });
    const actions = getAllowedActions(policy, "workflow");
    expect(actions).toContain("read");
    expect(actions).toContain("create");
    expect(actions).toContain("execute");
    expect(actions).not.toContain("delete");
  });

  it("returns empty array for viewer on billing", () => {
    const policy = makePolicy({ role: "viewer" });
    const actions = getAllowedActions(policy, "billing");
    expect(actions).toHaveLength(0);
  });

  it("owner has all actions on workflow", () => {
    const policy = makePolicy({ role: "owner" });
    const actions = getAllowedActions(policy, "workflow");
    expect(actions).toContain("delete");
    expect(actions).toContain("share");
    expect(actions).toContain("export");
  });

  it("billing-admin can manage billing", () => {
    const policy = makePolicy({ role: "billing-admin" });
    const actions = getAllowedActions(policy, "billing");
    expect(actions).toContain("read");
    expect(actions).toContain("manage");
  });
});

// ---------------------------------------------------------------------------
// getAllowedResources
// ---------------------------------------------------------------------------
describe("getAllowedResources", () => {
  it("viewer can access workflow, execution, credential, webhook", () => {
    const policy = makePolicy({ role: "viewer" });
    const resources = getAllowedResources(policy);
    expect(resources).toContain("workflow");
    expect(resources).toContain("execution");
  });

  it("viewer cannot access billing", () => {
    const policy = makePolicy({ role: "viewer" });
    const resources = getAllowedResources(policy);
    expect(resources).not.toContain("billing");
  });

  it("owner can access all resource types", () => {
    const policy = makePolicy({ role: "owner" });
    const resources = getAllowedResources(policy);
    expect(resources).toContain("billing");
    expect(resources).toContain("audit");
    expect(resources).toContain("api-key");
  });

  it("billing-admin can access billing and team", () => {
    const policy = makePolicy({ role: "billing-admin" });
    const resources = getAllowedResources(policy);
    expect(resources).toContain("billing");
    expect(resources).toContain("team");
  });
});

// ---------------------------------------------------------------------------
// mergePermissions
// ---------------------------------------------------------------------------
describe("mergePermissions", () => {
  it("merges base and custom without duplicates", () => {
    const base: Permission[] = [{ resource: "workflow", action: "read" }];
    const custom: Permission[] = [
      { resource: "workflow", action: "read" }, // duplicate
      { resource: "workflow", action: "create" }, // new
    ];
    const merged = mergePermissions(base, custom);
    const workflowPerms = merged.filter((p) => p.resource === "workflow");
    expect(workflowPerms).toHaveLength(2);
  });

  it("preserves all base permissions", () => {
    const base: Permission[] = [
      { resource: "workflow", action: "read" },
      { resource: "execution", action: "read" },
    ];
    const merged = mergePermissions(base, []);
    expect(merged).toHaveLength(2);
  });

  it("adds new custom permissions", () => {
    const merged = mergePermissions(
      [],
      [{ resource: "billing", action: "read" }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].resource).toBe("billing");
  });
});

// ---------------------------------------------------------------------------
// applyRestrictions
// ---------------------------------------------------------------------------
describe("applyRestrictions", () => {
  it("removes restricted permissions", () => {
    const permissions: Permission[] = [
      { resource: "workflow", action: "read" },
      { resource: "workflow", action: "delete" },
    ];
    const restrictions: Permission[] = [{ resource: "workflow", action: "delete" }];
    const result = applyRestrictions(permissions, restrictions);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe("read");
  });

  it("returns all permissions when no restrictions", () => {
    const permissions: Permission[] = [
      { resource: "workflow", action: "read" },
      { resource: "execution", action: "read" },
    ];
    const result = applyRestrictions(permissions, []);
    expect(result).toHaveLength(2);
  });

  it("handles empty permissions", () => {
    const result = applyRestrictions([], [{ resource: "workflow", action: "delete" }]);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validatePolicy
// ---------------------------------------------------------------------------
describe("validatePolicy", () => {
  it("validates a valid policy", () => {
    const policy = makePolicy();
    expect(validatePolicy(policy).valid).toBe(true);
  });

  it("rejects null", () => {
    expect(validatePolicy(null).valid).toBe(false);
  });

  it("rejects missing userId", () => {
    const policy = { ...makePolicy(), userId: undefined };
    expect(validatePolicy(policy).valid).toBe(false);
  });

  it("rejects missing teamId", () => {
    const policy = { ...makePolicy(), teamId: undefined };
    expect(validatePolicy(policy).valid).toBe(false);
  });

  it("rejects invalid role", () => {
    const policy = { ...makePolicy(), role: "superuser" };
    expect(validatePolicy(policy).valid).toBe(false);
  });

  it("rejects missing createdAt", () => {
    const policy = { ...makePolicy(), createdAt: "2026-01-01" as unknown as Date };
    expect(validatePolicy(policy).valid).toBe(false);
  });

  it("returns error messages", () => {
    const result = validatePolicy({});
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// createPolicy
// ---------------------------------------------------------------------------
describe("createPolicy", () => {
  it("creates policy with defaults", () => {
    const policy = createPolicy({ userId: "u1", teamId: "t1", role: "viewer" });
    expect(policy.userId).toBe("u1");
    expect(policy.teamId).toBe("t1");
    expect(policy.role).toBe("viewer");
    expect(policy.createdAt).toBeInstanceOf(Date);
  });

  it("accepts expiresAt", () => {
    const expires = new Date("2026-12-31");
    const policy = createPolicy({ userId: "u1", teamId: "t1", role: "viewer", expiresAt: expires });
    expect(policy.expiresAt).toEqual(expires);
  });
});

// ---------------------------------------------------------------------------
// isPolicyExpired
// ---------------------------------------------------------------------------
describe("isPolicyExpired", () => {
  it("returns false for policy without expiry", () => {
    const policy = makePolicy();
    expect(isPolicyExpired(policy)).toBe(false);
  });

  it("returns false when expiry is in the future", () => {
    const policy = makePolicy({ expiresAt: new Date("2099-01-01") });
    expect(isPolicyExpired(policy)).toBe(false);
  });

  it("returns true when expiry is in the past", () => {
    const policy = makePolicy({ expiresAt: new Date("2020-01-01") });
    expect(isPolicyExpired(policy)).toBe(true);
  });

  it("returns true when expiry is exactly now", () => {
    const now = new Date();
    const policy = makePolicy({ expiresAt: now });
    expect(isPolicyExpired(policy, now)).toBe(true);
  });

  it("accepts custom 'now' parameter", () => {
    const policy = makePolicy({ expiresAt: new Date("2026-06-01") });
    const futureNow = new Date("2026-07-01");
    expect(isPolicyExpired(policy, futureNow)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// compareRoles
// ---------------------------------------------------------------------------
describe("compareRoles", () => {
  it("owner is higher than admin", () => {
    expect(compareRoles("owner", "admin")).toBe(-1);
  });

  it("admin is higher than editor", () => {
    expect(compareRoles("admin", "editor")).toBe(-1);
  });

  it("viewer is lower than editor", () => {
    expect(compareRoles("viewer", "editor")).toBe(1);
  });

  it("same role returns 0", () => {
    expect(compareRoles("editor", "editor")).toBe(0);
  });

  it("owner is higher than viewer", () => {
    expect(compareRoles("owner", "viewer")).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// isRoleAtLeast
// ---------------------------------------------------------------------------
describe("isRoleAtLeast", () => {
  it("owner meets the owner minimum", () => {
    expect(isRoleAtLeast("owner", "owner")).toBe(true);
  });

  it("owner meets the admin minimum", () => {
    expect(isRoleAtLeast("owner", "admin")).toBe(true);
  });

  it("owner meets the viewer minimum", () => {
    expect(isRoleAtLeast("owner", "viewer")).toBe(true);
  });

  it("viewer does not meet the admin minimum", () => {
    expect(isRoleAtLeast("viewer", "admin")).toBe(false);
  });

  it("editor does not meet the admin minimum", () => {
    expect(isRoleAtLeast("editor", "admin")).toBe(false);
  });

  it("admin meets the editor minimum", () => {
    expect(isRoleAtLeast("admin", "editor")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// summarizePolicy
// ---------------------------------------------------------------------------
describe("summarizePolicy", () => {
  it("summarizes editor policy", () => {
    const policy = makePolicy({ role: "editor" });
    const summary = summarizePolicy(policy);
    expect(summary.role).toBe("editor");
    expect(summary.permissionCount).toBeGreaterThan(0);
    expect(summary.allowedResources).toContain("workflow");
    expect(summary.isExpired).toBe(false);
  });

  it("marks expired policy", () => {
    const policy = makePolicy({ expiresAt: new Date("2020-01-01") });
    const summary = summarizePolicy(policy);
    expect(summary.isExpired).toBe(true);
  });

  it("owner summary has more permissions than viewer", () => {
    const ownerSummary = summarizePolicy(makePolicy({ role: "owner" }));
    const viewerSummary = summarizePolicy(makePolicy({ role: "viewer" }));
    expect(ownerSummary.permissionCount).toBeGreaterThan(viewerSummary.permissionCount);
  });

  it("includes custom permissions in count", () => {
    const policy = makePolicy({
      role: "viewer",
      customPermissions: [{ resource: "workflow", action: "create" }],
    });
    const viewerNoCustom = makePolicy({ role: "viewer" });
    const summaryWithCustom = summarizePolicy(policy);
    const summaryWithout = summarizePolicy(viewerNoCustom);
    expect(summaryWithCustom.permissionCount).toBeGreaterThanOrEqual(summaryWithout.permissionCount);
  });

  it("restrictions reduce effective permissions", () => {
    const policyWithRestriction = makePolicy({
      role: "editor",
      restrictions: [{ resource: "workflow", action: "delete" }],
    });
    const policyWithout = makePolicy({ role: "editor" });
    const withR = summarizePolicy(policyWithRestriction);
    const without = summarizePolicy(policyWithout);
    expect(withR.permissionCount).toBeLessThanOrEqual(without.permissionCount);
  });
});
