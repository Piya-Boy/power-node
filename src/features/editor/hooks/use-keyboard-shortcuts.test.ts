import { describe, it, expect, vi } from "vitest";

// Test keyboard shortcut detection logic without React hooks
function detectShortcut(
  e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  target: { tagName: string; isContentEditable: boolean } = { tagName: "DIV", isContentEditable: false },
): string | null {
  // Don't trigger in inputs
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
    return null;
  }

  const isCtrl = e.ctrlKey || e.metaKey;

  if (isCtrl && e.key === "z" && !e.shiftKey) return "undo";
  if (isCtrl && (e.key === "y" || (e.key === "z" && e.shiftKey))) return "redo";
  if (isCtrl && e.key === "c") return "copy";
  if (isCtrl && e.key === "v") return "paste";
  if (isCtrl && e.key === "x") return "cut";
  if (e.key === "Delete" || e.key === "Backspace") return "delete";
  if (isCtrl && e.key === "a") return "selectAll";
  if (isCtrl && e.key === "s") return "save";

  return null;
}

describe("Keyboard Shortcuts Detection", () => {
  it("should detect Ctrl+Z as undo", () => {
    expect(detectShortcut({ key: "z", ctrlKey: true, metaKey: false, shiftKey: false })).toBe("undo");
  });

  it("should detect Ctrl+Y as redo", () => {
    expect(detectShortcut({ key: "y", ctrlKey: true, metaKey: false, shiftKey: false })).toBe("redo");
  });

  it("should detect Ctrl+Shift+Z as redo", () => {
    expect(detectShortcut({ key: "z", ctrlKey: true, metaKey: false, shiftKey: true })).toBe("redo");
  });

  it("should detect Ctrl+C as copy", () => {
    expect(detectShortcut({ key: "c", ctrlKey: true, metaKey: false, shiftKey: false })).toBe("copy");
  });

  it("should detect Ctrl+V as paste", () => {
    expect(detectShortcut({ key: "v", ctrlKey: true, metaKey: false, shiftKey: false })).toBe("paste");
  });

  it("should detect Ctrl+X as cut", () => {
    expect(detectShortcut({ key: "x", ctrlKey: true, metaKey: false, shiftKey: false })).toBe("cut");
  });

  it("should detect Delete key", () => {
    expect(detectShortcut({ key: "Delete", ctrlKey: false, metaKey: false, shiftKey: false })).toBe("delete");
  });

  it("should detect Backspace key", () => {
    expect(detectShortcut({ key: "Backspace", ctrlKey: false, metaKey: false, shiftKey: false })).toBe("delete");
  });

  it("should detect Ctrl+A as selectAll", () => {
    expect(detectShortcut({ key: "a", ctrlKey: true, metaKey: false, shiftKey: false })).toBe("selectAll");
  });

  it("should detect Ctrl+S as save", () => {
    expect(detectShortcut({ key: "s", ctrlKey: true, metaKey: false, shiftKey: false })).toBe("save");
  });

  it("should detect Cmd+Z (macOS) as undo", () => {
    expect(detectShortcut({ key: "z", ctrlKey: false, metaKey: true, shiftKey: false })).toBe("undo");
  });

  it("should not trigger when typing in INPUT", () => {
    expect(
      detectShortcut(
        { key: "z", ctrlKey: true, metaKey: false, shiftKey: false },
        { tagName: "INPUT", isContentEditable: false },
      ),
    ).toBeNull();
  });

  it("should not trigger when typing in TEXTAREA", () => {
    expect(
      detectShortcut(
        { key: "z", ctrlKey: true, metaKey: false, shiftKey: false },
        { tagName: "TEXTAREA", isContentEditable: false },
      ),
    ).toBeNull();
  });

  it("should not trigger in contentEditable elements", () => {
    expect(
      detectShortcut(
        { key: "z", ctrlKey: true, metaKey: false, shiftKey: false },
        { tagName: "DIV", isContentEditable: true },
      ),
    ).toBeNull();
  });

  it("should return null for unrecognized shortcuts", () => {
    expect(detectShortcut({ key: "q", ctrlKey: true, metaKey: false, shiftKey: false })).toBeNull();
  });

  it("should return null for plain letters", () => {
    expect(detectShortcut({ key: "a", ctrlKey: false, metaKey: false, shiftKey: false })).toBeNull();
  });
});
