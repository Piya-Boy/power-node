import { describe, it, expect } from "vitest";
import {
  validateNodeDefinition,
  getFieldDefault,
  getNodeDefaultData,
  validateNodeData,
  searchCustomNodes,
  groupNodesByCategory,
  type CustomNodeDefinition,
  type NodeField,
} from "./custom-node-sdk";

const makeDefinition = (overrides: Partial<CustomNodeDefinition> = {}): CustomNodeDefinition => ({
  id: "my_custom_node",
  name: "My Custom Node",
  description: "A custom node for testing",
  category: "Custom",
  color: "#FF5733",
  icon: "Zap",
  inputs: ["main"],
  outputs: ["main"],
  version: "1.0.0",
  fields: [
    { name: "apiUrl", label: "API URL", type: "string", required: true },
    { name: "timeout", label: "Timeout (ms)", type: "number", default: 5000 },
  ],
  ...overrides,
});

describe("validateNodeDefinition", () => {
  it("validates a correct definition", () => {
    const result = validateNodeDefinition(makeDefinition());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects missing ID", () => {
    const result = validateNodeDefinition(makeDefinition({ id: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes("id"))).toBe(true);
  });

  it("rejects invalid ID format", () => {
    const result = validateNodeDefinition(makeDefinition({ id: "My Node!" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("snake_case"))).toBe(true);
  });

  it("rejects reserved IDs", () => {
    const result = validateNodeDefinition(makeDefinition({ id: "code" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("reserved"))).toBe(true);
  });

  it("rejects missing name", () => {
    const result = validateNodeDefinition(makeDefinition({ name: "" }));
    expect(result.valid).toBe(false);
  });

  it("rejects long name", () => {
    const result = validateNodeDefinition(makeDefinition({ name: "A".repeat(51) }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("50"))).toBe(true);
  });

  it("rejects missing description", () => {
    const result = validateNodeDefinition(makeDefinition({ description: "" }));
    expect(result.valid).toBe(false);
  });

  it("rejects no inputs", () => {
    const result = validateNodeDefinition(makeDefinition({ inputs: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("input"))).toBe(true);
  });

  it("rejects invalid semver", () => {
    const result = validateNodeDefinition(makeDefinition({ version: "1.0" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("semver"))).toBe(true);
  });

  it("rejects duplicate field names", () => {
    const result = validateNodeDefinition(makeDefinition({
      fields: [
        { name: "field1", label: "Field 1", type: "string" },
        { name: "field1", label: "Field 1 again", type: "number" },
      ],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("rejects select field without options", () => {
    const result = validateNodeDefinition(makeDefinition({
      fields: [{ name: "method", label: "Method", type: "select" }],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("options"))).toBe(true);
  });
});

describe("getFieldDefault", () => {
  it("returns custom default if set", () => {
    const field: NodeField = { name: "x", label: "X", type: "number", default: 42 };
    expect(getFieldDefault(field)).toBe(42);
  });

  it("returns type defaults", () => {
    expect(getFieldDefault({ name: "s", label: "S", type: "string" })).toBe("");
    expect(getFieldDefault({ name: "n", label: "N", type: "number" })).toBe(0);
    expect(getFieldDefault({ name: "b", label: "B", type: "boolean" })).toBe(false);
    expect(getFieldDefault({ name: "j", label: "J", type: "json" })).toEqual({});
    expect(getFieldDefault({ name: "c", label: "C", type: "color" })).toBe("#000000");
  });

  it("returns first option value for select", () => {
    const field: NodeField = {
      name: "m",
      label: "Method",
      type: "select",
      options: [{ label: "GET", value: "GET" }, { label: "POST", value: "POST" }],
    };
    expect(getFieldDefault(field)).toBe("GET");
  });
});

describe("getNodeDefaultData", () => {
  it("creates data from all fields", () => {
    const def = makeDefinition();
    const data = getNodeDefaultData(def);
    expect(data.apiUrl).toBe("");
    expect(data.timeout).toBe(5000);
  });
});

describe("validateNodeData", () => {
  const def = makeDefinition({
    fields: [
      { name: "url", label: "URL", type: "string", required: true, validation: { minLength: 5 } },
      { name: "timeout", label: "Timeout", type: "number", validation: { min: 0, max: 60000 } },
      { name: "method", label: "Method", type: "select", options: [{ label: "GET", value: "GET" }, { label: "POST", value: "POST" }] },
    ],
  });

  it("validates correct data", () => {
    const result = validateNodeData(def, { url: "https://api.example.com", timeout: 5000, method: "GET" });
    expect(result.valid).toBe(true);
  });

  it("rejects missing required field", () => {
    const result = validateNodeData(def, { timeout: 1000 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("required"))).toBe(true);
  });

  it("rejects string too short", () => {
    const result = validateNodeData(def, { url: "http" }); // 4 chars, need 5
    expect(result.valid).toBe(false);
  });

  it("rejects number below min", () => {
    const result = validateNodeData(def, { url: "https://x.com", timeout: -1 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes(">= 0"))).toBe(true);
  });

  it("rejects number above max", () => {
    const result = validateNodeData(def, { url: "https://x.com", timeout: 99999 });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid select value", () => {
    const result = validateNodeData(def, { url: "https://x.com", method: "DELETE" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("invalid value"))).toBe(true);
  });
});

describe("searchCustomNodes", () => {
  const nodes: CustomNodeDefinition[] = [
    makeDefinition({ id: "slack_sender", name: "Slack Sender", description: "Send Slack messages", category: "Communication", keywords: ["slack", "messaging"] }),
    makeDefinition({ id: "csv_parser", name: "CSV Parser", description: "Parse CSV files", category: "Data" }),
    makeDefinition({ id: "email_sender", name: "Email Sender", description: "Send emails via SMTP", category: "Communication" }),
  ];

  it("searches by name", () => {
    const result = searchCustomNodes(nodes, "slack");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("slack_sender");
  });

  it("searches by description", () => {
    const result = searchCustomNodes(nodes, "parse");
    expect(result.some((n) => n.id === "csv_parser")).toBe(true);
  });

  it("searches by keyword", () => {
    const result = searchCustomNodes(nodes, "messaging");
    expect(result.some((n) => n.id === "slack_sender")).toBe(true);
  });

  it("searches by category", () => {
    const result = searchCustomNodes(nodes, "communication");
    expect(result).toHaveLength(2);
  });

  it("returns empty for no match", () => {
    expect(searchCustomNodes(nodes, "blockchain")).toHaveLength(0);
  });
});

describe("groupNodesByCategory", () => {
  it("groups nodes by category", () => {
    const nodes: CustomNodeDefinition[] = [
      makeDefinition({ id: "n1", category: "Data" }),
      makeDefinition({ id: "n2", category: "Data" }),
      makeDefinition({ id: "n3", category: "Communication" }),
    ];
    const groups = groupNodesByCategory(nodes);
    expect(groups["Data"]).toHaveLength(2);
    expect(groups["Communication"]).toHaveLength(1);
  });
});
