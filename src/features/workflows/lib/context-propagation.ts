export type ContextScope = "global" | "workflow" | "node" | "execution";
export type ContextValueType = "string" | "number" | "boolean" | "json";

export interface ContextEntry {
  key: string;
  value: unknown;
  type: ContextValueType;
  scope: ContextScope;
  workflowId?: string;
  nodeId?: string;
  executionId?: string;
  propagate: boolean;
  ttl?: number;
  createdAt: number;
  expiresAt?: number;
}

export interface WorkflowContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  workflowId: string;
  executionId: string;
  nodeId?: string;
  userId?: string;
  tenantId?: string;
  entries: Map<string, ContextEntry>;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export interface ContextPropagation {
  headers: Record<string, string>;
  baggage: Record<string, string>;
}

let _spanSeq = 0;
export function resetSpanSeq(): void { _spanSeq = 0; }

export function generateSpanId(): string { return "span_" + (++_spanSeq); }

export function createContext(
  workflowId: string,
  executionId: string,
  options: Partial<Omit<WorkflowContext, "entries" | "workflowId" | "executionId" | "traceId" | "spanId" | "createdAt">> & { traceId?: string } = {},
  now = Date.now()
): WorkflowContext {
  return {
    traceId: options.traceId ?? generateSpanId(),
    spanId: generateSpanId(),
    workflowId,
    executionId,
    entries: new Map(),
    metadata: {},
    createdAt: now,
    ...options,
  };
}

export function childContext(parent: WorkflowContext, nodeId: string, now = Date.now()): WorkflowContext {
  const child: WorkflowContext = {
    ...parent,
    spanId: generateSpanId(),
    parentSpanId: parent.spanId,
    nodeId,
    entries: new Map(parent.entries),
    metadata: { ...parent.metadata },
    createdAt: now,
  };
  // Only carry propagate=true entries
  for (const [key, entry] of parent.entries) {
    if (!entry.propagate) child.entries.delete(key);
  }
  return child;
}

export function setEntry(
  ctx: WorkflowContext,
  key: string,
  value: unknown,
  options: Partial<Pick<ContextEntry, "type" | "scope" | "propagate" | "ttl" | "workflowId" | "nodeId" | "executionId">> = {},
  now = Date.now()
): WorkflowContext {
  const type = options.type ?? inferType(value);
  const entry: ContextEntry = {
    key,
    value,
    type,
    scope: options.scope ?? "workflow",
    workflowId: options.workflowId ?? ctx.workflowId,
    nodeId: options.nodeId ?? ctx.nodeId,
    executionId: options.executionId ?? ctx.executionId,
    propagate: options.propagate ?? true,
    ttl: options.ttl,
    createdAt: now,
    expiresAt: options.ttl ? now + options.ttl : undefined,
  };
  const newEntries = new Map(ctx.entries);
  newEntries.set(key, entry);
  return { ...ctx, entries: newEntries };
}

export function getEntry(ctx: WorkflowContext, key: string, now = Date.now()): ContextEntry | undefined {
  const entry = ctx.entries.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt && now > entry.expiresAt) return undefined;
  return entry;
}

export function getValue(ctx: WorkflowContext, key: string, now = Date.now()): unknown {
  return getEntry(ctx, key, now)?.value;
}

export function deleteEntry(ctx: WorkflowContext, key: string): WorkflowContext {
  const newEntries = new Map(ctx.entries);
  newEntries.delete(key);
  return { ...ctx, entries: newEntries };
}

export function hasEntry(ctx: WorkflowContext, key: string, now = Date.now()): boolean {
  return getEntry(ctx, key, now) !== undefined;
}

export function mergeContexts(base: WorkflowContext, overlay: WorkflowContext): WorkflowContext {
  const merged = new Map(base.entries);
  for (const [key, entry] of overlay.entries) {
    merged.set(key, entry);
  }
  return { ...base, entries: merged, metadata: { ...base.metadata, ...overlay.metadata } };
}

export function filterByScope(ctx: WorkflowContext, scope: ContextScope): ContextEntry[] {
  return Array.from(ctx.entries.values()).filter((e) => e.scope === scope);
}

export function filterByNode(ctx: WorkflowContext, nodeId: string): ContextEntry[] {
  return Array.from(ctx.entries.values()).filter((e) => e.nodeId === nodeId);
}

export function getPropagatedEntries(ctx: WorkflowContext): ContextEntry[] {
  return Array.from(ctx.entries.values()).filter((e) => e.propagate);
}

export function expireEntries(ctx: WorkflowContext, now = Date.now()): WorkflowContext {
  const newEntries = new Map<string, ContextEntry>();
  for (const [key, entry] of ctx.entries) {
    if (!entry.expiresAt || now <= entry.expiresAt) {
      newEntries.set(key, entry);
    }
  }
  return { ...ctx, entries: newEntries };
}

export function inferType(value: unknown): ContextValueType {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "json";
}

export function serializeEntry(entry: ContextEntry): string {
  if (entry.type === "json") return JSON.stringify(entry.value);
  return String(entry.value);
}

export function deserializeEntry(raw: string, type: ContextValueType): unknown {
  switch (type) {
    case "number": return Number(raw);
    case "boolean": return raw === "true";
    case "json": return JSON.parse(raw);
    default: return raw;
  }
}

export function toHeaders(ctx: WorkflowContext): Record<string, string> {
  return {
    "x-trace-id": ctx.traceId,
    "x-span-id": ctx.spanId,
    "x-workflow-id": ctx.workflowId,
    "x-execution-id": ctx.executionId,
    ...(ctx.parentSpanId ? { "x-parent-span-id": ctx.parentSpanId } : {}),
    ...(ctx.userId ? { "x-user-id": ctx.userId } : {}),
    ...(ctx.tenantId ? { "x-tenant-id": ctx.tenantId } : {}),
  };
}

export function fromHeaders(headers: Record<string, string>, now = Date.now()): WorkflowContext {
  return {
    traceId: headers["x-trace-id"] ?? generateSpanId(),
    spanId: headers["x-span-id"] ?? generateSpanId(),
    parentSpanId: headers["x-parent-span-id"],
    workflowId: headers["x-workflow-id"] ?? "",
    executionId: headers["x-execution-id"] ?? "",
    userId: headers["x-user-id"],
    tenantId: headers["x-tenant-id"],
    entries: new Map(),
    metadata: {},
    createdAt: now,
  };
}

export function toBaggage(ctx: WorkflowContext, now = Date.now()): Record<string, string> {
  const bag: Record<string, string> = {};
  for (const [key, entry] of ctx.entries) {
    if (entry.propagate && (!entry.expiresAt || now <= entry.expiresAt)) {
      bag[key] = serializeEntry(entry);
    }
  }
  return bag;
}

export interface ContextStats {
  totalEntries: number;
  byScope: Record<ContextScope, number>;
  propagatedCount: number;
  expiredCount: number;
  entryKeys: string[];
}

export function getContextStats(ctx: WorkflowContext, now = Date.now()): ContextStats {
  const byScope: Record<ContextScope, number> = { global: 0, workflow: 0, node: 0, execution: 0 };
  let propagatedCount = 0;
  let expiredCount = 0;
  for (const entry of ctx.entries.values()) {
    byScope[entry.scope]++;
    if (entry.propagate) propagatedCount++;
    if (entry.expiresAt && now > entry.expiresAt) expiredCount++;
  }
  return {
    totalEntries: ctx.entries.size,
    byScope,
    propagatedCount,
    expiredCount,
    entryKeys: Array.from(ctx.entries.keys()),
  };
}
