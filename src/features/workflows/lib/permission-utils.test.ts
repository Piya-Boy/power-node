import { describe, it, expect } from "vitest";
import {
  ROLE_PERMISSIONS,
  ROLE_HIERARCHY,
  hasPermission,
  getRolePermissions,
  canPerformAction,
  isAtLeastRole,
  getRoleLabel,
  getRoleDescription,
  type Role,
  type Permission,
} from "./permission-utils";

const ALL_PERMISSIONS: Permission[] = [
  "workflow:read",
  "workflow:create",
  "workflow:update",
  "workflow:delete",
  "workflow:execute",
  "credential:read",
  "credential:create",
  "credential:update",
  "credential:delete",
  "member:read",
  "member:invite",
  "member:remove",
  "member:update_role",
  "apikey:read",
  "apikey:create",
  "apikey:delete",
  "project:read",
  "project:update",
  "project:delete",
];

describe("ROLE_PERMISSIONS", () => {
  it("owner should have all permissions", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(ROLE_PERMISSIONS.owner).toContain(permission);
    }
  });

  it("admin should have all permissions except project:delete", () => {
    for (const permission of ALL_PERMISSIONS) {
      if (permission === "project:delete") {
        expect(ROLE_PERMISSIONS.admin).not.toContain(permission);
      } else {
        expect(ROLE_PERMISSIONS.admin).toContain(permission);
      }
    }
  });

  it("editor should have workflow permissions", () => {
    expect(ROLE_PERMISSIONS.editor).toContain("workflow:read");
    expect(ROLE_PERMISSIONS.editor).toContain("workflow:create");
    expect(ROLE_PERMISSIONS.editor).toContain("workflow:update");
    expect(ROLE_PERMISSIONS.editor).toContain("workflow:delete");
    expect(ROLE_PERMISSIONS.editor).toContain("workflow:execute");
  });

  it("editor should not have project:delete or project:update", () => {
    expect(ROLE_PERMISSIONS.editor).not.toContain("project:delete");
    expect(ROLE_PERMISSIONS.editor).not.toContain("project:update");
  });

  it("editor should not have credential:delete", () => {
    expect(ROLE_PERMISSIONS.editor).not.toContain("credential:delete");
  });

  it("editor should not have member management permissions", () => {
    expect(ROLE_PERMISSIONS.editor).not.toContain("member:invite");
    expect(ROLE_PERMISSIONS.editor).not.toContain("member:remove");
    expect(ROLE_PERMISSIONS.editor).not.toContain("member:update_role");
  });

  it("viewer should only have read/execute permissions", () => {
    const viewerPerms = ROLE_PERMISSIONS.viewer;
    expect(viewerPerms).toContain("workflow:read");
    expect(viewerPerms).toContain("workflow:execute");
    expect(viewerPerms).toContain("credential:read");
    expect(viewerPerms).toContain("member:read");
    expect(viewerPerms).toContain("apikey:read");
    expect(viewerPerms).toContain("project:read");
  });

  it("viewer should not have any write or delete permissions", () => {
    const writeOrDelete: Permission[] = [
      "workflow:create",
      "workflow:update",
      "workflow:delete",
      "credential:create",
      "credential:update",
      "credential:delete",
      "member:invite",
      "member:remove",
      "member:update_role",
      "apikey:create",
      "apikey:delete",
      "project:update",
      "project:delete",
    ];
    for (const perm of writeOrDelete) {
      expect(ROLE_PERMISSIONS.viewer).not.toContain(perm);
    }
  });
});

describe("hasPermission", () => {
  it("owner can perform every action", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(hasPermission("owner", permission)).toBe(true);
    }
  });

  it("viewer can read workflows", () => {
    expect(hasPermission("viewer", "workflow:read")).toBe(true);
  });

  it("viewer cannot delete workflows", () => {
    expect(hasPermission("viewer", "workflow:delete")).toBe(false);
  });

  it("viewer cannot delete credentials", () => {
    expect(hasPermission("viewer", "credential:delete")).toBe(false);
  });

  it("viewer cannot invite members", () => {
    expect(hasPermission("viewer", "member:invite")).toBe(false);
  });

  it("editor can create workflows", () => {
    expect(hasPermission("editor", "workflow:create")).toBe(true);
  });

  it("editor cannot update project", () => {
    expect(hasPermission("editor", "project:update")).toBe(false);
  });

  it("admin cannot delete project", () => {
    expect(hasPermission("admin", "project:delete")).toBe(false);
  });

  it("admin can update project", () => {
    expect(hasPermission("admin", "project:update")).toBe(true);
  });
});

describe("getRolePermissions", () => {
  it("should return the correct permissions array for each role", () => {
    const roles: Role[] = ["owner", "admin", "editor", "viewer"];
    for (const role of roles) {
      expect(getRolePermissions(role)).toEqual(ROLE_PERMISSIONS[role]);
    }
  });

  it("should return an array for owner", () => {
    expect(Array.isArray(getRolePermissions("owner"))).toBe(true);
  });

  it("owner should have more permissions than viewer", () => {
    expect(getRolePermissions("owner").length).toBeGreaterThan(
      getRolePermissions("viewer").length,
    );
  });
});

describe("canPerformAction", () => {
  it("should be consistent with hasPermission for owner", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(canPerformAction("owner", permission)).toBe(
        hasPermission("owner", permission),
      );
    }
  });

  it("should be consistent with hasPermission for viewer", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(canPerformAction("viewer", permission)).toBe(
        hasPermission("viewer", permission),
      );
    }
  });

  it("viewer cannot delete apikeys via canPerformAction", () => {
    expect(canPerformAction("viewer", "apikey:delete")).toBe(false);
  });

  it("editor can create apikeys via canPerformAction", () => {
    expect(canPerformAction("editor", "apikey:create")).toBe(true);
  });
});

describe("isAtLeastRole", () => {
  it("owner is at least all roles", () => {
    expect(isAtLeastRole("owner", "owner")).toBe(true);
    expect(isAtLeastRole("owner", "admin")).toBe(true);
    expect(isAtLeastRole("owner", "editor")).toBe(true);
    expect(isAtLeastRole("owner", "viewer")).toBe(true);
  });

  it("admin is at least admin, editor, viewer but not owner", () => {
    expect(isAtLeastRole("admin", "owner")).toBe(false);
    expect(isAtLeastRole("admin", "admin")).toBe(true);
    expect(isAtLeastRole("admin", "editor")).toBe(true);
    expect(isAtLeastRole("admin", "viewer")).toBe(true);
  });

  it("editor is at least editor and viewer but not admin or owner", () => {
    expect(isAtLeastRole("editor", "owner")).toBe(false);
    expect(isAtLeastRole("editor", "admin")).toBe(false);
    expect(isAtLeastRole("editor", "editor")).toBe(true);
    expect(isAtLeastRole("editor", "viewer")).toBe(true);
  });

  it("viewer is only at least viewer", () => {
    expect(isAtLeastRole("viewer", "owner")).toBe(false);
    expect(isAtLeastRole("viewer", "admin")).toBe(false);
    expect(isAtLeastRole("viewer", "editor")).toBe(false);
    expect(isAtLeastRole("viewer", "viewer")).toBe(true);
  });
});

describe("ROLE_HIERARCHY", () => {
  it("owner should have highest value", () => {
    const roles: Role[] = ["admin", "editor", "viewer"];
    for (const role of roles) {
      expect(ROLE_HIERARCHY.owner).toBeGreaterThan(ROLE_HIERARCHY[role]);
    }
  });

  it("viewer should have lowest value", () => {
    const roles: Role[] = ["owner", "admin", "editor"];
    for (const role of roles) {
      expect(ROLE_HIERARCHY.viewer).toBeLessThan(ROLE_HIERARCHY[role]);
    }
  });

  it("hierarchy values should be strictly ordered", () => {
    expect(ROLE_HIERARCHY.owner).toBeGreaterThan(ROLE_HIERARCHY.admin);
    expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.editor);
    expect(ROLE_HIERARCHY.editor).toBeGreaterThan(ROLE_HIERARCHY.viewer);
  });
});

describe("getRoleLabel", () => {
  it("should return non-empty label for all roles", () => {
    const roles: Role[] = ["owner", "admin", "editor", "viewer"];
    for (const role of roles) {
      const label = getRoleLabel(role);
      expect(label).toBeTruthy();
      expect(typeof label).toBe("string");
    }
  });

  it("should return 'Owner' for owner", () => {
    expect(getRoleLabel("owner")).toBe("Owner");
  });

  it("should return 'Admin' for admin", () => {
    expect(getRoleLabel("admin")).toBe("Admin");
  });

  it("should return 'Editor' for editor", () => {
    expect(getRoleLabel("editor")).toBe("Editor");
  });

  it("should return 'Viewer' for viewer", () => {
    expect(getRoleLabel("viewer")).toBe("Viewer");
  });
});

describe("getRoleDescription", () => {
  it("should return non-empty description for all roles", () => {
    const roles: Role[] = ["owner", "admin", "editor", "viewer"];
    for (const role of roles) {
      const description = getRoleDescription(role);
      expect(description).toBeTruthy();
      expect(typeof description).toBe("string");
      expect(description.length).toBeGreaterThan(0);
    }
  });

  it("should return different descriptions for different roles", () => {
    const descriptions = new Set([
      getRoleDescription("owner"),
      getRoleDescription("admin"),
      getRoleDescription("editor"),
      getRoleDescription("viewer"),
    ]);
    expect(descriptions.size).toBe(4);
  });
});
