"use client";

import { memo, useState, useRef, useEffect } from "react";
import { type NodeProps, type Node, useReactFlow, NodeResizer } from "@xyflow/react";
import { TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NodeToolbar, Position } from "@xyflow/react";

type StickyNoteData = {
  content?: string;
  color?: string;
};

type StickyNoteType = Node<StickyNoteData>;

const COLORS = [
  { name: "yellow", bg: "bg-yellow-100 dark:bg-yellow-900/30", border: "border-yellow-300" },
  { name: "blue", bg: "bg-blue-100 dark:bg-blue-900/30", border: "border-blue-300" },
  { name: "green", bg: "bg-green-100 dark:bg-green-900/30", border: "border-green-300" },
  { name: "pink", bg: "bg-pink-100 dark:bg-pink-900/30", border: "border-pink-300" },
  { name: "purple", bg: "bg-purple-100 dark:bg-purple-900/30", border: "border-purple-300" },
];

export const StickyNoteNode = memo((props: NodeProps<StickyNoteType>) => {
  const { setNodes } = useReactFlow();
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const content = props.data?.content || "";
  const colorName = props.data?.color || "yellow";
  const colorConfig = COLORS.find((c) => c.name === colorName) || COLORS[0];

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  const handleContentChange = (newContent: string) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === props.id
          ? { ...node, data: { ...node.data, content: newContent } }
          : node,
      ),
    );
  };

  const handleColorChange = (color: string) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === props.id
          ? { ...node, data: { ...node.data, color } }
          : node,
      ),
    );
  };

  const handleDelete = () => {
    setNodes((nodes) => nodes.filter((node) => node.id !== props.id));
  };

  return (
    <>
      <NodeToolbar position={Position.Top}>
        <div className="flex items-center gap-1">
          {COLORS.map((color) => (
            <button
              key={color.name}
              className={`size-5 rounded-full ${color.bg} ${color.border} border ${
                colorName === color.name ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => handleColorChange(color.name)}
            />
          ))}
          <Button size="icon" variant="ghost" className="size-7 ml-1" onClick={handleDelete}>
            <TrashIcon className="size-3.5" />
          </Button>
        </div>
      </NodeToolbar>
      <NodeResizer minWidth={150} minHeight={100} />
      <div
        className={`${colorConfig.bg} ${colorConfig.border} border rounded-md p-3 min-w-[150px] min-h-[100px] shadow-sm`}
        style={{ width: props.width ?? 200, height: props.height ?? 150 }}
        onDoubleClick={() => setIsEditing(true)}
      >
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            onBlur={() => setIsEditing(false)}
            className="w-full h-full bg-transparent resize-none border-none outline-none text-sm"
            placeholder="Write a note..."
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words">
            {content || (
              <span className="text-muted-foreground">Double-click to edit...</span>
            )}
          </p>
        )}
      </div>
    </>
  );
});

StickyNoteNode.displayName = "StickyNoteNode";
