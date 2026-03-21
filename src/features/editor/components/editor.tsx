"use client";

import { useState, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  Background,
  Controls,
  MiniMap,
  Panel,
} from '@xyflow/react';
import { ErrorView, LoadingView } from "@/components/entity-components";
import { useSuspenseWorkflow, useUpdateWorkflow } from "@/features/workflows/hooks/use-workflows";

import '@xyflow/react/dist/style.css';
import { nodeComponents } from '@/config/node-components';
import { AddNodeButton } from './add-node-button';
import { useSetAtom } from 'jotai';
import { editorAtom, selectedNodeAtom } from '../store/atoms';
import { NodeType } from '@/generated/prisma';
import { ExecuteWorkflowButton } from './execute-workflow-button';
import { NodeLibrary, useNodeDrop } from './node-library';
import { NodeConfigPanel } from './node-config-panel';
import { useUndoRedo } from '../hooks/use-undo-redo';
import { useKeyboardShortcuts } from '../hooks/use-keyboard-shortcuts';
import { PanelLeftIcon, PanelLeftCloseIcon, UndoIcon, RedoIcon, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AiWorkflowDialog } from '@/features/ai-workflow/ai-workflow-dialog';

export const EditorLoading = () => {
  return <LoadingView message="Loading editor..." />;
};

export const EditorError = () => {
  return <ErrorView message="Error loading editor" />;
};

export const Editor = ({ workflowId }: { workflowId: string }) => {
  const {
    data: workflow
  } = useSuspenseWorkflow(workflowId);

  const setEditor = useSetAtom(editorAtom);
  const setSelectedNode = useSetAtom(selectedNodeAtom);
  const saveWorkflow = useUpdateWorkflow();

  const [nodes, setNodes] = useState<Node[]>(workflow.nodes);
  const [edges, setEdges] = useState<Edge[]>(workflow.edges);
  const [showLibrary, setShowLibrary] = useState(true);
  const [showAiDialog, setShowAiDialog] = useState(false);

  const { undo, redo, canUndo, canRedo, takeSnapshot } = useUndoRedo(
    nodes, edges, setNodes, setEdges,
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

  const { onDragOver, onDrop } = useNodeDrop();

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
  }, [nodes, takeSnapshot, setNodes, setEdges]);

  const handleSelectAll = useCallback(() => {
    setNodes((ns) => ns.map((n) => ({ ...n, selected: true })));
  }, [setNodes]);

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
    <div className='size-full flex'>
      {showLibrary && (
        <div className="w-64 border-r bg-background flex flex-col shrink-0">
          <div className="flex items-center justify-between px-3 pt-3 pb-1">
            <h3 className="text-sm font-semibold">Nodes</h3>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => setShowLibrary(false)}
            >
              <PanelLeftCloseIcon className="size-4" />
            </Button>
          </div>
          <NodeLibrary className="flex-1 flex flex-col overflow-hidden" />
        </div>
      )}
      <div className="flex-1 relative">
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
            {!showLibrary && (
              <Button
                size="icon"
                variant="outline"
                className="bg-background"
                onClick={() => setShowLibrary(true)}
              >
                <PanelLeftIcon className="size-4" />
              </Button>
            )}
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
          {hasManualTrigger && (
            <Panel position="bottom-center">
              <ExecuteWorkflowButton workflowId={workflowId} />
            </Panel>
          )}
        </ReactFlow>
      </div>
      <NodeConfigPanel />
    </div>
  );
};
