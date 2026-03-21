import { describe, it, expect } from "vitest";
import {
  getMemberRole,
  hasMinimumRole,
  getProjectPermissions,
  upsertMember,
  removeMember,
  addWorkflowToProject,
  removeWorkflowFromProject,
  getAccessibleProjects,
  summarizeMembers,
  type Project,
  type ProjectMember,
} from "./project-utils";

const makeProject = (overrides: Partial<Project> = {}): Project => ({
  id: "proj-1",
  name: "Test Project",
  ownerId: "user-owner",
  members: [
    { userId: "user-admin", role: "admin", joinedAt: new Date() },
    { userId: "user-editor", role: "editor", joinedAt: new Date() },
    { userId: "user-viewer", role: "viewer", joinedAt: new Date() },
  ],
  workflowIds: ["wf-1", "wf-2"],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("getMemberRole", () => {
  const project = makeProject();

  it("returns owner for the owner", () => {
    expect(getMemberRole(project, "user-owner")).toBe("owner");
  });

  it("returns the correct role for members", () => {
    expect(getMemberRole(project, "user-admin")).toBe("admin");
    expect(getMemberRole(project, "user-editor")).toBe("editor");
    expect(getMemberRole(project, "user-viewer")).toBe("viewer");
  });

  it("returns null for non-members", () => {
    expect(getMemberRole(project, "user-stranger")).toBeNull();
  });
});

describe("hasMinimumRole", () => {
  it("returns true when role meets minimum", () => {
    expect(hasMinimumRole("owner", "viewer")).toBe(true);
    expect(hasMinimumRole("admin", "editor")).toBe(true);
    expect(hasMinimumRole("editor", "editor")).toBe(true);
  });

  it("returns false when role is below minimum", () => {
    expect(hasMinimumRole("viewer", "editor")).toBe(false);
    expect(hasMinimumRole("editor", "admin")).toBe(false);
    expect(hasMinimumRole("admin", "owner")).toBe(false);
  });

  it("returns false for null role", () => {
    expect(hasMinimumRole(null, "viewer")).toBe(false);
  });
});

describe("getProjectPermissions", () => {
  const project = makeProject();

  it("owner has all permissions", () => {
    const perms = getProjectPermissions(project, "user-owner");
    expect(perms.canView).toBe(true);
    expect(perms.canEdit).toBe(true);
    expect(perms.canExecute).toBe(true);
    expect(perms.canManageMembers).toBe(true);
    expect(perms.canDelete).toBe(true);
    expect(perms.canManageCredentials).toBe(true);
  });

  it("admin can manage members but not delete", () => {
    const perms = getProjectPermissions(project, "user-admin");
    expect(perms.canManageMembers).toBe(true);
    expect(perms.canDelete).toBe(false);
  });

  it("editor can edit but not manage members", () => {
    const perms = getProjectPermissions(project, "user-editor");
    expect(perms.canEdit).toBe(true);
    expect(perms.canManageMembers).toBe(false);
  });

  it("viewer can only view", () => {
    const perms = getProjectPermissions(project, "user-viewer");
    expect(perms.canView).toBe(true);
    expect(perms.canEdit).toBe(false);
    expect(perms.canExecute).toBe(false);
  });

  it("non-member has no permissions", () => {
    const perms = getProjectPermissions(project, "user-stranger");
    expect(perms.canView).toBe(false);
    expect(perms.canEdit).toBe(false);
  });
});

describe("upsertMember", () => {
  it("adds a new member", () => {
    const members: ProjectMember[] = [];
    const result = upsertMember(members, "user-new", "editor");
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe("user-new");
    expect(result[0].role).toBe("editor");
  });

  it("updates existing member role", () => {
    const members: ProjectMember[] = [
      { userId: "user-1", role: "viewer", joinedAt: new Date() },
    ];
    const result = upsertMember(members, "user-1", "admin");
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("admin");
  });
});

describe("removeMember", () => {
  it("removes a member", () => {
    const project = makeProject();
    const result = removeMember(project, "user-viewer");
    expect(result.find((m) => m.userId === "user-viewer")).toBeUndefined();
  });

  it("throws when removing owner", () => {
    const project = makeProject();
    expect(() => removeMember(project, "user-owner")).toThrow();
  });
});

describe("addWorkflowToProject", () => {
  it("adds a new workflow", () => {
    const result = addWorkflowToProject(["wf-1"], "wf-2");
    expect(result).toEqual(["wf-1", "wf-2"]);
  });

  it("does not duplicate existing workflow", () => {
    const result = addWorkflowToProject(["wf-1", "wf-2"], "wf-1");
    expect(result).toEqual(["wf-1", "wf-2"]);
  });
});

describe("removeWorkflowFromProject", () => {
  it("removes a workflow", () => {
    const result = removeWorkflowFromProject(["wf-1", "wf-2"], "wf-1");
    expect(result).toEqual(["wf-2"]);
  });

  it("returns unchanged array if workflow not found", () => {
    const result = removeWorkflowFromProject(["wf-1"], "wf-99");
    expect(result).toEqual(["wf-1"]);
  });
});

describe("getAccessibleProjects", () => {
  it("returns projects user has access to", () => {
    const projects = [makeProject(), makeProject({ id: "proj-2", ownerId: "user-other", members: [] })];
    const result = getAccessibleProjects(projects, "user-owner");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("proj-1");
  });

  it("includes projects where user is a member", () => {
    const projects = [makeProject()];
    const result = getAccessibleProjects(projects, "user-editor");
    expect(result).toHaveLength(1);
  });
});

describe("summarizeMembers", () => {
  it("counts members by role", () => {
    const project = makeProject();
    const summary = summarizeMembers(project);
    expect(summary.owner).toBe(1);
    expect(summary.admin).toBe(1);
    expect(summary.editor).toBe(1);
    expect(summary.viewer).toBe(1);
  });
});
