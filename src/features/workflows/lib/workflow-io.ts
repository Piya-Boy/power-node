/**
 * Phase 55 — Workflow Import/Export
 * Pure utility functions for importing and exporting workflows.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = "json" | "yaml" | "compressed" | "template";
export type ImportValidationLevel = "strict" | "lenient" | "skip";

export interface WorkflowExport {
  format: ExportFormat;
  version: string; // export schema version e.g. "1.0"
  exportedAt: Date;
  workflowCount: number;
  workflows: ExportedWorkflow[];
  metadata: {
    exporter: string; // "powernode"
    platform: string; // "powernode-1.0"
  };
}

export interface ExportedWorkflow {
  id: string;
  name: string;
  description?: string;
  nodes: unknown[];
  edges: unknown[];
  settings: Record<string, unknown>;
  tags: string[];
  version: number;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: Array<{ workflowIndex: number; message: string }>;
  warnings: string[];
  workflows: ExportedWorkflow[];
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  nodes: unknown[];
  edges: unknown[];
  settings: Record<string, unknown>;
  requiredCredentials: string[];
  tags: string[];
  author: string;
  version: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Export creation
// ---------------------------------------------------------------------------

export function createExport(
  workflows: ExportedWorkflow[],
  format: ExportFormat = "json",
): WorkflowExport {
  return {
    format,
    version: "1.0",
    exportedAt: new Date(),
    workflowCount: workflows.length,
    workflows,
    metadata: {
      exporter: "powernode",
      platform: "powernode-1.0",
    },
  };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export function validateExport(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Export data must be an object"] };
  }

  const obj = data as Record<string, unknown>;

  if (!obj.format || !["json", "yaml", "compressed", "template"].includes(obj.format as string)) {
    errors.push("Invalid or missing format");
  }

  if (!obj.version || typeof obj.version !== "string") {
    errors.push("Missing or invalid version");
  }

  if (!obj.exportedAt) {
    errors.push("Missing exportedAt");
  }

  if (typeof obj.workflowCount !== "number") {
    errors.push("Missing or invalid workflowCount");
  }

  if (!Array.isArray(obj.workflows)) {
    errors.push("Missing or invalid workflows array");
  }

  if (!obj.metadata || typeof obj.metadata !== "object") {
    errors.push("Missing metadata");
  } else {
    const meta = obj.metadata as Record<string, unknown>;
    if (!meta.exporter) errors.push("Missing metadata.exporter");
    if (!meta.platform) errors.push("Missing metadata.platform");
  }

  return { valid: errors.length === 0, errors };
}

export function parseExport(json: string): WorkflowExport | null {
  try {
    const parsed = JSON.parse(json);
    const { valid } = validateExport(parsed);
    if (!valid) return null;

    // Convert exportedAt string back to Date
    if (typeof parsed.exportedAt === "string") {
      parsed.exportedAt = new Date(parsed.exportedAt);
    }

    return parsed as WorkflowExport;
  } catch {
    return null;
  }
}

export function validateWorkflowForExport(
  workflow: unknown,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!workflow || typeof workflow !== "object") {
    return { valid: false, errors: ["Workflow must be an object"] };
  }

  const wf = workflow as Record<string, unknown>;

  if (!wf.id || typeof wf.id !== "string") {
    errors.push("Missing or invalid id");
  }

  if (!wf.name || typeof wf.name !== "string") {
    errors.push("Missing or invalid name");
  }

  if (!Array.isArray(wf.nodes)) {
    errors.push("Missing or invalid nodes array");
  }

  if (!Array.isArray(wf.edges)) {
    errors.push("Missing or invalid edges array");
  }

  if (typeof wf.version !== "number") {
    errors.push("Missing or invalid version number");
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = ["apikey", "password", "secret", "token", "credential", "auth"];

function sanitizeSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settings)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some((k) => lowerKey.includes(k))) {
      // Omit sensitive fields
      continue;
    }
    result[key] = value;
  }
  return result;
}

export function sanitizeForExport(workflow: ExportedWorkflow): ExportedWorkflow {
  return {
    ...workflow,
    settings: sanitizeSettings(workflow.settings),
  };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export function validateImportedWorkflow(
  workflow: unknown,
  level: ImportValidationLevel,
): { valid: boolean; errors: string[]; warnings: string[] } {
  if (level === "skip") {
    return { valid: true, errors: [], warnings: [] };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!workflow || typeof workflow !== "object") {
    return { valid: false, errors: ["Workflow must be an object"], warnings: [] };
  }

  const wf = workflow as Record<string, unknown>;

  // Both strict and lenient require id and name
  if (!wf.id || typeof wf.id !== "string") {
    errors.push("Missing or invalid id");
  }

  if (!wf.name || typeof wf.name !== "string") {
    errors.push("Missing or invalid name");
  }

  if (!Array.isArray(wf.nodes)) {
    if (level === "strict") {
      errors.push("Missing nodes array");
    } else {
      warnings.push("Missing nodes array");
    }
  }

  if (!Array.isArray(wf.edges)) {
    if (level === "strict") {
      errors.push("Missing edges array");
    } else {
      warnings.push("Missing edges array");
    }
  }

  if (level === "strict") {
    if (typeof wf.version !== "number") {
      errors.push("Missing version");
    }
    if (!wf.settings || typeof wf.settings !== "object") {
      errors.push("Missing settings");
    }
  } else {
    if (typeof wf.version !== "number") {
      warnings.push("Missing version, defaulting to 1");
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function importFromExport(
  exportData: WorkflowExport,
  options?: { validationLevel?: ImportValidationLevel; skipDuplicates?: boolean; existingIds?: string[] },
): ImportResult {
  const level: ImportValidationLevel = options?.validationLevel ?? "lenient";
  const existingIds = new Set(options?.existingIds ?? []);

  const errors: Array<{ workflowIndex: number; message: string }> = [];
  const warnings: string[] = [];
  const imported: ExportedWorkflow[] = [];
  let skipped = 0;

  for (let i = 0; i < exportData.workflows.length; i++) {
    const workflow = exportData.workflows[i];

    // Check for duplicates
    if (options?.skipDuplicates && existingIds.has(workflow.id)) {
      warnings.push(`Workflow "${workflow.id}" already exists, skipping`);
      skipped++;
      continue;
    }

    const { valid, errors: wfErrors, warnings: wfWarnings } = validateImportedWorkflow(
      workflow,
      level,
    );

    for (const w of wfWarnings) {
      warnings.push(`Workflow[${i}]: ${w}`);
    }

    if (!valid) {
      for (const e of wfErrors) {
        errors.push({ workflowIndex: i, message: e });
      }
      skipped++;
    } else {
      imported.push(workflow);
    }
  }

  return {
    success: errors.length === 0,
    imported: imported.length,
    skipped,
    errors,
    warnings,
    workflows: imported,
  };
}

export function mergeImportSettings(
  existing: Record<string, unknown>,
  imported: Record<string, unknown>,
): Record<string, unknown> {
  // Imported settings override existing, but existing keys not in imported are preserved
  return { ...existing, ...imported };
}

// ---------------------------------------------------------------------------
// Template management
// ---------------------------------------------------------------------------

export function createTemplate(
  workflow: ExportedWorkflow,
  metadata: {
    id: string;
    description: string;
    category: string;
    requiredCredentials?: string[];
    author?: string;
    version?: string;
  },
): WorkflowTemplate {
  return {
    id: metadata.id,
    name: workflow.name,
    description: metadata.description,
    category: metadata.category,
    nodes: workflow.nodes,
    edges: workflow.edges,
    settings: workflow.settings,
    requiredCredentials: metadata.requiredCredentials ?? [],
    tags: workflow.tags ?? [],
    author: metadata.author ?? "unknown",
    version: metadata.version ?? "1.0",
    createdAt: new Date(),
  };
}

export function instantiateTemplate(
  template: WorkflowTemplate,
  overrides?: Partial<ExportedWorkflow>,
): ExportedWorkflow {
  const base: ExportedWorkflow = {
    id: `wf-${Date.now()}`,
    name: template.name,
    description: template.description,
    nodes: template.nodes,
    edges: template.edges,
    settings: { ...template.settings },
    tags: [...template.tags],
    version: 1,
  };

  return {
    ...base,
    ...overrides,
  };
}

export function validateTemplate(template: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!template || typeof template !== "object") {
    return { valid: false, errors: ["Template must be an object"] };
  }

  const tmpl = template as Record<string, unknown>;

  if (!tmpl.id || typeof tmpl.id !== "string") errors.push("Missing or invalid id");
  if (!tmpl.name || typeof tmpl.name !== "string") errors.push("Missing or invalid name");
  if (!tmpl.description || typeof tmpl.description !== "string")
    errors.push("Missing or invalid description");
  if (!tmpl.category || typeof tmpl.category !== "string") errors.push("Missing or invalid category");
  if (!Array.isArray(tmpl.nodes)) errors.push("Missing or invalid nodes array");
  if (!Array.isArray(tmpl.edges)) errors.push("Missing or invalid edges array");
  if (!tmpl.author || typeof tmpl.author !== "string") errors.push("Missing or invalid author");
  if (!tmpl.version || typeof tmpl.version !== "string") errors.push("Missing or invalid version");

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

export function detectFormat(content: string): ExportFormat | null {
  const trimmed = content.trim();

  // JSON starts with { or [
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      // Check if it's a template format
      const parsed = JSON.parse(trimmed);
      if (parsed?.format === "template") return "template";
      if (parsed?.format === "compressed") return "compressed";
      return "json";
    } catch {
      return null;
    }
  }

  // YAML detection: starts with --- or has key: value patterns
  if (trimmed.startsWith("---") || /^\w+:\s/.test(trimmed)) {
    return "yaml";
  }

  // Base64-encoded compressed data
  if (/^[A-Za-z0-9+/=]{20,}$/.test(trimmed)) {
    return "compressed";
  }

  return null;
}

// ---------------------------------------------------------------------------
// Import complexity estimation
// ---------------------------------------------------------------------------

export function estimateImportComplexity(exportData: WorkflowExport): {
  nodeCount: number;
  edgeCount: number;
  complexity: "simple" | "moderate" | "complex";
} {
  let nodeCount = 0;
  let edgeCount = 0;

  for (const workflow of exportData.workflows) {
    nodeCount += Array.isArray(workflow.nodes) ? workflow.nodes.length : 0;
    edgeCount += Array.isArray(workflow.edges) ? workflow.edges.length : 0;
  }

  let complexity: "simple" | "moderate" | "complex";
  if (nodeCount <= 10 && edgeCount <= 15) {
    complexity = "simple";
  } else if (nodeCount <= 50 && edgeCount <= 75) {
    complexity = "moderate";
  } else {
    complexity = "complex";
  }

  return { nodeCount, edgeCount, complexity };
}

// ---------------------------------------------------------------------------
// Import summary
// ---------------------------------------------------------------------------

export function buildImportSummary(result: ImportResult): string {
  const parts: string[] = [];

  if (result.success) {
    parts.push(`Successfully imported ${result.imported} workflow(s).`);
  } else {
    parts.push(`Import completed with errors.`);
    parts.push(`Imported: ${result.imported}, Skipped: ${result.skipped}.`);
  }

  if (result.errors.length > 0) {
    parts.push(`Errors (${result.errors.length}): ${result.errors.map((e) => e.message).join("; ")}.`);
  }

  if (result.warnings.length > 0) {
    parts.push(`Warnings (${result.warnings.length}): ${result.warnings.join("; ")}.`);
  }

  return parts.join(" ");
}
