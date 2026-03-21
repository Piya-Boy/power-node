/**
 * Phase 56 — Team Permission Matrix
 * Pure utility functions for team-based role/permission management.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResourceType =
  | "workflow"
  | "execution"
  | "credential"
  | "team"
  | "member"
  | "audit"
  | "billing"
  | "api-key"
  | "webhook";

export type ActionType =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "execute"
  | "share"
  | "export"
  | "invite"
  | "manage";

export type TeamRole = "owner" | "admin" | "editor" | "viewer" | "billing-admin" | "auditor";

export interface Permission {
  resource: ResourceType;
  action: ActionType;
  conditions?: {
    ownedOnly?: boolean; // can only act on own resources
    teamOnly?: boolean; // restricted to team scope
    readOnly?: boolean; // override to read-only
  };
}

export interface RoleDefinition {
  role: TeamRole;
  description: string;
  permissions: Permission[];
  inheritsFrom?: TeamRole;
}

export interface PermissionCheck {
  allowed: boolean;
  reason: string;
  matchedPermission?: Permission;
  inheritedFrom?: TeamRole;
}

export interface AccessPolicy {
  userId: string;
  teamId: string;
  role: TeamRole;
  customPermissions?: Permission[];
  restrictions?: Permission[]; // explicit denies
  createdAt: Date;
  expiresAt?: Date;
}

// ---------------------------------------------------------------------------
// Role hierarchy (higher index = lower privilege)
// ---------------------------------------------------------------------------
const ROLE_HIERARCHY: TeamRole[] = [
  "owner",
  "admin",
  "editor",
  "billing-admin",
  "auditor",
  "viewer",
];

// ---------------------------------------------------------------------------
// Role definitions
// ---------------------------------------------------------------------------

export function defineRoles(): Record<TeamRole, RoleDefinition> {
  return {
    owner: {
      role: "owner",
      description: "Full control over everything in the team",
      permissions: [
        // workflows
        { resource: "workflow", action: "create" },
        { resource: "workflow", action: "read" },
        { resource: "workflow", action: "update" },
        { resource: "workflow", action: "delete" },
        { resource: "workflow", action: "execute" },
        { resource: "workflow", action: "share" },
        { resource: "workflow", action: "export" },
        // executions
        { resource: "execution", action: "read" },
        { resource: "execution", action: "delete" },
        // credentials
        { resource: "credential", action: "create" },
        { resource: "credential", action: "read" },
        { resource: "credential", action: "update" },
        { resource: "credential", action: "delete" },
        // team
        { resource: "team", action: "read" },
        { resource: "team", action: "update" },
        { resource: "team", action: "delete" },
        { resource: "team", action: "manage" },
        // members
        { resource: "member", action: "read" },
        { resource: "member", action: "invite" },
        { resource: "member", action: "update" },
        { resource: "member", action: "delete" },
        { resource: "member", action: "manage" },
        // audit
        { resource: "audit", action: "read" },
        { resource: "audit", action: "export" },
        // billing
        { resource: "billing", action: "read" },
        { resource: "billing", action: "update" },
        { resource: "billing", action: "manage" },
        // api-key
        { resource: "api-key", action: "create" },
        { resource: "api-key", action: "read" },
        { resource: "api-key", action: "update" },
        { resource: "api-key", action: "delete" },
        // webhook
        { resource: "webhook", action: "create" },
        { resource: "webhook", action: "read" },
        { resource: "webhook", action: "update" },
        { resource: "webhook", action: "delete" },
      ],
    },

    admin: {
      role: "admin",
      description: "Manage team, workflows and integrations (cannot delete team)",
      inheritsFrom: "editor",
      permissions: [
        // team management (not delete)
        { resource: "team", action: "read" },
        { resource: "team", action: "update" },
        { resource: "team", action: "manage" },
        // members
        { resource: "member", action: "read" },
        { resource: "member", action: "invite" },
        { resource: "member", action: "update" },
        { resource: "member", action: "delete" },
        { resource: "member", action: "manage" },
        // audit
        { resource: "audit", action: "read" },
        { resource: "audit", action: "export" },
        // credentials
        { resource: "credential", action: "create" },
        { resource: "credential", action: "read" },
        { resource: "credential", action: "update" },
        { resource: "credential", action: "delete" },
        // api-keys
        { resource: "api-key", action: "create" },
        { resource: "api-key", action: "read" },
        { resource: "api-key", action: "update" },
        { resource: "api-key", action: "delete" },
        // webhooks
        { resource: "webhook", action: "create" },
        { resource: "webhook", action: "read" },
        { resource: "webhook", action: "update" },
        { resource: "webhook", action: "delete" },
      ],
    },

    editor: {
      role: "editor",
      description: "Create, edit and run workflows",
      permissions: [
        { resource: "workflow", action: "create" },
        { resource: "workflow", action: "read" },
        { resource: "workflow", action: "update" },
        { resource: "workflow", action: "execute" },
        { resource: "workflow", action: "share" },
        { resource: "workflow", action: "export" },
        { resource: "execution", action: "read" },
        { resource: "credential", action: "read" },
        { resource: "webhook", action: "create" },
        { resource: "webhook", action: "read" },
        { resource: "webhook", action: "update" },
      ],
    },

    viewer: {
      role: "viewer",
      description: "Read-only access to workflows and executions",
      permissions: [
        { resource: "workflow", action: "read" },
        { resource: "execution", action: "read" },
        { resource: "credential", action: "read", conditions: { readOnly: true } },
        { resource: "webhook", action: "read" },
      ],
    },

    "billing-admin": {
      role: "billing-admin",
      description: "Manage billing and subscriptions",
      permissions: [
        { resource: "billing", action: "read" },
        { resource: "billing", action: "update" },
        { resource: "billing", action: "manage" },
        { resource: "team", action: "read" },
        { resource: "member", action: "read" },
      ],
    },

    auditor: {
      role: "auditor",
      description: "Read-only access to audit logs and reports",
      permissions: [
        { resource: "audit", action: "read" },
        { resource: "audit", action: "export" },
        { resource: "workflow", action: "read" },
        { resource: "execution", action: "read" },
        { resource: "team", action: "read" },
        { resource: "member", action: "read" },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Permission resolution
// ---------------------------------------------------------------------------

function resolveInheritedPermissions(
  role: TeamRole,
  roles: Record<TeamRole, RoleDefinition>,
  visited = new Set<TeamRole>(),
): Permission[] {
  if (visited.has(role)) return [];
  visited.add(role);

  const definition = roles[role];
  if (!definition) return [];

  const own = definition.permissions;

  if (definition.inheritsFrom) {
    const inherited = resolveInheritedPermissions(definition.inheritsFrom, roles, visited);
    return [...own, ...inherited];
  }

  return own;
}

export function getPermissionsForRole(role: TeamRole): Permission[] {
  const roles = defineRoles();
  return resolveInheritedPermissions(role, roles);
}

// ---------------------------------------------------------------------------
// Permission checks
// ---------------------------------------------------------------------------

function permissionMatches(
  perm: Permission,
  resource: ResourceType,
  action: ActionType,
): boolean {
  return perm.resource === resource && perm.action === action;
}

export function checkPermission(
  policy: AccessPolicy,
  resource: ResourceType,
  action: ActionType,
  context?: { isOwner?: boolean },
): PermissionCheck {
  // Check if policy is expired
  if (policy.expiresAt && policy.expiresAt <= new Date()) {
    return { allowed: false, reason: "Policy has expired" };
  }

  // Check explicit restrictions first
  if (policy.restrictions) {
    for (const restriction of policy.restrictions) {
      if (permissionMatches(restriction, resource, action)) {
        return { allowed: false, reason: `Action '${action}' on '${resource}' is explicitly denied` };
      }
    }
  }

  // Check custom permissions
  if (policy.customPermissions) {
    for (const perm of policy.customPermissions) {
      if (permissionMatches(perm, resource, action)) {
        if (perm.conditions?.ownedOnly && !context?.isOwner) {
          continue; // skip — requires ownership
        }
        return {
          allowed: true,
          reason: `Allowed via custom permission`,
          matchedPermission: perm,
        };
      }
    }
  }

  // Check role permissions (including inherited)
  const rolePerms = getPermissionsForRole(policy.role);
  const roles = defineRoles();

  // Check own role first
  for (const perm of roles[policy.role]?.permissions ?? []) {
    if (permissionMatches(perm, resource, action)) {
      if (perm.conditions?.ownedOnly && !context?.isOwner) {
        continue;
      }
      return {
        allowed: true,
        reason: `Allowed by role '${policy.role}'`,
        matchedPermission: perm,
      };
    }
  }

  // Check inherited permissions
  const inheritedRole = roles[policy.role]?.inheritsFrom;
  if (inheritedRole) {
    const inheritedPerms = resolveInheritedPermissions(inheritedRole, roles);
    for (const perm of inheritedPerms) {
      if (permissionMatches(perm, resource, action)) {
        if (perm.conditions?.ownedOnly && !context?.isOwner) {
          continue;
        }
        return {
          allowed: true,
          reason: `Allowed via inherited role '${inheritedRole}'`,
          matchedPermission: perm,
          inheritedFrom: inheritedRole,
        };
      }
    }
  }

  // Suppress unused variable warning
  void rolePerms;

  return {
    allowed: false,
    reason: `Role '${policy.role}' does not have '${action}' permission on '${resource}'`,
  };
}

export function hasPermission(
  policy: AccessPolicy,
  resource: ResourceType,
  action: ActionType,
): boolean {
  return checkPermission(policy, resource, action).allowed;
}

export function canAccessOwnedResource(
  policy: AccessPolicy,
  resource: ResourceType,
  action: ActionType,
  isOwner: boolean,
): boolean {
  return checkPermission(policy, resource, action, { isOwner }).allowed;
}

export function getAllowedActions(policy: AccessPolicy, resource: ResourceType): ActionType[] {
  const allActions: ActionType[] = [
    "create",
    "read",
    "update",
    "delete",
    "execute",
    "share",
    "export",
    "invite",
    "manage",
  ];
  return allActions.filter((action) => hasPermission(policy, resource, action));
}

export function getAllowedResources(policy: AccessPolicy): ResourceType[] {
  const allResources: ResourceType[] = [
    "workflow",
    "execution",
    "credential",
    "team",
    "member",
    "audit",
    "billing",
    "api-key",
    "webhook",
  ];
  return allResources.filter((resource) => {
    // Can access resource if at least one action is allowed
    return getAllowedActions(policy, resource).length > 0;
  });
}

// ---------------------------------------------------------------------------
// Permission merging
// ---------------------------------------------------------------------------

export function mergePermissions(base: Permission[], custom: Permission[]): Permission[] {
  const merged = [...base];
  for (const perm of custom) {
    const exists = merged.some(
      (p) => p.resource === perm.resource && p.action === perm.action,
    );
    if (!exists) {
      merged.push(perm);
    }
  }
  return merged;
}

export function applyRestrictions(
  permissions: Permission[],
  restrictions: Permission[],
): Permission[] {
  return permissions.filter(
    (p) =>
      !restrictions.some((r) => r.resource === p.resource && r.action === p.action),
  );
}

// ---------------------------------------------------------------------------
// Policy management
// ---------------------------------------------------------------------------

export function validatePolicy(policy: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!policy || typeof policy !== "object") {
    return { valid: false, errors: ["Policy must be an object"] };
  }

  const p = policy as Record<string, unknown>;

  if (!p.userId || typeof p.userId !== "string") errors.push("Missing or invalid userId");
  if (!p.teamId || typeof p.teamId !== "string") errors.push("Missing or invalid teamId");

  const validRoles: TeamRole[] = ["owner", "admin", "editor", "viewer", "billing-admin", "auditor"];
  if (!p.role || !validRoles.includes(p.role as TeamRole)) {
    errors.push("Missing or invalid role");
  }

  if (!(p.createdAt instanceof Date)) errors.push("Missing or invalid createdAt (must be Date)");

  return { valid: errors.length === 0, errors };
}

export function createPolicy(
  params: Omit<AccessPolicy, "createdAt"> & { createdAt?: Date },
): AccessPolicy {
  return {
    userId: params.userId,
    teamId: params.teamId,
    role: params.role,
    customPermissions: params.customPermissions,
    restrictions: params.restrictions,
    createdAt: params.createdAt ?? new Date(),
    expiresAt: params.expiresAt,
  };
}

export function isPolicyExpired(policy: AccessPolicy, now: Date = new Date()): boolean {
  if (!policy.expiresAt) return false;
  return policy.expiresAt <= now;
}

// ---------------------------------------------------------------------------
// Role comparison
// ---------------------------------------------------------------------------

export function compareRoles(a: TeamRole, b: TeamRole): number {
  const rankA = ROLE_HIERARCHY.indexOf(a);
  const rankB = ROLE_HIERARCHY.indexOf(b);

  if (rankA === rankB) return 0;
  if (rankA < rankB) return -1; // a has higher privilege
  return 1; // b has higher privilege
}

export function isRoleAtLeast(role: TeamRole, minimum: TeamRole): boolean {
  return compareRoles(role, minimum) <= 0;
}

// ---------------------------------------------------------------------------
// Policy summary
// ---------------------------------------------------------------------------

export function summarizePolicy(policy: AccessPolicy): {
  role: TeamRole;
  permissionCount: number;
  allowedResources: ResourceType[];
  isExpired: boolean;
} {
  const rolePerms = getPermissionsForRole(policy.role);
  const custom = policy.customPermissions ?? [];
  const restrictions = policy.restrictions ?? [];

  const merged = mergePermissions(rolePerms, custom);
  const effective = applyRestrictions(merged, restrictions);

  const allowedResources = getAllowedResources(policy);

  return {
    role: policy.role,
    permissionCount: effective.length,
    allowedResources,
    isExpired: isPolicyExpired(policy),
  };
}
