"use client";

import { useEffect, useCallback } from "react";

interface KeyboardShortcutHandlers {
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onCut: () => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onSave: () => void;
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const isCtrl = e.ctrlKey || e.metaKey;

      if (isCtrl && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handlers.onUndo();
      } else if (isCtrl && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        handlers.onRedo();
      } else if (isCtrl && e.key === "c") {
        e.preventDefault();
        handlers.onCopy();
      } else if (isCtrl && e.key === "v") {
        e.preventDefault();
        handlers.onPaste();
      } else if (isCtrl && e.key === "x") {
        e.preventDefault();
        handlers.onCut();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handlers.onDelete();
      } else if (isCtrl && e.key === "a") {
        e.preventDefault();
        handlers.onSelectAll();
      } else if (isCtrl && e.key === "s") {
        e.preventDefault();
        handlers.onSave();
      }
    },
    [handlers],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
