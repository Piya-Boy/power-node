"use client";

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  MiniMap,
  type Node,
  type NodeChange,
  Panel,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorView, LoadingView } from "@/components/entity-components";
import {
  useExecuteWorkflow,
  useSuspenseWorkflow,
  useUpdateWorkflow,
} from "@/features/workflows/hooks/use-workflows";

import "@xyflow/react/dist/style.css";
import { useAtom, useSetAtom } from "jotai";
import { RedoIcon, Sparkles, UndoIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { nodeComponents } from "@/config/node-components";
import { AiWorkflowDialog } from "@/features/ai-workflow/ai-workflow-dialog";
import { NodeType } from "@/generated/prisma";
import { useKeyboardShortcuts } from "../hooks/use-keyboard-shortcuts";
import { useUndoRedo } from "../hooks/use-undo-redo";
import { editorAtom, selectedNodeAtom } from "../store/atoms";
import { AddNodeButton } from "./add-node-button";
import { ExecuteWorkflowButton } from "./execute-workflow-button";
import { NodeConfigPanel } from "./node-config-panel";
import { useNodeDrop } from "./node-library";

export const EditorLoading = () => {
  return <LoadingView message="Loading editor..." />;
};

export const EditorError = () => {
  return <ErrorView message="Error loading editor" />;
};

function EditorCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  setEditor,
  onNodeClick,
  onPaneClick,
  undo,
  redo,
  canUndo,
  canRedo,
  showAiDialog,
  setShowAiDialog,
  debugStartNodeId,
  debugStartNodeLabel,
  hasManualTrigger,
  isExecuting,
  onClearDebugStart,
  onExecuteWorkflow,
}: {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (params: Connection) => void;
  setEditor: (
    instance: Parameters<
      NonNullable<React.ComponentProps<typeof ReactFlow>["onInit"]>
    >[0],
  ) => void;
  onNodeClick: (_: React.MouseEvent, node: Node) => void;
  onPaneClick: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  showAiDialog: boolean;
  setShowAiDialog: React.Dispatch<React.SetStateAction<boolean>>;
  debugStartNodeId: string | null;
  debugStartNodeLabel: string | null;
  hasManualTrigger: boolean;
  isExecuting: boolean;
  onClearDebugStart: () => void;
  onExecuteWorkflow: () => void;
}) {
  const { onDragOver, onDrop } = useNodeDrop();
  const canExecuteWorkflow = hasManualTrigger || Boolean(debugStartNodeId);

  return (
    <div className="flex-1 min-h-0 min-w-0 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeComponents}
        onInit={setEditor}
        fitView
        snapGrid={[10, 10]}
        snapToGrid
        panOnScroll
        panOnDrag={false}
        selectionOnDrag
        multiSelectionKeyCode="Shift"
        deleteKeyCode="Delete"
      >
        <Background />
        <Controls />
        <MiniMap />
        <Panel position="top-right" className="flex gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  className="bg-background"
                  onClick={undo}
                  disabled={!canUndo}
                >
                  <UndoIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  className="bg-background"
                  onClick={redo}
                  disabled={!canRedo}
                >
                  <RedoIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                className="bg-background"
                onClick={() => setShowAiDialog(true)}
              >
                <Sparkles className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Generate with AI</TooltipContent>
          </Tooltip>
          <AddNodeButton />
        </Panel>
        <AiWorkflowDialog
          open={showAiDialog}
          onOpenChange={setShowAiDialog}
          apiKey=""
        />
        {canExecuteWorkflow && (
          <Panel position="bottom-center">
            <div className="flex items-center gap-2 rounded-full border bg-background/95 px-2 py-2 shadow-sm backdrop-blur">
              <ExecuteWorkflowButton
                debugStartNodeLabel={debugStartNodeLabel}
                isPending={isExecuting}
                onExecute={onExecuteWorkflow}
              />
              {debugStartNodeId && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-10 rounded-full"
                  onClick={onClearDebugStart}
                >
                  <XIcon className="size-4" />
                </Button>
              )}
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

export const Editor = ({ workflowId }: { workflowId: string }) => {
  const { data: workflow } = useSuspenseWorkflow(workflowId);

  const setEditor = useSetAtom(editorAtom);
  const [selectedNode, setSelectedNode] = useAtom(selectedNodeAtom);
  const saveWorkflow = useUpdateWorkflow();
  const executeWorkflow = useExecuteWorkflow();

  const [nodes, setNodes] = useState<Node[]>(workflow.nodes);
  const [edges, setEdges] = useState<Edge[]>(workflow.edges);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [debugStartNodeId, setDebugStartNodeId] = useState<string | null>(null);

  const { undo, redo, canUndo, canRedo, takeSnapshot } = useUndoRedo(
    nodes,
    edges,
    setNodes,
    setEdges,
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const hasSignificantChange = changes.some(
        (c) => c.type === "remove" || c.type === "add",
      );
      if (hasSignificantChange) takeSnapshot();
      setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot));
    },
    [takeSnapshot],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const hasSignificantChange = changes.some(
        (c) => c.type === "remove" || c.type === "add",
      );
      if (hasSignificantChange) takeSnapshot();
      setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot));
    },
    [takeSnapshot],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      takeSnapshot();
      setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot));
    },
    [takeSnapshot],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type !== NodeType.INITIAL) {
        setSelectedNode(node);
      }
    },
    [setSelectedNode],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  useEffect(() => {
    if (!selectedNode) {
      return;
    }

    const liveSelectedNode =
      nodes.find((node) => node.id === selectedNode.id) ?? null;
    if (!liveSelectedNode) {
      setSelectedNode(null);
      return;
    }

    if (liveSelectedNode !== selectedNode) {
      setSelectedNode(liveSelectedNode);
    }
  }, [nodes, selectedNode, setSelectedNode]);

  useEffect(() => {
    if (
      debugStartNodeId &&
      !nodes.some((node) => node.id === debugStartNodeId)
    ) {
      setDebugStartNodeId(null);
    }
  }, [debugStartNodeId, nodes]);

  const handleSave = useCallback(() => {
    saveWorkflow.mutate({ id: workflowId, nodes, edges });
  }, [saveWorkflow, workflowId, nodes, edges]);

  const handleDelete = useCallback(() => {
    takeSnapshot();
    const selectedNodeIds = new Set(
      nodes.filter((n) => n.selected).map((n) => n.id),
    );
    setNodes((ns) => ns.filter((n) => !n.selected));
    setEdges((es) =>
      es.filter(
        (e) => !selectedNodeIds.has(e.source) && !selectedNodeIds.has(e.target),
      ),
    );
  }, [nodes, takeSnapshot]);

  const handleSelectAll = useCallback(() => {
    setNodes((ns) => ns.map((n) => ({ ...n, selected: true })));
  }, []);

  useKeyboardShortcuts({
    onUndo: undo,
    onRedo: redo,
    onCopy: () => {},
    onPaste: () => {},
    onCut: () => {},
    onDelete: handleDelete,
    onSelectAll: handleSelectAll,
    onSave: handleSave,
  });

  const hasManualTrigger = useMemo(() => {
    return nodes.some((node) => node.type === NodeType.MANUAL_TRIGGER);
  }, [nodes]);

  const debugStartNodeLabel = useMemo(() => {
    if (!debugStartNodeId) {
      return null;
    }

    const debugStartNode = nodes.find((node) => node.id === debugStartNodeId);
    if (!debugStartNode) {
      return null;
    }

    return (
      nodeTypeLabelsForExecutionButton[debugStartNode.type as string] ??
      debugStartNode.type ??
      "selected node"
    );
  }, [debugStartNodeId, nodes]);

  const workflowSnapshot = useMemo(() => {
    return {
      nodes: nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: (node.data as Record<string, unknown>) || {},
      })),
      edges: edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
    };
  }, [edges, nodes]);

  const handleExecuteWorkflow = useCallback(
    (overrideDebugStartNodeId?: string | null) => {
      executeWorkflow.mutate({
        id: workflowId,
        debugStartNodeId:
          overrideDebugStartNodeId ?? debugStartNodeId ?? undefined,
        ...workflowSnapshot,
      });
    },
    [debugStartNodeId, executeWorkflow, workflowId, workflowSnapshot],
  );

  const handleUpdateNodeData = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data,
              }
            : node,
        ),
      );
      setSelectedNode((currentNode) =>
        currentNode?.id === nodeId
          ? {
              ...currentNode,
              data,
            }
          : currentNode,
      );
    },
    [setSelectedNode],
  );

  return (
    <div className="size-full flex min-h-0">
      <div className="flex-1 min-h-0 min-w-0 flex flex-col">
        <ReactFlowProvider>
          <EditorCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            setEditor={setEditor}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            undo={undo}
            redo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            showAiDialog={showAiDialog}
            setShowAiDialog={setShowAiDialog}
            debugStartNodeId={debugStartNodeId}
            debugStartNodeLabel={debugStartNodeLabel}
            hasManualTrigger={hasManualTrigger}
            isExecuting={executeWorkflow.isPending}
            onClearDebugStart={() => setDebugStartNodeId(null)}
            onExecuteWorkflow={() => handleExecuteWorkflow()}
          />
        </ReactFlowProvider>
      </div>
      <NodeConfigPanel
        debugStartNodeId={debugStartNodeId}
        isExecuting={executeWorkflow.isPending}
        onExecuteFromNode={(nodeId) => handleExecuteWorkflow(nodeId)}
        onSetDebugStartNode={setDebugStartNodeId}
        onUpdateNodeData={handleUpdateNodeData}
      />
    </div>
  );
};

const nodeTypeLabelsForExecutionButton: Record<string, string> = {
  [NodeType.MANUAL_TRIGGER]: "Manual Trigger",
  [NodeType.GOOGLE_FORM_TRIGGER]: "Google Form Trigger",
  [NodeType.STRIPE_TRIGGER]: "Stripe Trigger",
  [NodeType.HTTP_REQUEST]: "HTTP Request",
  [NodeType.OPENAI]: "OpenAI",
  [NodeType.ANTHROPIC]: "Anthropic",
  [NodeType.GEMINI]: "Gemini",
  [NodeType.DISCORD]: "Discord",
  [NodeType.SLACK]: "Slack",
};
