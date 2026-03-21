import type { ReactFlowInstance, Node } from "@xyflow/react";
import { atom } from "jotai";

export const editorAtom = atom<ReactFlowInstance | null>(null);
export const selectedNodeAtom = atom<Node | null>(null);

// Data pinning: stores pinned output data per node for testing
export const pinnedDataAtom = atom<Record<string, unknown>>({});

// Execution logs for the log panel
export interface ExecutionLogEntry {
  id: string;
  nodeId: string;
  nodeName: string;
  status: "loading" | "success" | "error";
  message: string;
  timestamp: Date;
  data?: unknown;
}
export const executionLogsAtom = atom<ExecutionLogEntry[]>([]);

// Debug mode: which node to start execution from
export const debugStartNodeAtom = atom<string | null>(null);
