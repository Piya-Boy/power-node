"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useReactFlow } from "@xyflow/react";
import { NodeType } from "@/generated/prisma";

interface ExpressionSuggestion {
  label: string;
  value: string;
  description: string;
}

interface ExpressionEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function ExpressionEditor({
  value,
  onChange,
  placeholder,
  className,
}: ExpressionEditorProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<ExpressionSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const { getNodes } = useReactFlow();

  const getAvailableVariables = useCallback((): ExpressionSuggestion[] => {
    const nodes = getNodes();
    const variables: ExpressionSuggestion[] = [];

    for (const node of nodes) {
      if (node.type === NodeType.INITIAL) continue;

      const varName = (node.data as Record<string, unknown>)?.variableName as string | undefined;
      if (!varName) continue;

      const nodeType = node.type as string;

      if (([NodeType.OPENAI, NodeType.ANTHROPIC, NodeType.GEMINI] as string[]).includes(nodeType)) {
        variables.push({
          label: `${varName}.text`,
          value: `{{${varName}.text}}`,
          description: `AI response text from ${nodeType}`,
        });
      } else if (nodeType === NodeType.HTTP_REQUEST) {
        variables.push(
          {
            label: `${varName}.data`,
            value: `{{${varName}.data}}`,
            description: "HTTP response data",
          },
          {
            label: `${varName}.status`,
            value: `{{${varName}.status}}`,
            description: "HTTP status code",
          },
        );
      } else if (nodeType === NodeType.GOOGLE_FORM_TRIGGER) {
        variables.push({
          label: `${varName}`,
          value: `{{${varName}}}`,
          description: "Google Form submission data",
        });
      } else {
        variables.push({
          label: varName,
          value: `{{${varName}}}`,
          description: `Output from ${nodeType}`,
        });
      }
    }

    // Add json helper
    variables.push({
      label: "json <variable>",
      value: "{{json }}",
      description: "Stringify an object to JSON",
    });

    return variables;
  }, [getNodes]);

  const checkForExpressionTrigger = useCallback(
    (text: string, cursor: number) => {
      // Look backwards from cursor for {{ that hasn't been closed
      const beforeCursor = text.slice(0, cursor);
      const lastOpen = beforeCursor.lastIndexOf("{{");
      const lastClose = beforeCursor.lastIndexOf("}}");

      if (lastOpen > lastClose) {
        const partial = beforeCursor.slice(lastOpen + 2).toLowerCase();
        const allVars = getAvailableVariables();
        const filtered = partial
          ? allVars.filter(
              (v) =>
                v.label.toLowerCase().includes(partial) ||
                v.description.toLowerCase().includes(partial),
            )
          : allVars;

        if (filtered.length > 0) {
          setSuggestions(filtered);
          setShowSuggestions(true);
          setSelectedIndex(0);
          return;
        }
      }

      setShowSuggestions(false);
    },
    [getAvailableVariables],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursor = e.target.selectionStart ?? 0;
      onChange(newValue);
      setCursorPosition(cursor);
      checkForExpressionTrigger(newValue, cursor);
    },
    [onChange, checkForExpressionTrigger],
  );

  const insertSuggestion = useCallback(
    (suggestion: ExpressionSuggestion) => {
      const beforeCursor = value.slice(0, cursorPosition);
      const afterCursor = value.slice(cursorPosition);
      const lastOpen = beforeCursor.lastIndexOf("{{");

      if (lastOpen !== -1) {
        const newValue =
          beforeCursor.slice(0, lastOpen) + suggestion.value + afterCursor;
        onChange(newValue);

        // Set cursor after inserted value
        const newCursorPos = lastOpen + suggestion.value.length;
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = newCursorPos;
            textareaRef.current.selectionEnd = newCursorPos;
            textareaRef.current.focus();
          }
        });
      }

      setShowSuggestions(false);
    },
    [value, cursorPosition, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showSuggestions) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertSuggestion(suggestions[selectedIndex]);
      } else if (e.key === "Escape") {
        setShowSuggestions(false);
      }
    },
    [showSuggestions, suggestions, selectedIndex, insertSuggestion],
  );

  // Close suggestions on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as globalThis.Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`font-mono text-sm ${className ?? ""}`}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto"
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion.label}
              className={`px-3 py-2 cursor-pointer text-sm ${
                index === selectedIndex ? "bg-accent" : "hover:bg-accent/50"
              }`}
              onClick={() => insertSuggestion(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="font-mono font-medium">{suggestion.label}</div>
              <div className="text-xs text-muted-foreground">
                {suggestion.description}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
