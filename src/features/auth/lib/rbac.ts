/**
 * Phase 25 — RBAC (Role-Based Access Control)
 * Instance-level and resource-level permission system.
 */

export type InstanceRole = "super_admin" | "admin" | "member" | "viewer";

export type ResourceAction =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "execute"
  | "share"
  | "manage";

export type ResourceType =
  | "workflow"
  | "credential"
  | "execution"
  | "apikey"
  | "project"
  | "user"
  | "audit_log";

export interface RbacPolicy {
  role: InstanceRole;
  resource: ResourceType;
  actions: ResourceAction[];
}

// Instance-level permission matrix
const INSTANCE_POLICIES: RbacPolicy[] = [
  // super_admin — can do everything
  { role: "super_admin", resource: "workflow", actions: ["read", "create", "update", "delete", "execute", "share", "manage"] },
  { role: "super_admin", resource: "credential", actions: ["read", "create", "update", "delete", "share", "manage"] },
  { role: "super_admin", resource: "execution", actions: ["read", "delete", "manage"] },
  { role: "super_admin", resource: "apikey", actions: ["read", "create", "delete", "manage"] },
  { role: "super_admin", resource: "project", actions: ["read", "create", "update", "delete", "manage"] },
  { role: "super_admin", resource: "user", actions: ["read", "create", "update", "delete", "manage"] },
  { role: "super_admin", resource: "audit_log", actions: ["read", "manage"] },

  // admin — manage most things, cannot manage users
  { role: "admin", resource: "workflow", actions: ["read", "create", "update", "delete", "execute", "share"] },
  { role: "admin", resource: "credential", actions: ["read", "create", "update", "delete", "share"] },
  { role: "admin", resource: "execution", actions: ["read", "delete"] },
  { role: "admin", resource: "apikey", actions: ["read", "create", "delete"] },
  { role: "admin", resource: "project", actions: ["read", "create", "update", "delete"] },
  { role: "admin", resource: "user", actions: ["read"] },
  { role: "admin", resource: "audit_log", actions: ["read"] },

  // member — create/edit their own, no user/audit management
  { role: "member", resource: "workflow", actions: ["read", "create", "update", "delete", "execute"] },
  { role: "member", resource: "credential", actions: ["read", "create", "update", "delete"] },
  { role: "member", resource: "execution", actions: ["read"] },
  { role: "member", resource: "apikey", actions: ["read", "create", "delete"] },
  { role: "member", resource: "project", actions: ["read", "create"] },
  { role: "member", resource: "user", actions: [] },
  { role: "member", resource: "audit_log", actions: [] },

  // viewer — read-only
  { role: "viewer", resource: "workflow", actions: ["read"] },
  { role: "viewer", resource: "credential", actions: [] },
  { role: "viewer", resource: "execution", actions: ["read"] },
  { role: "viewer", resource: "apikey", actions: [] },
  { role: "viewer", resource: "project", actions: ["read"] },
  { role: "viewer", resource: "user", actions: [] },
  { role: "viewer", resource: "audit_log", actions: [] },
];

const ROLE_ORDER: InstanceRole[] = ["viewer", "member", "admin", "super_admin"];

/**
 * Check if an instance role has permission to perform an action on a resource.
 */
export function can(
  role: InstanceRole,
  resource: ResourceType,
  action: ResourceAction
): boolean {
  const policy = INSTANCE_POLICIES.find(
    (p) => p.role === role && p.resource === resource
  );
  return policy?.actions.includes(action) ?? false;
}

/**
 * Get all allowed actions for a role on a resource.
 */
export function getAllowedActions(
  role: InstanceRole,
  resource: ResourceType
): ResourceAction[] {
  const policy = INSTANCE_POLICIES.find(
    (p) => p.role === role && p.resource === resource
  );
  return policy?.actions ?? [];
}

/**
 * Check if roleA is at least as privileged as roleB.
 */
export function hasMinimumInstanceRole(
  role: InstanceRole,
  minimum: InstanceRole
): boolean {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(minimum);
}

/**
 * Get all permissions for a role (all resources).
 */
export function getRolePermissions(
  role: InstanceRole
): Record<ResourceType, ResourceAction[]> {
  const policies = INSTANCE_POLICIES.filter((p) => p.role === role);
  const result = {} as Record<ResourceType, ResourceAction[]>;
  for (const p of policies) {
    result[p.resource] = p.actions;
  }
  return result;
}

/**
 * Validate that a role string is a valid InstanceRole.
 */
export function isValidInstanceRole(role: string): role is InstanceRole {
  return (ROLE_ORDER as string[]).includes(role);
}

/**
 * Determine the effective role — higher of two roles.
 */
export function maxRole(a: InstanceRole, b: InstanceRole): InstanceRole {
  return ROLE_ORDER.indexOf(a) >= ROLE_ORDER.indexOf(b) ? a : b;
}

/**
 * Get a human-readable description of an instance role.
 */
export function describeRole(role: InstanceRole): string {
  const descriptions: Record<InstanceRole, string> = {
    super_admin: "Full platform access including user management",
    admin: "Manage workflows, credentials, projects, and executions",
    member: "Create and manage own workflows and credentials",
    viewer: "Read-only access to workflows and executions",
  };
  return descriptions[role];
}
