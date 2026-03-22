import { describe, it, expect } from "vitest";
import {
  detectType,
  inferSchema,
  toJson,
  toCsv,
  toTsv,
  toYaml,
  toMarkdownTable,
  toHtmlTable,
  toXml,
  toPlainText,
  formatOutput,
} from "./output-formatter";

// ─────────────────────────────────────────────────────────────────────────────
// detectType
// ─────────────────────────────────────────────────────────────────────────────

describe("detectType", () => {
  it("detects null", () => expect(detectType(null)).toBe("null"));
  it("detects boolean", () => {
    expect(detectType(true)).toBe("boolean");
    expect(detectType(false)).toBe("boolean");
  });
  it("detects number", () => expect(detectType(42)).toBe("number"));
  it("detects string", () => expect(detectType("hello")).toBe("string"));
  it("detects date string", () => expect(detectType("2025-01-01")).toBe("date"));
  it("detects Date object", () => expect(detectType(new Date())).toBe("date"));
  it("detects array", () => expect(detectType([])).toBe("array"));
  it("detects object", () => expect(detectType({})).toBe("object"));
});

// ─────────────────────────────────────────────────────────────────────────────
// inferSchema
// ─────────────────────────────────────────────────────────────────────────────

describe("inferSchema", () => {
  it("infers schema from rows", () => {
    const rows = [
      { name: "Alice", age: 30, active: true },
      { name: "Bob", age: 25 },
    ];
    const schema = inferSchema(rows);
    expect(schema.get("name")).toBe("string");
    expect(schema.get("age")).toBe("number");
    expect(schema.get("active")).toBe("boolean");
  });

  it("returns empty map for empty rows", () => {
    expect(inferSchema([]).size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toJson
// ─────────────────────────────────────────────────────────────────────────────

describe("toJson", () => {
  it("formats a simple object", () => {
    const result = toJson({ a: 1, b: "hello" });
    expect(result.format).toBe("json");
    expect(JSON.parse(result.content)).toEqual({ a: 1, b: "hello" });
    expect(result.truncated).toBe(false);
  });

  it("uses custom indent", () => {
    const result = toJson({ a: 1 }, { indent: 4 });
    expect(result.content).toContain("    ");
  });

  it("truncates arrays over maxArrayItems", () => {
    const result = toJson([1, 2, 3, 4, 5], { maxArrayItems: 3 });
    expect(result.truncated).toBe(true);
    const parsed = JSON.parse(result.content);
    expect(parsed).toHaveLength(3);
  });

  it("truncates long strings", () => {
    const result = toJson({ s: "a".repeat(100) }, { maxStringLength: 10 });
    expect(result.truncated).toBe(true);
    const parsed = JSON.parse(result.content);
    expect(parsed.s.length).toBeLessThan(20);
  });

  it("handles nested objects within maxDepth", () => {
    const result = toJson({ a: { b: { c: 1 } } }, { maxDepth: 2 });
    expect(result.format).toBe("json");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toCsv
// ─────────────────────────────────────────────────────────────────────────────

describe("toCsv", () => {
  const rows = [
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
  ];

  it("generates CSV with header", () => {
    const result = toCsv(rows);
    expect(result.format).toBe("csv");
    const lines = result.content.split("\n");
    expect(lines[0]).toContain("name");
    expect(lines[0]).toContain("age");
    expect(lines[1]).toContain("Alice");
  });

  it("omits header when csvHeaders=false", () => {
    const result = toCsv(rows, { csvHeaders: false });
    const lines = result.content.split("\n");
    expect(lines[0]).toContain("Alice");
    expect(lines[0]).not.toContain("name");
  });

  it("escapes values with commas", () => {
    const result = toCsv([{ name: "Smith, Jr.", age: 20 }]);
    expect(result.content).toContain('"Smith, Jr."');
  });

  it("escapes values with quotes", () => {
    const result = toCsv([{ desc: 'He said "hi"' }]);
    expect(result.content).toContain('""hi""');
  });

  it("returns empty string for no rows", () => {
    expect(toCsv([]).content).toBe("");
  });

  it("truncates at maxArrayItems", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: i }));
    const result = toCsv(many, { maxArrayItems: 5 });
    expect(result.truncated).toBe(true);
    expect(result.itemCount).toBe(5);
  });

  it("supports custom delimiter", () => {
    const result = toCsv(rows, { csvDelimiter: ";" });
    expect(result.content).toContain(";");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toTsv
// ─────────────────────────────────────────────────────────────────────────────

describe("toTsv", () => {
  it("generates TSV format", () => {
    const result = toTsv([{ a: 1, b: 2 }]);
    expect(result.format).toBe("tsv");
    expect(result.content).toContain("\t");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toYaml
// ─────────────────────────────────────────────────────────────────────────────

describe("toYaml", () => {
  it("formats a simple object", () => {
    const result = toYaml({ name: "Alice", age: 30 });
    expect(result.format).toBe("yaml");
    expect(result.content).toContain("name");
    expect(result.content).toContain("Alice");
  });

  it("formats arrays with dashes", () => {
    const result = toYaml([1, 2, 3]);
    expect(result.content).toContain("-");
  });

  it("formats null as null", () => {
    const result = toYaml(null);
    expect(result.content).toContain("null");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toMarkdownTable
// ─────────────────────────────────────────────────────────────────────────────

describe("toMarkdownTable", () => {
  const rows = [
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
  ];

  it("generates markdown table", () => {
    const result = toMarkdownTable(rows);
    expect(result.format).toBe("markdown");
    expect(result.content).toContain("| name | age |");
    expect(result.content).toContain("| --- |");
    expect(result.content).toContain("| Alice | 30 |");
  });

  it("returns empty for no rows", () => {
    expect(toMarkdownTable([]).content).toBe("");
  });

  it("escapes pipe characters in values", () => {
    const result = toMarkdownTable([{ name: "A|B" }]);
    expect(result.content).toContain("A\\|B");
  });

  it("truncates at maxArrayItems", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: i }));
    const result = toMarkdownTable(many, { maxArrayItems: 3 });
    expect(result.truncated).toBe(true);
    expect(result.itemCount).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toHtmlTable
// ─────────────────────────────────────────────────────────────────────────────

describe("toHtmlTable", () => {
  it("generates HTML table with thead and tbody", () => {
    const result = toHtmlTable([{ name: "Alice", age: 30 }]);
    expect(result.format).toBe("html-table");
    expect(result.content).toContain("<table>");
    expect(result.content).toContain("<thead>");
    expect(result.content).toContain("<tbody>");
    expect(result.content).toContain("<th>name</th>");
    expect(result.content).toContain("<td>Alice</td>");
  });

  it("escapes HTML special characters", () => {
    const result = toHtmlTable([{ desc: "<script>alert('xss')</script>" }]);
    expect(result.content).toContain("&lt;script&gt;");
    expect(result.content).not.toContain("<script>");
  });

  it("returns empty table for no rows", () => {
    expect(toHtmlTable([]).content).toContain("<table>");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toXml
// ─────────────────────────────────────────────────────────────────────────────

describe("toXml", () => {
  it("generates XML with root tag", () => {
    const result = toXml({ name: "Alice" }, { rootTag: "person" });
    expect(result.format).toBe("xml");
    expect(result.content).toContain("<person>");
    expect(result.content).toContain("<name>Alice</name>");
    expect(result.content).toContain("</person>");
  });

  it("escapes XML special characters", () => {
    const result = toXml({ val: "<test>&'\"" });
    expect(result.content).toContain("&lt;test&gt;");
    expect(result.content).toContain("&amp;");
  });

  it("renders null as self-closing tag", () => {
    const result = toXml({ empty: null });
    expect(result.content).toContain("<empty/>");
  });

  it("uses custom root tag", () => {
    const result = toXml("hello", { rootTag: "message" });
    expect(result.content).toContain("<message>hello</message>");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toPlainText
// ─────────────────────────────────────────────────────────────────────────────

describe("toPlainText", () => {
  it("formats string", () => {
    expect(toPlainText("hello").content).toBe("hello");
  });

  it("formats number", () => {
    expect(toPlainText(42).content).toBe("42");
  });

  it("formats null", () => {
    expect(toPlainText(null).content).toBe("null");
  });

  it("formats object with key:value", () => {
    const result = toPlainText({ a: 1, b: "x" });
    expect(result.content).toContain("a: 1");
    expect(result.content).toContain("b: x");
  });

  it("formats nested arrays", () => {
    const result = toPlainText([1, 2, 3]);
    expect(result.content).toContain("1");
    expect(result.content).toContain("2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatOutput (universal)
// ─────────────────────────────────────────────────────────────────────────────

describe("formatOutput", () => {
  const data = [{ id: 1, name: "Alice" }];

  it("routes to json", () => {
    expect(formatOutput(data, "json").format).toBe("json");
  });

  it("routes to csv", () => {
    expect(formatOutput(data, "csv").format).toBe("csv");
  });

  it("routes to tsv", () => {
    expect(formatOutput(data, "tsv").format).toBe("tsv");
  });

  it("routes to yaml", () => {
    expect(formatOutput(data, "yaml").format).toBe("yaml");
  });

  it("routes to markdown", () => {
    expect(formatOutput(data, "markdown").format).toBe("markdown");
  });

  it("routes to html-table", () => {
    expect(formatOutput(data, "html-table").format).toBe("html-table");
  });

  it("routes to xml", () => {
    expect(formatOutput(data, "xml").format).toBe("xml");
  });

  it("routes to plain", () => {
    expect(formatOutput(data, "plain").format).toBe("plain");
  });

  it("wraps non-array in array for csv/tsv/markdown/html", () => {
    const obj = { a: 1 };
    expect(formatOutput(obj, "csv").format).toBe("csv");
    expect(formatOutput(obj, "markdown").format).toBe("markdown");
  });
});
