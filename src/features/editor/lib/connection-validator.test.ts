import { describe, it, expect } from "vitest";
import {
  areTypesCompatible,
  findPort,
  getOutputPorts,
  getInputPorts,
  validateConnection,
  validateGraph,
  topologicalSort,
  getUpstreamNodes,
  getDownstreamNodes,
  wouldDisconnectGraph,
  type NodeDefinition,
  type Connection,
  type PortDefinition,
} from "./connection-validator";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makePort(overrides: Partial<PortDefinition> = {}): PortDefinition {
  return {
    id: "out1",
    name: "Output",
    direction: "output",
    dataType: "any",
    ...overrides,
  };
}

function makeNode(overrides: Partial<NodeDefinition> = {}): NodeDefinition {
  return {
    id: "n1",
    type: "action",
    ports: [
      makePort({ id: "out1", direction: "output", dataType: "object" }),
      makePort({ id: "in1", name: "Input", direction: "input", dataType: "object" }),
    ],
    ...overrides,
  };
}

function makeConn(overrides: Partial<Connection> = {}): Connection {
  return {
    id: "c1",
    sourceNodeId: "n1",
    sourcePortId: "out1",
    targetNodeId: "n2",
    targetPortId: "in1",
    ...overrides,
  };
}

// Standard 2-node setup
const nodeA: NodeDefinition = {
  id: "A",
  type: "trigger",
  isTrigger: true,
  ports: [makePort({ id: "outA", direction: "output", dataType: "object" })],
};

const nodeB: NodeDefinition = {
  id: "B",
  type: "action",
  ports: [
    makePort({ id: "inB", name: "Input", direction: "input", dataType: "object", required: true }),
    makePort({ id: "outB", direction: "output", dataType: "object" }),
  ],
};

const nodeC: NodeDefinition = {
  id: "C",
  type: "action",
  ports: [
    makePort({ id: "inC", name: "Input", direction: "input", dataType: "object", required: true }),
    makePort({ id: "outC", direction: "output", dataType: "object" }),
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// areTypesCompatible
// ─────────────────────────────────────────────────────────────────────────────

describe("areTypesCompatible", () => {
  it("any is compatible with everything", () => {
    expect(areTypesCompatible("any", "string")).toBe(true);
    expect(areTypesCompatible("string", "any")).toBe(true);
    expect(areTypesCompatible("any", "any")).toBe(true);
  });

  it("same types are compatible", () => {
    expect(areTypesCompatible("string", "string")).toBe(true);
    expect(areTypesCompatible("number", "number")).toBe(true);
    expect(areTypesCompatible("object", "object")).toBe(true);
  });

  it("different concrete types are incompatible", () => {
    expect(areTypesCompatible("string", "number")).toBe(false);
    expect(areTypesCompatible("array", "object")).toBe(false);
    expect(areTypesCompatible("boolean", "string")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findPort / getOutputPorts / getInputPorts
// ─────────────────────────────────────────────────────────────────────────────

describe("findPort", () => {
  it("finds an existing port by id", () => {
    const node = makeNode();
    expect(findPort(node, "out1")?.id).toBe("out1");
  });

  it("returns null for missing port", () => {
    expect(findPort(makeNode(), "nonexistent")).toBeNull();
  });
});

describe("getOutputPorts / getInputPorts", () => {
  it("returns only output ports", () => {
    const ports = getOutputPorts(nodeB);
    expect(ports.every((p) => p.direction === "output")).toBe(true);
    expect(ports).toHaveLength(1);
  });

  it("returns only input ports", () => {
    const ports = getInputPorts(nodeB);
    expect(ports.every((p) => p.direction === "input")).toBe(true);
    expect(ports).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateConnection
// ─────────────────────────────────────────────────────────────────────────────

describe("validateConnection", () => {
  it("accepts a valid connection", () => {
    const conn = makeConn({ sourceNodeId: "A", sourcePortId: "outA", targetNodeId: "B", targetPortId: "inB" });
    const result = validateConnection({ connection: conn, sourceNode: nodeA, targetNode: nodeB, existingConnections: [] });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("errors on self-loop", () => {
    const conn = makeConn({ sourceNodeId: "A", targetNodeId: "A" });
    const result = validateConnection({ connection: conn, sourceNode: nodeA, targetNode: nodeA, existingConnections: [] });
    expect(result.errors).toContain("Cannot connect a node to itself");
  });

  it("errors on missing source port", () => {
    const conn = makeConn({ sourceNodeId: "A", sourcePortId: "NOTEXIST", targetNodeId: "B", targetPortId: "inB" });
    const result = validateConnection({ connection: conn, sourceNode: nodeA, targetNode: nodeB, existingConnections: [] });
    expect(result.errors.some((e) => e.includes("Source port"))).toBe(true);
  });

  it("errors on missing target port", () => {
    const conn = makeConn({ sourceNodeId: "A", sourcePortId: "outA", targetNodeId: "B", targetPortId: "NOTEXIST" });
    const result = validateConnection({ connection: conn, sourceNode: nodeA, targetNode: nodeB, existingConnections: [] });
    expect(result.errors.some((e) => e.includes("Target port"))).toBe(true);
  });

  it("errors on type mismatch", () => {
    const typedA: NodeDefinition = {
      id: "A",
      type: "action",
      ports: [makePort({ id: "out", direction: "output", dataType: "string" })],
    };
    const typedB: NodeDefinition = {
      id: "B",
      type: "action",
      ports: [makePort({ id: "in", name: "Input", direction: "input", dataType: "number" })],
    };
    const conn = makeConn({ sourceNodeId: "A", sourcePortId: "out", targetNodeId: "B", targetPortId: "in" });
    const result = validateConnection({ connection: conn, sourceNode: typedA, targetNode: typedB, existingConnections: [] });
    expect(result.errors.some((e) => e.includes("Type mismatch"))).toBe(true);
  });

  it("errors on duplicate connection", () => {
    const conn = makeConn({ id: "c2", sourceNodeId: "A", sourcePortId: "outA", targetNodeId: "B", targetPortId: "inB" });
    const existing = [makeConn({ id: "c1", sourceNodeId: "A", sourcePortId: "outA", targetNodeId: "B", targetPortId: "inB" })];
    const result = validateConnection({ connection: conn, sourceNode: nodeA, targetNode: nodeB, existingConnections: existing });
    expect(result.errors).toContain("This connection already exists");
  });

  it("errors on multiple connections to non-multiple port", () => {
    const conn = makeConn({ id: "c2", sourceNodeId: "A", sourcePortId: "outA", targetNodeId: "B", targetPortId: "inB" });
    const existing = [makeConn({ id: "c1", sourceNodeId: "C", sourcePortId: "outC", targetNodeId: "B", targetPortId: "inB" })];
    const result = validateConnection({ connection: conn, sourceNode: nodeA, targetNode: nodeB, existingConnections: existing });
    expect(result.errors.some((e) => e.includes("multiple connections"))).toBe(true);
  });

  it("allows multiple connections to multiple-accepting port", () => {
    const multiB: NodeDefinition = {
      id: "B",
      type: "merge",
      ports: [makePort({ id: "inB", name: "Input", direction: "input", dataType: "object", multiple: true })],
    };
    const conn = makeConn({ id: "c2", sourceNodeId: "A", sourcePortId: "outA", targetNodeId: "B", targetPortId: "inB" });
    const existing = [makeConn({ id: "c1", sourceNodeId: "C", sourcePortId: "outC", targetNodeId: "B", targetPortId: "inB" })];
    const result = validateConnection({ connection: conn, sourceNode: nodeA, targetNode: multiB, existingConnections: existing });
    expect(result.errors).not.toContain(expect.stringContaining("multiple connections"));
  });

  it("errors when connecting to trigger node", () => {
    // Give the trigger node an input port so direction check passes
    const triggerWithInput: NodeDefinition = {
      id: "A",
      type: "trigger",
      isTrigger: true,
      ports: [
        makePort({ id: "outA", direction: "output", dataType: "object" }),
        makePort({ id: "inA", name: "Input", direction: "input", dataType: "object" }),
      ],
    };
    const conn = makeConn({ sourceNodeId: "B", sourcePortId: "outB", targetNodeId: "A", targetPortId: "inA" });
    const result = validateConnection({ connection: conn, sourceNode: nodeB, targetNode: triggerWithInput, existingConnections: [] });
    expect(result.errors.some((e) => e.includes("Trigger nodes"))).toBe(true);
  });

  it("errors when connecting from terminal node", () => {
    const terminal: NodeDefinition = {
      id: "T",
      type: "end",
      isTerminal: true,
      ports: [
        makePort({ id: "in", name: "Input", direction: "input", dataType: "any" }),
        makePort({ id: "out", direction: "output", dataType: "any" }),
      ],
    };
    const conn = makeConn({ sourceNodeId: "T", sourcePortId: "out", targetNodeId: "B", targetPortId: "inB" });
    const result = validateConnection({ connection: conn, sourceNode: terminal, targetNode: nodeB, existingConnections: [] });
    expect(result.errors.some((e) => e.includes("Terminal nodes"))).toBe(true);
  });

  it("errors when max outgoing connections exceeded", () => {
    const limitedA: NodeDefinition = { ...nodeA, maxOutgoingConnections: 1 };
    const existing = [makeConn({ id: "c1", sourceNodeId: "A", sourcePortId: "outA", targetNodeId: "C", targetPortId: "inC" })];
    const conn = makeConn({ id: "c2", sourceNodeId: "A", sourcePortId: "outA", targetNodeId: "B", targetPortId: "inB" });
    const result = validateConnection({ connection: conn, sourceNode: limitedA, targetNode: nodeB, existingConnections: existing });
    expect(result.errors.some((e) => e.includes("maximum outgoing"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateGraph
// ─────────────────────────────────────────────────────────────────────────────

describe("validateGraph", () => {
  it("validates a simple valid graph: A → B → C", () => {
    const connections: Connection[] = [
      makeConn({ id: "c1", sourceNodeId: "A", sourcePortId: "outA", targetNodeId: "B", targetPortId: "inB" }),
      makeConn({ id: "c2", sourceNodeId: "B", sourcePortId: "outB", targetNodeId: "C", targetPortId: "inC" }),
    ];
    const result = validateGraph({ nodes: [nodeA, nodeB, nodeC], connections });
    expect(result.valid).toBe(true);
    expect(result.cycles).toHaveLength(0);
    expect(result.missingRequiredInputs).toHaveLength(0);
  });

  it("detects a cycle B → C → B", () => {
    const connections: Connection[] = [
      makeConn({ id: "c1", sourceNodeId: "A", sourcePortId: "outA", targetNodeId: "B", targetPortId: "inB" }),
      makeConn({ id: "c2", sourceNodeId: "B", sourcePortId: "outB", targetNodeId: "C", targetPortId: "inC" }),
      makeConn({ id: "c3", sourceNodeId: "C", sourcePortId: "outC", targetNodeId: "B", targetPortId: "inB" }),
    ];
    const result = validateGraph({ nodes: [nodeA, nodeB, nodeC], connections });
    expect(result.cycles.length).toBeGreaterThan(0);
    expect(result.valid).toBe(false);
  });

  it("reports missing required inputs", () => {
    const result = validateGraph({ nodes: [nodeA, nodeB], connections: [] });
    expect(result.missingRequiredInputs.some((m) => m.nodeId === "B" && m.portId === "inB")).toBe(true);
    expect(result.valid).toBe(false);
  });

  it("reports disconnected nodes", () => {
    const isolated: NodeDefinition = {
      id: "ISO",
      type: "action",
      ports: [makePort({ id: "out", direction: "output" })],
    };
    const result = validateGraph({ nodes: [nodeA, isolated], connections: [] });
    expect(result.disconnectedNodes).toContain("ISO");
  });

  it("errors on connection referencing unknown node", () => {
    const conn = makeConn({ sourceNodeId: "UNKNOWN", targetNodeId: "B", targetPortId: "inB" });
    const result = validateGraph({ nodes: [nodeA, nodeB], connections: [conn] });
    expect(result.errors.some((e) => e.includes("unknown source node"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// topologicalSort
// ─────────────────────────────────────────────────────────────────────────────

describe("topologicalSort", () => {
  it("returns topological order for A → B → C", () => {
    const connections: Connection[] = [
      makeConn({ id: "c1", sourceNodeId: "A", targetNodeId: "B" }),
      makeConn({ id: "c2", sourceNodeId: "B", targetNodeId: "C" }),
    ];
    const sorted = topologicalSort(["A", "B", "C"], connections);
    expect(sorted).not.toBeNull();
    expect(sorted!.indexOf("A")).toBeLessThan(sorted!.indexOf("B"));
    expect(sorted!.indexOf("B")).toBeLessThan(sorted!.indexOf("C"));
  });

  it("returns null when cycle exists", () => {
    const connections: Connection[] = [
      makeConn({ id: "c1", sourceNodeId: "A", targetNodeId: "B" }),
      makeConn({ id: "c2", sourceNodeId: "B", targetNodeId: "A" }),
    ];
    expect(topologicalSort(["A", "B"], connections)).toBeNull();
  });

  it("handles single node", () => {
    expect(topologicalSort(["A"], [])).toEqual(["A"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getUpstreamNodes / getDownstreamNodes
// ─────────────────────────────────────────────────────────────────────────────

describe("getUpstreamNodes", () => {
  const connections: Connection[] = [
    makeConn({ id: "c1", sourceNodeId: "A", targetNodeId: "B" }),
    makeConn({ id: "c2", sourceNodeId: "B", targetNodeId: "C" }),
    makeConn({ id: "c3", sourceNodeId: "D", targetNodeId: "C" }),
  ];

  it("returns all ancestors of C", () => {
    const upstream = getUpstreamNodes("C", connections);
    expect(upstream).toContain("A");
    expect(upstream).toContain("B");
    expect(upstream).toContain("D");
    expect(upstream).not.toContain("C");
  });

  it("returns empty for root node", () => {
    expect(getUpstreamNodes("A", connections)).toHaveLength(0);
  });
});

describe("getDownstreamNodes", () => {
  const connections: Connection[] = [
    makeConn({ id: "c1", sourceNodeId: "A", targetNodeId: "B" }),
    makeConn({ id: "c2", sourceNodeId: "A", targetNodeId: "C" }),
    makeConn({ id: "c3", sourceNodeId: "B", targetNodeId: "D" }),
  ];

  it("returns all descendants of A", () => {
    const downstream = getDownstreamNodes("A", connections);
    expect(downstream).toContain("B");
    expect(downstream).toContain("C");
    expect(downstream).toContain("D");
    expect(downstream).not.toContain("A");
  });

  it("returns empty for leaf node", () => {
    expect(getDownstreamNodes("D", connections)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// wouldDisconnectGraph
// ─────────────────────────────────────────────────────────────────────────────

describe("wouldDisconnectGraph", () => {
  const nodes = [nodeA, nodeB, nodeC];

  it("returns false when graph stays connected", () => {
    // A → B → C, removing B would disconnect if no direct A→C
    const connections: Connection[] = [
      makeConn({ id: "c1", sourceNodeId: "A", targetNodeId: "B" }),
      makeConn({ id: "c2", sourceNodeId: "A", targetNodeId: "C" }),
      makeConn({ id: "c3", sourceNodeId: "B", targetNodeId: "C" }),
    ];
    // Removing B: A still connects to C directly
    expect(wouldDisconnectGraph("B", nodes, connections)).toBe(false);
  });

  it("returns true when removing the bridge disconnects", () => {
    // A → B → C: B is the only bridge
    const connections: Connection[] = [
      makeConn({ id: "c1", sourceNodeId: "A", targetNodeId: "B" }),
      makeConn({ id: "c2", sourceNodeId: "B", targetNodeId: "C" }),
    ];
    expect(wouldDisconnectGraph("B", nodes, connections)).toBe(true);
  });

  it("returns false for single remaining node", () => {
    const connections: Connection[] = [
      makeConn({ id: "c1", sourceNodeId: "A", targetNodeId: "B" }),
    ];
    expect(wouldDisconnectGraph("A", [nodeA, nodeB], connections)).toBe(false);
  });
});
