/**
 * Execution context utilities for managing workflow variable scope.
 * Each node reads from the shared context and writes its output under its variableName.
 */

export type ExecutionContext = Record<string, unknown>;

/**
 * Merge a node's output into the execution context.
 * The output is stored under the node's variableName.
 */
export function mergeNodeOutput(
  context: ExecutionContext,
  variableName: string,
  output: unknown,
): ExecutionContext {
  return { ...context, [variableName]: output };
}

/**
 * Create an initial execution context with common metadata.
 */
export function createInitialContext(
  workflowId: string,
  initialData?: Record<string, unknown>,
): ExecutionContext {
  return {
    _workflowId: workflowId,
    _startedAt: new Date().toISOString(),
    _env: process.env.NODE_ENV || "production",
    ...initialData,
  };
}

/**
 * Extract only the user-facing variables (non-prefixed with _).
 */
export function getUserVariables(context: ExecutionContext): ExecutionContext {
  return Object.fromEntries(
    Object.entries(context).filter(([key]) => !key.startsWith("_")),
  );
}

/**
 * Safely serialize context to JSON, handling circular refs and special values.
 */
export function serializeContext(context: ExecutionContext): string {
  const seen = new WeakSet();
  return JSON.stringify(context, (_key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    if (typeof value === "bigint") return value.toString();
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) return { message: value.message, stack: value.stack };
    return value;
  }, 2);
}

/**
 * Validate that a variable name is valid for use in context.
 */
export function isValidVariableName(name: string): boolean {
  if (!name || name.length === 0) return false;
  if (name.startsWith("_")) return false;
  // Must be alphanumeric/underscore, not start with digit
  return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name);
}

/**
 * Sanitize a variable name, converting invalid chars to underscores.
 */
export function sanitizeVariableName(name: string): string {
  if (!name) return "output";
  // Replace invalid chars with _
  let sanitized = name.replace(/[^a-zA-Z0-9_]/g, "_");
  // Ensure starts with letter
  if (/^\d/.test(sanitized)) sanitized = `v_${sanitized}`;
  if (sanitized.startsWith("_")) sanitized = `v${sanitized}`;
  return sanitized || "output";
}

/**
 * Resolve a value from context, supporting dot-notation paths.
 */
export function resolveContextValue(
  context: ExecutionContext,
  path: string,
): unknown {
  const parts = path.split(".");
  let current: unknown = context;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}
