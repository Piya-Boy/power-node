/**
 * Phase 65 — Workflow Output Formatter
 * Pure utilities for transforming, serializing, and presenting
 * workflow node output data in various formats.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type OutputFormat = "json" | "csv" | "tsv" | "xml" | "yaml" | "markdown" | "html-table" | "plain";

export type DataType = "string" | "number" | "boolean" | "null" | "array" | "object" | "date" | "binary";

export interface FormatOptions {
  indent?: number;            // JSON/YAML indentation
  maxDepth?: number;          // max recursion depth for nested objects
  maxArrayItems?: number;     // truncate arrays longer than this
  maxStringLength?: number;   // truncate strings longer than this
  dateFormat?: "iso" | "unix" | "human";
  includeNull?: boolean;      // whether to include null values in output
  csvDelimiter?: string;      // defaults to comma
  csvHeaders?: boolean;       // include header row
  tableStyle?: "simple" | "github" | "html";
}

export interface FormattedOutput {
  format: OutputFormat;
  content: string;
  truncated: boolean;
  itemCount?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect the data type of a value.
 */
export function detectType(value: unknown): DataType {
  if (value === null) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(value)) return "date";
    return "string";
  }
  if (value instanceof Date) return "date";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return "string";
}

/**
 * Infer the schema (key→type map) of an array of objects.
 */
export function inferSchema(rows: Record<string, unknown>[]): Map<string, DataType> {
  const schema = new Map<string, DataType>();
  for (const row of rows) {
    for (const [key, val] of Object.entries(row)) {
      if (!schema.has(key)) {
        schema.set(key, detectType(val));
      }
    }
  }
  return schema;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a value as JSON.
 */
export function toJson(value: unknown, options: FormatOptions = {}): FormattedOutput {
  const { indent = 2, maxDepth = 10, maxArrayItems, maxStringLength, includeNull = true } = options;
  let truncated = false;

  function process(val: unknown, depth: number): unknown {
    if (depth > maxDepth) return "[max depth reached]";
    if (val === null) return includeNull ? null : undefined;
    if (typeof val === "string") {
      if (maxStringLength && val.length > maxStringLength) {
        truncated = true;
        return val.slice(0, maxStringLength) + "…";
      }
      return val;
    }
    if (Array.isArray(val)) {
      const items = maxArrayItems && val.length > maxArrayItems
        ? (truncated = true, val.slice(0, maxArrayItems))
        : val;
      return items.map((item) => process(item, depth + 1));
    }
    if (typeof val === "object" && val !== null) {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        const processed = process(v, depth + 1);
        if (processed !== undefined) result[k] = processed;
      }
      return result;
    }
    return val;
  }

  const processed = process(value, 0);
  const content = JSON.stringify(processed, null, indent);
  return { format: "json", content, truncated };
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV / TSV Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format an array of objects as CSV.
 */
export function toCsv(
  rows: Record<string, unknown>[],
  options: FormatOptions = {}
): FormattedOutput {
  const { csvDelimiter = ",", csvHeaders = true, maxArrayItems, maxStringLength } = options;
  let truncated = false;

  if (rows.length === 0) return { format: "csv", content: "", truncated: false };

  const data = maxArrayItems && rows.length > maxArrayItems
    ? (truncated = true, rows.slice(0, maxArrayItems))
    : rows;

  const columns = [...new Set(data.flatMap((r) => Object.keys(r)))];

  function csvValue(val: unknown): string {
    if (val === null || val === undefined) return "";
    let str = String(val);
    if (maxStringLength && str.length > maxStringLength) {
      truncated = true;
      str = str.slice(0, maxStringLength) + "…";
    }
    if (str.includes(csvDelimiter) || str.includes('"') || str.includes("\n")) {
      str = `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  const lines: string[] = [];
  if (csvHeaders) lines.push(columns.map(csvValue).join(csvDelimiter));
  for (const row of data) {
    lines.push(columns.map((col) => csvValue(row[col])).join(csvDelimiter));
  }

  return {
    format: "csv",
    content: lines.join("\n"),
    truncated,
    itemCount: data.length,
  };
}

/**
 * Format as TSV (tab-separated values).
 */
export function toTsv(rows: Record<string, unknown>[], options: FormatOptions = {}): FormattedOutput {
  const result = toCsv(rows, { ...options, csvDelimiter: "\t" });
  return { ...result, format: "tsv" };
}

// ─────────────────────────────────────────────────────────────────────────────
// YAML-like Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a value as YAML (simplified, no anchors/references).
 */
export function toYaml(value: unknown, options: FormatOptions = {}): FormattedOutput {
  const { maxDepth = 10, indent = 2 } = options;
  let truncated = false;

  function render(val: unknown, depth: number, currentIndent: string): string {
    if (depth > maxDepth) return `${currentIndent}"[max depth reached]"\n`;

    if (val === null) return `${currentIndent}null\n`;
    if (typeof val === "boolean") return `${currentIndent}${val}\n`;
    if (typeof val === "number") return `${currentIndent}${val}\n`;
    if (typeof val === "string") {
      if (val.includes("\n") || val.includes(":") || val.includes("#")) {
        return `${currentIndent}"${val.replace(/"/g, '\\"')}"\n`;
      }
      return `${currentIndent}${val}\n`;
    }
    if (val instanceof Date) return `${currentIndent}${val.toISOString()}\n`;

    if (Array.isArray(val)) {
      if (val.length === 0) return `${currentIndent}[]\n`;
      const nextIndent = currentIndent + " ".repeat(indent);
      return val.map((item) => {
        const rendered = render(item, depth + 1, nextIndent + " ".repeat(indent - 2)).trimEnd();
        return `${nextIndent}- ${rendered.trimStart()}\n`;
      }).join("");
    }

    if (typeof val === "object" && val !== null) {
      const entries = Object.entries(val as Record<string, unknown>);
      if (entries.length === 0) return `${currentIndent}{}\n`;
      const nextIndent = currentIndent + " ".repeat(indent);
      return entries.map(([k, v]) => {
        const rendered = render(v, depth + 1, nextIndent + " ".repeat(indent)).trimEnd();
        if (typeof v === "object" && v !== null && !Array.isArray(v)) {
          return `${nextIndent}${k}:\n${render(v, depth + 1, nextIndent + " ".repeat(indent))}`;
        }
        return `${nextIndent}${k}: ${rendered.trimStart()}\n`;
      }).join("");
    }

    return `${currentIndent}${String(val)}\n`;
  }

  const content = render(value, 0, "").trimEnd();
  return { format: "yaml", content, truncated };
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown Table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format an array of objects as a Markdown table.
 */
export function toMarkdownTable(
  rows: Record<string, unknown>[],
  options: FormatOptions = {}
): FormattedOutput {
  const { maxArrayItems } = options;
  let truncated = false;

  if (rows.length === 0) return { format: "markdown", content: "", truncated: false };

  const data = maxArrayItems && rows.length > maxArrayItems
    ? (truncated = true, rows.slice(0, maxArrayItems))
    : rows;

  const columns = [...new Set(data.flatMap((r) => Object.keys(r)))];

  function cell(val: unknown): string {
    if (val === null || val === undefined) return "";
    return String(val).replace(/\|/g, "\\|").replace(/\n/g, " ");
  }

  const header = `| ${columns.join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const bodyRows = data.map((row) => `| ${columns.map((c) => cell(row[c])).join(" | ")} |`);

  return {
    format: "markdown",
    content: [header, separator, ...bodyRows].join("\n"),
    truncated,
    itemCount: data.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML Table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format an array of objects as an HTML table.
 */
export function toHtmlTable(
  rows: Record<string, unknown>[],
  options: FormatOptions = {}
): FormattedOutput {
  const { maxArrayItems } = options;
  let truncated = false;

  if (rows.length === 0) return { format: "html-table", content: "<table></table>", truncated: false };

  const data = maxArrayItems && rows.length > maxArrayItems
    ? (truncated = true, rows.slice(0, maxArrayItems))
    : rows;

  const columns = [...new Set(data.flatMap((r) => Object.keys(r)))];

  function escape(val: unknown): string {
    return String(val === null || val === undefined ? "" : val)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const thead = `<thead><tr>${columns.map((c) => `<th>${escape(c)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${data.map((row) =>
    `<tr>${columns.map((c) => `<td>${escape(row[c])}</td>`).join("")}</tr>`
  ).join("")}</tbody>`;

  return {
    format: "html-table",
    content: `<table>${thead}${tbody}</table>`,
    truncated,
    itemCount: data.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// XML Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a value as XML.
 */
export function toXml(
  value: unknown,
  options: { rootTag?: string; indent?: number; maxDepth?: number } = {}
): FormattedOutput {
  const { rootTag = "root", indent = 2, maxDepth = 10 } = options;

  function escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function render(val: unknown, tag: string, depth: number, currentIndent: string): string {
    if (depth > maxDepth) return `${currentIndent}<${tag}>[max depth]</${tag}>\n`;

    const pad = " ".repeat(indent);
    const next = currentIndent + pad;

    if (val === null || val === undefined) return `${currentIndent}<${tag}/>\n`;
    if (typeof val !== "object") return `${currentIndent}<${tag}>${escapeXml(String(val))}</${tag}>\n`;

    if (Array.isArray(val)) {
      return val.map((item, i) => render(item, `item`, depth + 1, currentIndent)).join("");
    }

    const children = Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => render(v, sanitizeTag(k), depth + 1, next))
      .join("");

    return `${currentIndent}<${tag}>\n${children}${currentIndent}</${tag}>\n`;
  }

  const content = render(value, rootTag, 0, "").trimEnd();
  return { format: "xml", content, truncated: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Plain Text Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a value as human-readable plain text.
 */
export function toPlainText(value: unknown, options: FormatOptions = {}): FormattedOutput {
  const { maxDepth = 5, indent = 2 } = options;

  function render(val: unknown, depth: number): string {
    if (depth > maxDepth) return "[...]";
    if (val === null) return "null";
    if (typeof val === "boolean") return val ? "true" : "false";
    if (typeof val === "number") return String(val);
    if (typeof val === "string") return val;
    if (val instanceof Date) return val.toISOString();

    if (Array.isArray(val)) {
      if (val.length === 0) return "[]";
      const pad = " ".repeat((depth + 1) * indent);
      return "[\n" + val.map((item) => `${pad}${render(item, depth + 1)}`).join(",\n") + "\n" + " ".repeat(depth * indent) + "]";
    }

    if (typeof val === "object") {
      const entries = Object.entries(val as Record<string, unknown>);
      if (entries.length === 0) return "{}";
      const pad = " ".repeat((depth + 1) * indent);
      return "{\n" + entries.map(([k, v]) => `${pad}${k}: ${render(v, depth + 1)}`).join("\n") + "\n" + " ".repeat(depth * indent) + "}";
    }

    return String(val);
  }

  return { format: "plain", content: render(value, 0), truncated: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Universal Formatter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format data in the requested output format.
 */
export function formatOutput(
  value: unknown,
  format: OutputFormat,
  options: FormatOptions = {}
): FormattedOutput {
  switch (format) {
    case "json": return toJson(value, options);
    case "csv":
      return Array.isArray(value)
        ? toCsv(value as Record<string, unknown>[], options)
        : toCsv([value as Record<string, unknown>], options);
    case "tsv":
      return Array.isArray(value)
        ? toTsv(value as Record<string, unknown>[], options)
        : toTsv([value as Record<string, unknown>], options);
    case "yaml": return toYaml(value, options);
    case "markdown":
      return Array.isArray(value)
        ? toMarkdownTable(value as Record<string, unknown>[], options)
        : toMarkdownTable([value as Record<string, unknown>], options);
    case "html-table":
      return Array.isArray(value)
        ? toHtmlTable(value as Record<string, unknown>[], options)
        : toHtmlTable([value as Record<string, unknown>], options);
    case "xml": return toXml(value, options);
    case "plain": return toPlainText(value, options);
    default: return toJson(value, options);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeTag(name: string): string {
  // XML tag: start with letter, no spaces
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  return /^[a-zA-Z_]/.test(safe) ? safe : `_${safe}`;
}
