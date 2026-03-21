/**
 * Phase 32 — Variable System
 * Global variables and environment management for cross-workflow use.
 */

export type VariableScope = "global" | "project" | "workflow";
export type VariableType = "string" | "number" | "boolean" | "json" | "secret";
export type EnvironmentName = "development" | "staging" | "production" | string;

export interface Variable {
  id: string;
  name: string;
  value: string;         // stored as string; secrets are encrypted at rest
  type: VariableType;
  scope: VariableScope;
  scopeId?: string;      // projectId or workflowId depending on scope
  environment?: EnvironmentName;
  description?: string;
  isSecret: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface VariableFilter {
  scope?: VariableScope;
  scopeId?: string;
  environment?: EnvironmentName;
  namePrefix?: string;
}

/**
 * Parse a variable value to its typed representation.
 */
export function parseVariableValue(variable: Variable): unknown {
  switch (variable.type) {
    case "number": {
      const n = Number(variable.value);
      return isNaN(n) ? 0 : n;
    }
    case "boolean":
      return variable.value === "true" || variable.value === "1";
    case "json":
      try { return JSON.parse(variable.value); } catch { return null; }
    case "secret":
    case "string":
    default:
      return variable.value;
  }
}

/**
 * Serialize a value to string for storage.
 */
export function serializeVariableValue(value: unknown, type: VariableType): string {
  if (type === "json") return JSON.stringify(value);
  return String(value);
}

/**
 * Mask a secret variable's value for display.
 */
export function maskSecret(value: string): string {
  if (value.length <= 4) return "****";
  return value.slice(0, 2) + "*".repeat(Math.min(value.length - 4, 8)) + value.slice(-2);
}

/**
 * Filter variables by criteria.
 */
export function filterVariables(
  variables: Variable[],
  filter: VariableFilter
): Variable[] {
  return variables.filter((v) => {
    if (filter.scope && v.scope !== filter.scope) return false;
    if (filter.scopeId && v.scopeId !== filter.scopeId) return false;
    if (filter.environment && v.environment !== filter.environment) return false;
    if (filter.namePrefix && !v.name.startsWith(filter.namePrefix)) return false;
    return true;
  });
}

/**
 * Get variables accessible from a given scope context (global + project + workflow).
 * More specific scopes override less specific ones.
 */
export function resolveVariables(
  variables: Variable[],
  context: { workflowId?: string; projectId?: string; environment?: EnvironmentName }
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Priority: global < project < workflow (higher index = higher priority)
  const scoped = [
    variables.filter((v) => v.scope === "global"),
    variables.filter((v) => v.scope === "project" && v.scopeId === context.projectId),
    variables.filter((v) => v.scope === "workflow" && v.scopeId === context.workflowId),
  ];

  for (const group of scoped) {
    for (const variable of group) {
      // Environment filter
      if (variable.environment && context.environment && variable.environment !== context.environment) {
        continue;
      }
      result[variable.name] = parseVariableValue(variable);
    }
  }

  return result;
}

/**
 * Interpolate a string template with variable values.
 * Supports {{ variable_name }} syntax.
 */
export function interpolateWithVariables(
  template: string,
  variables: Record<string, unknown>
): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, name: string) => {
    const val = variables[name];
    return val !== undefined ? String(val) : `{{${name}}}`;
  });
}

/**
 * Validate a variable name.
 */
export function isValidVariableName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && name.length <= 64;
}

/**
 * Validate a variable definition.
 */
export function validateVariable(variable: Partial<Variable>): string[] {
  const errors: string[] = [];

  if (!variable.name) {
    errors.push("Variable name is required");
  } else if (!isValidVariableName(variable.name)) {
    errors.push("Variable name must be alphanumeric/underscore, starting with a letter");
  }

  if (variable.value === undefined || variable.value === null) {
    errors.push("Variable value is required");
  }

  if (!variable.type) {
    errors.push("Variable type is required");
  }

  if (!variable.scope) {
    errors.push("Variable scope is required");
  }

  if (variable.scope === "project" && !variable.scopeId) {
    errors.push("scopeId is required for project-scoped variables");
  }

  if (variable.scope === "workflow" && !variable.scopeId) {
    errors.push("scopeId is required for workflow-scoped variables");
  }

  if (variable.type === "number" && variable.value !== undefined) {
    if (isNaN(Number(variable.value))) {
      errors.push("Value must be a valid number for number type");
    }
  }

  if (variable.type === "boolean" && variable.value !== undefined) {
    if (!["true", "false", "1", "0"].includes(variable.value)) {
      errors.push("Value must be 'true', 'false', '1', or '0' for boolean type");
    }
  }

  if (variable.type === "json" && variable.value !== undefined) {
    try { JSON.parse(variable.value); } catch {
      errors.push("Value must be valid JSON for json type");
    }
  }

  return errors;
}

/**
 * Get variable names referenced in a template string.
 */
export function extractVariableReferences(template: string): string[] {
  const matches = [...template.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

/**
 * Check which referenced variables are missing from the provided set.
 */
export function getMissingVariables(
  template: string,
  availableVariables: Record<string, unknown>
): string[] {
  const referenced = extractVariableReferences(template);
  return referenced.filter((name) => !(name in availableVariables));
}
