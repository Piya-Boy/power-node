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
import { startTransition, useCallback, useMemo, useState } from "react";
import { ErrorView, LoadingView } from "@/components/entity-components";
import {
  useSuspenseWorkflow,
  useUpdateWorkflow,
} from "@/features/workflows/hooks/use-workflows";

import "@xyflow/react/dist/style.css";
import { useSetAtom } from "jotai";
import { RedoIcon, Sparkles, UndoIcon } from "lucide-react";
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
  workflowId,
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  setEditor,
  onNodeClick,
  onPaneClick,
  onApplyWorkflow,
  undo,
  redo,
  canUndo,
  canRedo,
  showAiDialog,
  setShowAiDialog,
  hasManualTrigger,
}: {
  workflowId: string;
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
  onApplyWorkflow: (workflow: { nodes: Node[]; edges: Edge[] }) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  showAiDialog: boolean;
  setShowAiDialog: React.Dispatch<React.SetStateAction<boolean>>;
  hasManualTrigger: boolean;
}) {
  const { onDragOver, onDrop } = useNodeDrop();

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
          nodes={nodes}
          edges={edges}
          onApplyWorkflow={onApplyWorkflow}
        />
        {hasManualTrigger && (
          <Panel position="bottom-center">
            <ExecuteWorkflowButton workflowId={workflowId} />
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

export const Editor = ({ workflowId }: { workflowId: string }) => {
  const { data: workflow } = useSuspenseWorkflow(workflowId);

  const setEditor = useSetAtom(editorAtom);
  const setSelectedNode = useSetAtom(selectedNodeAtom);
  const saveWorkflow = useUpdateWorkflow();

  const [nodes, setNodes] = useState<Node[]>(workflow.nodes);
  const [edges, setEdges] = useState<Edge[]>(workflow.edges);
  const [showAiDialog, setShowAiDialog] = useState(false);

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

  const onApplyWorkflow = useCallback(
    (workflow: { nodes: Node[]; edges: Edge[] }) => {
      takeSnapshot();
      startTransition(() => {
        setNodes(workflow.nodes);
        setEdges(workflow.edges);
      });
      setSelectedNode(null);
    },
    [setSelectedNode, takeSnapshot],
  );

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

  return (
    <div className="size-full flex min-h-0">
      <div className="flex-1 min-h-0 min-w-0 flex flex-col">
        <ReactFlowProvider>
          <EditorCanvas
            workflowId={workflowId}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            setEditor={setEditor}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onApplyWorkflow={onApplyWorkflow}
            undo={undo}
            redo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            showAiDialog={showAiDialog}
            setShowAiDialog={setShowAiDialog}
            hasManualTrigger={hasManualTrigger}
          />
        </ReactFlowProvider>
      </div>
      <NodeConfigPanel />
    </div>
  );
};
