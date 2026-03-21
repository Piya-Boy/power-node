"use client";

import { createId } from "@paralleldrive/cuid2";
import { useReactFlow } from "@xyflow/react";
import { SearchIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  allNodeCatalogOptions,
  filterNodeCatalogOptions,
  NODE_CATEGORY_SECTIONS,
  NodeCatalogIcon,
  type NodeTypeOption,
} from "@/features/editor/lib/node-catalog";
import { NodeType } from "@/generated/prisma";

interface NodeSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function NodeSelector({
  open,
  onOpenChange,
  children,
}: NodeSelectorProps) {
  const { setNodes, getNodes, screenToFlowPosition } = useReactFlow();
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => filterNodeCatalogOptions(search, allNodeCatalogOptions),
    [search],
  );

  const handleNodeSelect = useCallback(
    (selection: NodeTypeOption) => {
      if (selection.type === NodeType.MANUAL_TRIGGER) {
        const nodes = getNodes();
        const hasManualTrigger = nodes.some(
          (node) => node.type === NodeType.MANUAL_TRIGGER,
        );

        if (hasManualTrigger) {
          toast.error("Only one manual trigger is allowed per workflow");
          return;
        }
      }

      setNodes((nodes) => {
        const hasInitialTrigger = nodes.some(
          (node) => node.type === NodeType.INITIAL,
        );

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        const flowPosition = screenToFlowPosition({
          x: centerX + (Math.random() - 0.5) * 200,
          y: centerY + (Math.random() - 0.5) * 200,
        });

        const newNode = {
          id: createId(),
          data: {},
          position: flowPosition,
          type: selection.type,
        };

        if (hasInitialTrigger) {
          return [newNode];
        }

        return [...nodes, newNode];
      });

      onOpenChange(false);
      setSearch("");
    },
    [setNodes, getNodes, onOpenChange, screenToFlowPosition],
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setSearch("");
      }}
    >
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col p-0"
      >
        <div className="p-6 pb-3 shrink-0 border-b">
          <SheetHeader className="space-y-2 text-left">
            <SheetTitle>What triggers this workflow?</SheetTitle>
            <SheetDescription>
              A trigger starts your workflow. Search below to add triggers,
              actions, integrations, logic, and more.
            </SheetDescription>
          </SheetHeader>
          <div className="relative mt-4">
            <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search nodes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <div className="pb-6">
            {NODE_CATEGORY_SECTIONS.map(({ key, label }, index) => {
              const sectionNodes = filtered.filter((n) => n.category === key);
              if (sectionNodes.length === 0) return null;

              const prevHasContent = NODE_CATEGORY_SECTIONS.slice(
                0,
                index,
              ).some(
                (s) => filtered.filter((n) => n.category === s.key).length > 0,
              );

              return (
                <div key={key}>
                  {prevHasContent && <Separator className="my-1" />}
                  <div className="px-3 pb-2 pt-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-3">
                      {label}
                    </p>
                    {sectionNodes.map((nodeType) => (
                      <button
                        key={nodeType.type}
                        type="button"
                        className="w-full text-left justify-start h-auto py-4 px-4 rounded-none cursor-pointer border-l-2 border-transparent hover:border-l-primary hover:bg-accent/50 transition-colors"
                        onClick={() => handleNodeSelect(nodeType)}
                      >
                        <div className="flex items-center gap-4 w-full overflow-hidden">
                          <NodeCatalogIcon
                            icon={nodeType.icon}
                            label={nodeType.label}
                          />
                          <div className="flex flex-col items-start text-left min-w-0">
                            <span className="font-medium text-sm truncate w-full">
                              {nodeType.label}
                            </span>
                            <span className="text-xs text-muted-foreground line-clamp-2">
                              {nodeType.description}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                No nodes found
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
