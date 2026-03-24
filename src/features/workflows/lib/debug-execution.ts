export const POWERNODE_DEBUG_METADATA_KEY = "__powernode";

type JsonObject = Record<string, unknown>;

export interface PinnedDataState {
  enabled: boolean;
  value: JsonObject | null;
}

export interface ExecutableNodeLike {
  id: string;
  data: unknown;
}

const PINNED_DATA_KEY = "pinnedData";

const isJsonObject = (value: unknown): value is JsonObject => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const getPinnedDataState = (data: unknown): PinnedDataState => {
  if (!isJsonObject(data)) {
    return { enabled: false, value: null };
  }

  const metadata = data[POWERNODE_DEBUG_METADATA_KEY];
  if (!isJsonObject(metadata)) {
    return { enabled: false, value: null };
  }

  const pinnedData = metadata[PINNED_DATA_KEY];
  if (!isJsonObject(pinnedData)) {
    return { enabled: false, value: null };
  }

  const value = isJsonObject(pinnedData.value) ? pinnedData.value : null;

  return {
    enabled: pinnedData.enabled === true,
    value,
  };
};

export const getPinnedDataPatch = (data: unknown): JsonObject | null => {
  const pinnedData = getPinnedDataState(data);
  if (!pinnedData.enabled || !pinnedData.value) {
    return null;
  }

  return pinnedData.value;
};

export const setPinnedDataState = (
  data: unknown,
  pinnedData: PinnedDataState | null,
): JsonObject => {
  const nextData = isJsonObject(data) ? { ...data } : {};
  const nextMetadata = isJsonObject(nextData[POWERNODE_DEBUG_METADATA_KEY])
    ? { ...(nextData[POWERNODE_DEBUG_METADATA_KEY] as JsonObject) }
    : {};

  if (!pinnedData || !pinnedData.value) {
    delete nextMetadata[PINNED_DATA_KEY];

    if (Object.keys(nextMetadata).length === 0) {
      delete nextData[POWERNODE_DEBUG_METADATA_KEY];
    } else {
      nextData[POWERNODE_DEBUG_METADATA_KEY] = nextMetadata;
    }

    return nextData;
  }

  nextMetadata[PINNED_DATA_KEY] = {
    enabled: pinnedData.enabled,
    value: pinnedData.value,
  };
  nextData[POWERNODE_DEBUG_METADATA_KEY] = nextMetadata;

  return nextData;
};

export const applyPinnedDataPatch = (
  context: JsonObject,
  pinnedData: JsonObject | null | undefined,
): JsonObject => {
  if (!pinnedData) {
    return context;
  }

  return {
    ...context,
    ...pinnedData,
  };
};

export const stringifyPinnedData = (value: JsonObject | null): string => {
  return JSON.stringify(value ?? {}, null, 2);
};

export const buildDebugExecutionPlan = <TNode extends ExecutableNodeLike>(
  sortedNodes: TNode[],
  options?: {
    debugStartNodeId?: string | null;
    initialContext?: JsonObject;
  },
): {
  nodesToExecute: TNode[];
  initialContext: JsonObject;
  resolvedDebugStartNodeId: string | null;
} => {
  const initialContext = { ...(options?.initialContext ?? {}) };
  const debugStartNodeId = options?.debugStartNodeId ?? null;

  if (!debugStartNodeId) {
    return {
      nodesToExecute: sortedNodes,
      initialContext,
      resolvedDebugStartNodeId: null,
    };
  }

  const startIndex = sortedNodes.findIndex(
    (node) => node.id === debugStartNodeId,
  );

  if (startIndex < 0) {
    return {
      nodesToExecute: sortedNodes,
      initialContext,
      resolvedDebugStartNodeId: null,
    };
  }

  let seededContext = initialContext;
  for (const node of sortedNodes.slice(0, startIndex)) {
    seededContext = applyPinnedDataPatch(
      seededContext,
      getPinnedDataPatch(node.data),
    );
  }

  return {
    nodesToExecute: sortedNodes.slice(startIndex),
    initialContext: seededContext,
    resolvedDebugStartNodeId: debugStartNodeId,
  };
};
