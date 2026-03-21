/**
 * Permission and role utilities — pure logic, no database dependency.
 */

export type Role = "owner" | "admin" | "editor" | "viewer";

export type Permission =
  | "workflow:read"
  | "workflow:create"
  | "workflow:update"
  | "workflow:delete"
  | "workflow:execute"
  | "credential:read"
  | "credential:create"
  | "credential:update"
  | "credential:delete"
  | "member:read"
  | "member:invite"
  | "member:remove"
  | "member:update_role"
  | "apikey:read"
  | "apikey:create"
  | "apikey:delete"
  | "project:read"
  | "project:update"
  | "project:delete";

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

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [...ALL_PERMISSIONS],

  admin: ALL_PERMISSIONS.filter((p) => p !== "project:delete"),

  editor: [
    "workflow:read",
    "workflow:create",
    "workflow:update",
    "workflow:delete",
    "workflow:execute",
    "credential:read",
    "credential:create",
    "credential:update",
    "apikey:read",
    "apikey:create",
    "member:read",
    "project:read",
  ],

  viewer: [
    "workflow:read",
    "workflow:execute",
    "credential:read",
    "member:read",
    "apikey:read",
    "project:read",
  ],
};

/**
 * Numeric role hierarchy — higher value means more access.
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 4,
  admin: 3,
  editor: 2,
  viewer: 1,
};

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Get all permissions for a given role.
 */
export function getRolePermissions(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role];
}

/**
 * Alias for hasPermission — check if a user role can perform an action.
 */
export function canPerformAction(
  userRole: Role,
  action: Permission,
): boolean {
  return hasPermission(userRole, action);
}

/**
 * Check if a user role meets or exceeds a minimum required role.
 */
export function isAtLeastRole(userRole: Role, minimumRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumRole];
}

/**
 * Returns a human-readable label for a role.
 */
export function getRoleLabel(role: Role): string {
  const labels: Record<Role, string> = {
    owner: "Owner",
    admin: "Admin",
    editor: "Editor",
    viewer: "Viewer",
  };
  return labels[role];
}

/**
 * Returns a description of what a role can do.
 */
export function getRoleDescription(role: Role): string {
  const descriptions: Record<Role, string> = {
    owner: "Full access to all resources including project management and deletion",
    admin: "Full access to all resources except deleting the project",
    editor: "Can create and manage workflows, credentials, and API keys",
    viewer: "Read-only access to workflows and resources",
  };
  return descriptions[role];
}
