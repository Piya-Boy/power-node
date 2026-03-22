/**
 * Phase 62 — Workflow Event Sourcing
 * Pure utilities for event-sourced workflow state management:
 * creating events, applying them to state, replaying history,
 * snapshotting, projections, and tombstoning.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type EventType =
  | "workflow.created"
  | "workflow.renamed"
  | "workflow.described"
  | "workflow.activated"
  | "workflow.deactivated"
  | "workflow.deleted"
  | "node.added"
  | "node.removed"
  | "node.configured"
  | "node.moved"
  | "edge.added"
  | "edge.removed"
  | "settings.updated"
  | "tag.added"
  | "tag.removed";

export interface WorkflowEvent {
  id: string;
  aggregateId: string;   // workflowId
  sequence: number;      // monotonically increasing
  type: EventType;
  payload: Record<string, unknown>;
  metadata: EventMetadata;
}

export interface EventMetadata {
  timestamp: Date;
  userId: string;
  correlationId?: string;
  causationId?: string;  // id of event that caused this one
  version: number;       // schema version of the event
}

export interface WorkflowState {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  deleted: boolean;
  nodes: Map<string, NodeState>;
  edges: Map<string, EdgeState>;
  settings: Record<string, unknown>;
  tags: string[];
  version: number;       // sequence number of last applied event
  createdAt?: Date;
  updatedAt?: Date;
}

export interface NodeState {
  id: string;
  type: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

export interface EdgeState {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface EventStream {
  aggregateId: string;
  events: WorkflowEvent[];
  snapshot?: StateSnapshot;
}

export interface StateSnapshot {
  aggregateId: string;
  sequence: number;
  state: Omit<WorkflowState, "nodes" | "edges"> & {
    nodes: Record<string, NodeState>;
    edges: Record<string, EdgeState>;
  };
  createdAt: Date;
}

export interface Projection {
  workflowId: string;
  eventCount: number;
  lastEventType: EventType | null;
  lastUpdatedAt: Date | null;
  isActive: boolean;
  isDeleted: boolean;
  nodeCount: number;
  edgeCount: number;
  tagCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Creation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a workflow event.
 */
export function createEvent(params: {
  id: string;
  aggregateId: string;
  sequence: number;
  type: EventType;
  payload: Record<string, unknown>;
  userId: string;
  correlationId?: string;
  causationId?: string;
  now?: Date;
}): WorkflowEvent {
  return {
    id: params.id,
    aggregateId: params.aggregateId,
    sequence: params.sequence,
    type: params.type,
    payload: params.payload,
    metadata: {
      timestamp: params.now ?? new Date(),
      userId: params.userId,
      correlationId: params.correlationId,
      causationId: params.causationId,
      version: 1,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// State Application
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an empty initial workflow state.
 */
export function createEmptyState(workflowId: string): WorkflowState {
  return {
    id: workflowId,
    name: "",
    active: false,
    deleted: false,
    nodes: new Map(),
    edges: new Map(),
    settings: {},
    tags: [],
    version: 0,
  };
}

/**
 * Apply a single event to a workflow state (immutably).
 */
export function applyEvent(state: WorkflowState, event: WorkflowEvent): WorkflowState {
  if (event.sequence <= state.version) return state; // already applied

  const updatedAt = event.metadata.timestamp;
  const base = { ...state, version: event.sequence, updatedAt };

  switch (event.type) {
    case "workflow.created":
      return {
        ...base,
        name: String(event.payload.name ?? ""),
        description: event.payload.description !== undefined ? String(event.payload.description) : undefined,
        active: false,
        createdAt: updatedAt,
      };

    case "workflow.renamed":
      return { ...base, name: String(event.payload.name ?? state.name) };

    case "workflow.described":
      return { ...base, description: event.payload.description !== undefined ? String(event.payload.description) : undefined };

    case "workflow.activated":
      return { ...base, active: true };

    case "workflow.deactivated":
      return { ...base, active: false };

    case "workflow.deleted":
      return { ...base, deleted: true, active: false };

    case "node.added": {
      const nodes = new Map(state.nodes);
      nodes.set(String(event.payload.id), {
        id: String(event.payload.id),
        type: String(event.payload.type ?? "unknown"),
        position: (event.payload.position as NodeState["position"]) ?? { x: 0, y: 0 },
        config: (event.payload.config as Record<string, unknown>) ?? {},
      });
      return { ...base, nodes };
    }

    case "node.removed": {
      const nodes = new Map(state.nodes);
      nodes.delete(String(event.payload.id));
      // Remove all edges connected to this node
      const edges = new Map(state.edges);
      for (const [edgeId, edge] of edges) {
        if (edge.source === String(event.payload.id) || edge.target === String(event.payload.id)) {
          edges.delete(edgeId);
        }
      }
      return { ...base, nodes, edges };
    }

    case "node.configured": {
      const nodes = new Map(state.nodes);
      const existing = nodes.get(String(event.payload.id));
      if (existing) {
        nodes.set(String(event.payload.id), {
          ...existing,
          config: { ...existing.config, ...(event.payload.config as Record<string, unknown> ?? {}) },
        });
      }
      return { ...base, nodes };
    }

    case "node.moved": {
      const nodes = new Map(state.nodes);
      const existing = nodes.get(String(event.payload.id));
      if (existing) {
        nodes.set(String(event.payload.id), {
          ...existing,
          position: (event.payload.position as NodeState["position"]) ?? existing.position,
        });
      }
      return { ...base, nodes };
    }

    case "edge.added": {
      const edges = new Map(state.edges);
      edges.set(String(event.payload.id), {
        id: String(event.payload.id),
        source: String(event.payload.source),
        target: String(event.payload.target),
        sourceHandle: event.payload.sourceHandle !== undefined ? String(event.payload.sourceHandle) : undefined,
        targetHandle: event.payload.targetHandle !== undefined ? String(event.payload.targetHandle) : undefined,
      });
      return { ...base, edges };
    }

    case "edge.removed": {
      const edges = new Map(state.edges);
      edges.delete(String(event.payload.id));
      return { ...base, edges };
    }

    case "settings.updated":
      return { ...base, settings: { ...state.settings, ...(event.payload as Record<string, unknown>) } };

    case "tag.added": {
      const tag = String(event.payload.tag);
      const tags = state.tags.includes(tag) ? state.tags : [...state.tags, tag];
      return { ...base, tags };
    }

    case "tag.removed": {
      const tag = String(event.payload.tag);
      return { ...base, tags: state.tags.filter((t) => t !== tag) };
    }

    default:
      return base;
  }
}

/**
 * Replay a sequence of events onto an initial state.
 */
export function replayEvents(
  events: WorkflowEvent[],
  initialState?: WorkflowState
): WorkflowState {
  const aggregateId = events[0]?.aggregateId ?? "";
  const state = initialState ?? createEmptyState(aggregateId);
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  return sorted.reduce((s, e) => applyEvent(s, e), state);
}

/**
 * Replay events from a snapshot.
 */
export function replayFromSnapshot(
  snapshot: StateSnapshot,
  events: WorkflowEvent[]
): WorkflowState {
  const state: WorkflowState = {
    ...snapshot.state,
    nodes: new Map(Object.entries(snapshot.state.nodes)),
    edges: new Map(Object.entries(snapshot.state.edges)),
  };
  const newEvents = events.filter((e) => e.sequence > snapshot.sequence);
  return replayEvents(newEvents, state);
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a snapshot from the current state.
 */
export function snapshotState(state: WorkflowState, now?: Date): StateSnapshot {
  return {
    aggregateId: state.id,
    sequence: state.version,
    state: {
      id: state.id,
      name: state.name,
      description: state.description,
      active: state.active,
      deleted: state.deleted,
      settings: state.settings,
      tags: state.tags,
      version: state.version,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      nodes: Object.fromEntries(state.nodes),
      edges: Object.fromEntries(state.edges),
    },
    createdAt: now ?? new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stream Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append an event to a stream (validates sequence order).
 */
export function appendEvent(stream: EventStream, event: WorkflowEvent): { stream: EventStream; error?: string } {
  const expectedSeq = stream.events.length > 0
    ? Math.max(...stream.events.map((e) => e.sequence)) + 1
    : 1;
  if (event.sequence !== expectedSeq) {
    return {
      stream,
      error: `Expected sequence ${expectedSeq}, got ${event.sequence}`,
    };
  }
  return { stream: { ...stream, events: [...stream.events, event] } };
}

/**
 * Get events after a given sequence number.
 */
export function getEventsAfter(stream: EventStream, sequence: number): WorkflowEvent[] {
  return stream.events.filter((e) => e.sequence > sequence);
}

/**
 * Get events between two sequence numbers (inclusive).
 */
export function getEventsBetween(
  stream: EventStream,
  fromSeq: number,
  toSeq: number
): WorkflowEvent[] {
  return stream.events.filter((e) => e.sequence >= fromSeq && e.sequence <= toSeq);
}

// ─────────────────────────────────────────────────────────────────────────────
// Projections
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a lightweight projection (read model) from a list of events.
 */
export function buildProjection(workflowId: string, events: WorkflowEvent[]): Projection {
  const state = replayEvents(events, createEmptyState(workflowId));
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  const last = sorted[sorted.length - 1];

  return {
    workflowId,
    eventCount: events.length,
    lastEventType: last?.type ?? null,
    lastUpdatedAt: last?.metadata.timestamp ?? null,
    isActive: state.active,
    isDeleted: state.deleted,
    nodeCount: state.nodes.size,
    edgeCount: state.edges.size,
    tagCount: state.tags.length,
  };
}

/**
 * Build projections for multiple workflows.
 */
export function buildProjections(
  streams: EventStream[]
): Map<string, Projection> {
  const map = new Map<string, Projection>();
  for (const stream of streams) {
    map.set(stream.aggregateId, buildProjection(stream.aggregateId, stream.events));
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tombstoning
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a workflow is tombstoned (deleted and has a workflow.deleted event).
 */
export function isTombstoned(events: WorkflowEvent[]): boolean {
  return events.some((e) => e.type === "workflow.deleted");
}

/**
 * Get events from a non-deleted stream only (filter tombstoned).
 */
export function filterActiveSteams(streams: EventStream[]): EventStream[] {
  return streams.filter((s) => !isTombstoned(s.events));
}
