/**
 * Phase 25 — Collaboration & Governance
 * Project utilities: grouping, membership, role resolution
 */

export type ProjectRole = "owner" | "admin" | "editor" | "viewer";

export interface ProjectMember {
  userId: string;
  role: ProjectRole;
  joinedAt: Date;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  members: ProjectMember[];
  workflowIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectPermissions {
  canView: boolean;
  canEdit: boolean;
  canExecute: boolean;
  canManageMembers: boolean;
  canDelete: boolean;
  canManageCredentials: boolean;
}

const ROLE_ORDER: ProjectRole[] = ["viewer", "editor", "admin", "owner"];

/**
 * Get a member's role in a project. Returns null if not a member.
 */
export function getMemberRole(
  project: Project,
  userId: string
): ProjectRole | null {
  if (project.ownerId === userId) return "owner";
  const member = project.members.find((m) => m.userId === userId);
  return member?.role ?? null;
}

/**
 * Check if a user has at least a minimum role in the project.
 */
export function hasMinimumRole(
  role: ProjectRole | null,
  minimum: ProjectRole
): boolean {
  if (!role) return false;
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(minimum);
}

/**
 * Derive all permissions for a user in a project.
 */
export function getProjectPermissions(
  project: Project,
  userId: string
): ProjectPermissions {
  const role = getMemberRole(project, userId);
  return {
    canView: hasMinimumRole(role, "viewer"),
    canEdit: hasMinimumRole(role, "editor"),
    canExecute: hasMinimumRole(role, "editor"),
    canManageMembers: hasMinimumRole(role, "admin"),
    canDelete: hasMinimumRole(role, "owner"),
    canManageCredentials: hasMinimumRole(role, "admin"),
  };
}

/**
 * Add or update a member in a project (returns new members array).
 */
export function upsertMember(
  members: ProjectMember[],
  userId: string,
  role: ProjectRole
): ProjectMember[] {
  const existing = members.find((m) => m.userId === userId);
  if (existing) {
    return members.map((m) =>
      m.userId === userId ? { ...m, role } : m
    );
  }
  return [...members, { userId, role, joinedAt: new Date() }];
}

/**
 * Remove a member from a project (returns new members array).
 * Throws if the user is the owner.
 */
export function removeMember(
  project: Project,
  userId: string
): ProjectMember[] {
  if (project.ownerId === userId) {
    throw new Error("Cannot remove the project owner");
  }
  return project.members.filter((m) => m.userId !== userId);
}

/**
 * Add a workflow to a project (returns new workflowIds array, deduped).
 */
export function addWorkflowToProject(
  workflowIds: string[],
  workflowId: string
): string[] {
  if (workflowIds.includes(workflowId)) return workflowIds;
  return [...workflowIds, workflowId];
}

/**
 * Remove a workflow from a project.
 */
export function removeWorkflowFromProject(
  workflowIds: string[],
  workflowId: string
): string[] {
  return workflowIds.filter((id) => id !== workflowId);
}

/**
 * Filter projects that a user can access (any role or owner).
 */
export function getAccessibleProjects(
  projects: Project[],
  userId: string
): Project[] {
  return projects.filter(
    (p) => getMemberRole(p, userId) !== null
  );
}

/**
 * Summarize a project's member count by role.
 */
export function summarizeMembers(project: Project): Record<ProjectRole, number> {
  const counts: Record<ProjectRole, number> = {
    owner: 1, // always the owner
    admin: 0,
    editor: 0,
    viewer: 0,
  };
  for (const m of project.members) {
    counts[m.role] = (counts[m.role] ?? 0) + 1;
  }
  return counts;
}
