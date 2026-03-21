/**
 * Phase 50 — AI Node Prompt Templates
 * Pure utility functions for managing and rendering prompt templates
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type PromptRole = "system" | "user" | "assistant";
export type TemplateVariableType = "string" | "number" | "boolean" | "array" | "object";

export interface TemplateVariable {
  name: string;
  type: TemplateVariableType;
  required: boolean;
  defaultValue?: unknown;
  description?: string;
  validator?: string; // regex pattern for string validation
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  role: PromptRole;
  template: string; // Handlebars-like: {{variableName}}
  variables: TemplateVariable[];
  tags: string[];
  model?: string; // preferred model
  maxTokens?: number;
  temperature?: number;
  version: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RenderedPrompt {
  role: PromptRole;
  content: string;
  tokensEstimate: number;
  variablesUsed: string[];
  missingVariables: string[];
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Create a PromptTemplate with defaults and auto-detected variables
 */
export function createTemplate(
  params: Partial<PromptTemplate> & Pick<PromptTemplate, "id" | "name" | "template">
): PromptTemplate {
  const now = new Date();
  const detectedVarNames = detectVariables(params.template);
  const existingVarNames = new Set((params.variables ?? []).map((v) => v.name));

  // Auto-create variable definitions for detected but not explicitly defined variables
  const autoVars: TemplateVariable[] = detectedVarNames
    .filter((name) => !existingVarNames.has(name))
    .map((name) => ({
      name,
      type: "string" as TemplateVariableType,
      required: true,
    }));

  return {
    description: "",
    role: "user",
    variables: [...(params.variables ?? []), ...autoVars],
    tags: [],
    version: "1.0.0",
    createdAt: now,
    updatedAt: now,
    ...params,
  };
}

/**
 * Find all {{variableName}} placeholders in a template string
 */
export function detectVariables(template: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(template)) !== null) {
    found.add(match[1]);
  }
  return [...found];
}

/**
 * Validate a template: check syntax and variable consistency
 */
export function validateTemplate(template: PromptTemplate): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!template.id || template.id.trim() === "") {
    errors.push("id is required");
  }

  if (!template.name || template.name.trim() === "") {
    errors.push("name is required");
  }

  if (!template.template || template.template.trim() === "") {
    errors.push("template content is required");
  }

  const validRoles: PromptRole[] = ["system", "user", "assistant"];
  if (!validRoles.includes(template.role)) {
    errors.push(`role must be one of: ${validRoles.join(", ")}`);
  }

  // Check for unclosed braces
  const unclosed = /\{\{(?![^{}]*\}\})/;
  if (unclosed.test(template.template)) {
    errors.push("template has unclosed {{ braces");
  }

  // Check variable names for consistency
  const detectedVars = detectVariables(template.template);
  const definedVarNames = new Set(template.variables.map((v) => v.name));

  for (const varName of detectedVars) {
    if (!definedVarNames.has(varName)) {
      errors.push(`variable "{{${varName}}}" is used in template but not defined in variables`);
    }
  }

  // Check version semver-ish format
  if (template.version && !/^\d+\.\d+(\.\d+)?$/.test(template.version)) {
    errors.push("version must follow semver format (e.g. 1.0.0)");
  }

  if (template.temperature !== undefined) {
    if (template.temperature < 0 || template.temperature > 2) {
      errors.push("temperature must be between 0 and 2");
    }
  }

  if (template.maxTokens !== undefined && template.maxTokens <= 0) {
    errors.push("maxTokens must be a positive number");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Render a template by substituting variables; track missing/used
 */
export function renderTemplate(
  template: PromptTemplate,
  variables: Record<string, unknown>
): RenderedPrompt {
  const variablesUsed: string[] = [];
  const missingVariables: string[] = [];

  // Merge defaults with provided values
  const merged: Record<string, unknown> = {};
  for (const varDef of template.variables) {
    if (variables[varDef.name] !== undefined) {
      merged[varDef.name] = variables[varDef.name];
    } else if (varDef.defaultValue !== undefined) {
      merged[varDef.name] = varDef.defaultValue;
    } else if (varDef.required) {
      missingVariables.push(varDef.name);
    }
  }

  let content = template.template;

  // Replace all {{varName}} with values
  content = content.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    if (merged[name] !== undefined) {
      variablesUsed.push(name);
      return String(merged[name]);
    }
    // Variable not available — keep placeholder to make it obvious
    return match;
  });

  return {
    role: template.role,
    content,
    tokensEstimate: estimateTokens(content),
    variablesUsed: [...new Set(variablesUsed)],
    missingVariables,
  };
}

/**
 * Strict render — fails if any required variable is missing
 */
export function renderTemplateStrict(
  template: PromptTemplate,
  variables: Record<string, unknown>
): { content: string } | { error: string } {
  const rendered = renderTemplate(template, variables);
  if (rendered.missingVariables.length > 0) {
    return {
      error: `Missing required variables: ${rendered.missingVariables.join(", ")}`,
    };
  }
  return { content: rendered.content };
}

/**
 * Rough token estimate: word count * 1.3
 */
export function estimateTokens(text: string): number {
  if (!text || text.trim() === "") return 0;
  const words = text.trim().split(/\s+/).length;
  return Math.ceil(words * 1.3);
}

/**
 * Build a conversation by rendering multiple templates in sequence
 */
export function buildConversation(
  templates: PromptTemplate[],
  variables: Record<string, unknown>
): RenderedPrompt[] {
  return templates.map((t) => renderTemplate(t, variables));
}

/**
 * Merge two variable sets (overrides take precedence)
 */
export function mergeVariables(
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  return { ...defaults, ...overrides };
}

/**
 * Build a schema map from template variable definitions
 */
export function extractVariableSchema(
  template: PromptTemplate
): Record<string, TemplateVariable> {
  const schema: Record<string, TemplateVariable> = {};
  for (const variable of template.variables) {
    schema[variable.name] = variable;
  }
  return schema;
}

/**
 * Validate a value against a variable definition
 */
export function validateVariableValue(
  variable: TemplateVariable,
  value: unknown
): { valid: boolean; error?: string } {
  if (value === null || value === undefined) {
    if (variable.required && variable.defaultValue === undefined) {
      return { valid: false, error: `Variable "${variable.name}" is required` };
    }
    return { valid: true };
  }

  // Type check
  switch (variable.type) {
    case "string":
      if (typeof value !== "string") {
        return { valid: false, error: `Variable "${variable.name}" must be a string` };
      }
      // Regex validation
      if (variable.validator) {
        try {
          const re = new RegExp(variable.validator);
          if (!re.test(value)) {
            return {
              valid: false,
              error: `Variable "${variable.name}" does not match pattern ${variable.validator}`,
            };
          }
        } catch {
          return { valid: false, error: `Variable "${variable.name}" has invalid validator regex` };
        }
      }
      break;
    case "number":
      if (typeof value !== "number") {
        return { valid: false, error: `Variable "${variable.name}" must be a number` };
      }
      break;
    case "boolean":
      if (typeof value !== "boolean") {
        return { valid: false, error: `Variable "${variable.name}" must be a boolean` };
      }
      break;
    case "array":
      if (!Array.isArray(value)) {
        return { valid: false, error: `Variable "${variable.name}" must be an array` };
      }
      break;
    case "object":
      if (typeof value !== "object" || Array.isArray(value)) {
        return { valid: false, error: `Variable "${variable.name}" must be an object` };
      }
      break;
  }

  return { valid: true };
}

/**
 * Search templates by name, description, or tags
 */
export function searchTemplates(
  templates: PromptTemplate[],
  query: string
): PromptTemplate[] {
  if (!query || query.trim() === "") return [...templates];
  const lowerQuery = query.toLowerCase();

  return templates.filter((t) => {
    return (
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
    );
  });
}

/**
 * Deep clone a template with new id and timestamps (and optional overrides)
 */
export function cloneTemplate(
  template: PromptTemplate,
  overrides: Partial<PromptTemplate> = {}
): PromptTemplate {
  const now = new Date();
  const newId = `${template.id}-copy-${Date.now()}`;

  return {
    ...JSON.parse(JSON.stringify({
      ...template,
      id: newId,
      name: `${template.name} (Copy)`,
      createdAt: now,
      updatedAt: now,
    })),
    // Re-parse dates (JSON.parse loses Date instances)
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Compute statistics across a set of templates
 */
export function computeTemplateStats(templates: PromptTemplate[]): {
  totalTemplates: number;
  byRole: Record<PromptRole, number>;
  byModel: Record<string, number>;
  avgVariables: number;
  withDefaults: number;
} {
  const byRole: Record<PromptRole, number> = { system: 0, user: 0, assistant: 0 };
  const byModel: Record<string, number> = {};
  let totalVars = 0;
  let withDefaults = 0;

  for (const t of templates) {
    byRole[t.role] = (byRole[t.role] ?? 0) + 1;

    const model = t.model ?? "unspecified";
    byModel[model] = (byModel[model] ?? 0) + 1;

    totalVars += t.variables.length;

    const hasDefaults = t.variables.some((v) => v.defaultValue !== undefined);
    if (hasDefaults) withDefaults++;
  }

  return {
    totalTemplates: templates.length,
    byRole,
    byModel,
    avgVariables: templates.length > 0 ? totalVars / templates.length : 0,
    withDefaults,
  };
}
