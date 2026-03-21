/**
 * Expression parser for the visual expression editor.
 * Parses template strings like "Hello {{name}}, your order {{order.id}} is ready"
 * into segments for syntax highlighting and autocomplete.
 */

export type ExpressionSegment =
  | { type: "text"; value: string }
  | { type: "variable"; value: string; path: string[] };

/**
 * Parse a template string into segments for rendering.
 */
export function parseExpression(template: string): ExpressionSegment[] {
  const segments: ExpressionSegment[] = [];
  const regex = /\{\{([^}]*)\}\}/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(template)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        value: template.slice(lastIndex, match.index),
      });
    }

    // Add variable
    const varName = match[1].trim();
    segments.push({
      type: "variable",
      value: varName,
      path: varName.split("."),
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < template.length) {
    segments.push({
      type: "text",
      value: template.slice(lastIndex),
    });
  }

  return segments;
}

/**
 * Reconstruct a template string from segments.
 */
export function segmentsToString(segments: ExpressionSegment[]): string {
  return segments
    .map((s) => (s.type === "variable" ? `{{${s.value}}}` : s.value))
    .join("");
}

/**
 * Get available variables for autocomplete based on previous node outputs.
 */
export function getAvailableVariables(
  context: Record<string, unknown>,
  prefix: string = "",
): string[] {
  const vars: string[] = [];

  for (const [key, value] of Object.entries(context)) {
    const path = prefix ? `${prefix}.${key}` : key;
    vars.push(path);

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      vars.push(
        ...getAvailableVariables(value as Record<string, unknown>, path),
      );
    }
  }

  return vars;
}

/**
 * Filter autocomplete suggestions by partial input.
 */
export function filterSuggestions(
  available: string[],
  input: string,
): string[] {
  if (!input) return available.slice(0, 20);

  const lower = input.toLowerCase();
  return available
    .filter((v) => v.toLowerCase().includes(lower))
    .slice(0, 20);
}

/**
 * Validate that all variables in a template are available.
 */
export function validateExpression(
  template: string,
  availableVars: string[],
): { valid: boolean; unknownVars: string[] } {
  const segments = parseExpression(template);
  const varSet = new Set(availableVars);
  const unknownVars: string[] = [];

  for (const segment of segments) {
    if (segment.type === "variable") {
      // Check if the root variable exists
      const root = segment.path[0];
      if (!varSet.has(root) && !availableVars.some((v) => v.startsWith(root + "."))) {
        unknownVars.push(segment.value);
      }
    }
  }

  return {
    valid: unknownVars.length === 0,
    unknownVars,
  };
}
