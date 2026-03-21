import Handlebars from "handlebars";

/**
 * Resolves Handlebars templates in a string using the execution context.
 * Supports {{variable.property}} syntax for referencing previous node outputs.
 */
export function resolveTemplate(
  template: string,
  context: Record<string, unknown>,
): string {
  if (!template || !template.includes("{{")) return template;

  try {
    const compiled = Handlebars.compile(template, { noEscape: true });
    return compiled(context);
  } catch {
    // Return original template if compilation fails
    return template;
  }
}

/**
 * Resolves all string values in an object using the execution context.
 * Useful for resolving an entire node's data object.
 */
export function resolveObjectTemplates(
  obj: Record<string, unknown>,
  context: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = resolveTemplate(value, context);
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = resolveObjectTemplates(value as Record<string, unknown>, context);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Extracts variable references from a template string.
 * Returns the top-level variable names referenced.
 */
export function extractReferences(template: string): string[] {
  const refs = new Set<string>();
  const regex = /\{\{([^}]+)\}\}/g;
  let match;

  while ((match = regex.exec(template)) !== null) {
    const ref = match[1].trim();
    const topLevel = ref.split(".")[0];
    if (topLevel) refs.add(topLevel);
  }

  return Array.from(refs);
}
