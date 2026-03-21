"use client";

import { useState } from "react";
import { ChevronUpIcon, ChevronDownIcon, TerminalIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export interface LogEntry {
  id: string;
  nodeId: string;
  nodeName: string;
  status: "loading" | "success" | "error";
  message: string;
  timestamp: Date;
  data?: unknown;
}

interface ExecutionLogPanelProps {
  logs: LogEntry[];
  onClear: () => void;
}

export function ExecutionLogPanel({ logs, onClear }: ExecutionLogPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  if (logs.length === 0) return null;

  const statusColors = {
    loading: "bg-yellow-500/10 text-yellow-500",
    success: "bg-green-500/10 text-green-500",
    error: "bg-red-500/10 text-red-500",
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-background border-t z-10">
      <div
        className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-accent/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <TerminalIcon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Execution Log</span>
          <Badge variant="secondary" className="text-xs">
            {logs.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-6"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
          >
            <XIcon className="size-3.5" />
          </Button>
          {isExpanded ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronUpIcon className="size-4" />
          )}
        </div>
      </div>
      {isExpanded && (
        <ScrollArea className="h-64">
          <div className="px-4 pb-4 space-y-1">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex flex-col gap-1 py-1.5 border-b border-border/50 last:border-0"
              >
                <div
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={() =>
                    setExpandedLogId(expandedLogId === log.id ? null : log.id)
                  }
                >
                  <span className="text-xs text-muted-foreground font-mono w-20 shrink-0">
                    {log.timestamp.toLocaleTimeString()}
                  </span>
                  <Badge
                    variant="secondary"
                    className={`text-xs ${statusColors[log.status]}`}
                  >
                    {log.status}
                  </Badge>
                  <span className="text-xs font-medium">{log.nodeName}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {log.message}
                  </span>
                </div>
                {expandedLogId === log.id && log.data != null && (
                  <pre className="text-xs font-mono bg-muted/50 rounded p-2 overflow-x-auto ml-20">
                    {typeof log.data === "string"
                      ? log.data
                      : JSON.stringify(log.data, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
