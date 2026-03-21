/**
 * Phase 34 — Multi-Environment Support
 * Utilities for managing dev/staging/prod environments and config promotion.
 */

export type EnvironmentTier = "development" | "staging" | "production";

export interface Environment {
  id: string;
  name: string;
  tier: EnvironmentTier;
  variables: Record<string, string>;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnvironmentConfig {
  workflowId: string;
  environmentId: string;
  overrides: Record<string, unknown>; // node data overrides per environment
  isActive: boolean;
}

export interface PromotionPlan {
  from: EnvironmentTier;
  to: EnvironmentTier;
  workflowId: string;
  changes: PromotionChange[];
  warnings: string[];
  canPromote: boolean;
}

export interface PromotionChange {
  type: "variable_override" | "config_update" | "activation_change";
  description: string;
}

export const TIER_ORDER: EnvironmentTier[] = ["development", "staging", "production"];

/**
 * Check if a promotion is valid (can only promote forward in tier order).
 */
export function isValidPromotion(from: EnvironmentTier, to: EnvironmentTier): boolean {
  return TIER_ORDER.indexOf(from) < TIER_ORDER.indexOf(to);
}

/**
 * Get the next tier in the promotion chain.
 */
export function getNextTier(tier: EnvironmentTier): EnvironmentTier | null {
  const index = TIER_ORDER.indexOf(tier);
  if (index === -1 || index === TIER_ORDER.length - 1) return null;
  return TIER_ORDER[index + 1];
}

/**
 * Get the previous tier.
 */
export function getPreviousTier(tier: EnvironmentTier): EnvironmentTier | null {
  const index = TIER_ORDER.indexOf(tier);
  if (index <= 0) return null;
  return TIER_ORDER[index - 1];
}

/**
 * Merge environment variables with base variables.
 * Environment-specific vars override base vars.
 */
export function mergeEnvironmentVariables(
  base: Record<string, string>,
  override: Record<string, string>
): Record<string, string> {
  return { ...base, ...override };
}

/**
 * Compare two environments and return the differences.
 */
export function diffEnvironments(
  env1: Environment,
  env2: Environment
): {
  added: string[];
  removed: string[];
  changed: string[];
  same: string[];
} {
  const keys1 = new Set(Object.keys(env1.variables));
  const keys2 = new Set(Object.keys(env2.variables));

  const added = [...keys2].filter((k) => !keys1.has(k));
  const removed = [...keys1].filter((k) => !keys2.has(k));
  const shared = [...keys1].filter((k) => keys2.has(k));
  const changed = shared.filter((k) => env1.variables[k] !== env2.variables[k]);
  const same = shared.filter((k) => env1.variables[k] === env2.variables[k]);

  return { added, removed, changed, same };
}

/**
 * Build a promotion plan from one environment to another.
 */
export function buildPromotionPlan(
  workflowId: string,
  fromEnv: Environment,
  toEnv: Environment,
  options: { activateInTarget?: boolean } = {}
): PromotionPlan {
  const from = fromEnv.tier;
  const to = toEnv.tier;
  const changes: PromotionChange[] = [];
  const warnings: string[] = [];

  if (!isValidPromotion(from, to)) {
    return {
      from,
      to,
      workflowId,
      changes: [],
      warnings: [`Cannot promote from ${from} to ${to} — must promote forward in: ${TIER_ORDER.join(" → ")}`],
      canPromote: false,
    };
  }

  // Check variable differences
  const diff = diffEnvironments(fromEnv, toEnv);

  if (diff.changed.length > 0) {
    changes.push({
      type: "variable_override",
      description: `${diff.changed.length} variable(s) will be updated in ${to}: ${diff.changed.join(", ")}`,
    });
  }

  if (diff.added.length > 0) {
    warnings.push(`${diff.added.length} variable(s) exist in ${to} but not in ${from}: ${diff.added.join(", ")}`);
  }

  if (diff.removed.length > 0) {
    warnings.push(`${diff.removed.length} variable(s) will be promoted to ${to} that don't exist there yet: ${diff.removed.join(", ")}`);
    changes.push({
      type: "variable_override",
      description: `Add ${diff.removed.length} new variable(s) to ${to}: ${diff.removed.join(", ")}`,
    });
  }

  if (options.activateInTarget) {
    changes.push({
      type: "activation_change",
      description: `Workflow will be activated in ${to}`,
    });
  }

  if (to === "production") {
    warnings.push("Promoting to production — ensure all changes have been tested in staging");
  }

  return {
    from,
    to,
    workflowId,
    changes,
    warnings,
    canPromote: true,
  };
}

/**
 * Validate that all required variables for a tier are present.
 */
export function validateEnvironmentVariables(
  variables: Record<string, string>,
  requiredKeys: string[]
): { valid: boolean; missing: string[] } {
  const missing = requiredKeys.filter((k) => !(k in variables) || variables[k] === "");
  return { valid: missing.length === 0, missing };
}

/**
 * Sanitize an environment name (lowercase, alphanumeric + dash).
 */
export function sanitizeEnvironmentName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Format a promotion plan as a human-readable string.
 */
export function formatPromotionPlan(plan: PromotionPlan): string {
  const lines: string[] = [
    `Promotion: ${plan.from} → ${plan.to}`,
    `Status: ${plan.canPromote ? "✓ Ready" : "✗ Blocked"}`,
  ];

  if (plan.changes.length > 0) {
    lines.push("\nChanges:");
    plan.changes.forEach((c) => lines.push(`  - [${c.type}] ${c.description}`));
  }

  if (plan.warnings.length > 0) {
    lines.push("\nWarnings:");
    plan.warnings.forEach((w) => lines.push(`  ⚠ ${w}`));
  }

  return lines.join("\n");
}

/**
 * Get the active environment for a workflow from a list.
 */
export function getActiveEnvironment(
  configs: EnvironmentConfig[],
  environments: Environment[],
  workflowId: string,
  tier: EnvironmentTier
): Environment | null {
  const config = configs.find((c) => c.workflowId === workflowId && c.isActive);
  if (!config) return null;
  return environments.find((e) => e.id === config.environmentId && e.tier === tier) ?? null;
}
