import { describe, it, expect } from "vitest";
import {
  calculatePagination,
  getPageInfo,
  getPageNumbers,
  fuzzyScore,
  fuzzySearch,
} from "./pagination";

describe("Pagination Utilities", () => {
  describe("calculatePagination", () => {
    it("should calculate basic pagination", () => {
      const p = calculatePagination(1, 10, 100);
      expect(p.page).toBe(1);
      expect(p.totalPages).toBe(10);
      expect(p.hasNextPage).toBe(true);
      expect(p.hasPreviousPage).toBe(false);
    });

    it("should detect last page correctly", () => {
      const p = calculatePagination(5, 10, 50);
      expect(p.hasNextPage).toBe(false);
      expect(p.hasPreviousPage).toBe(true);
    });

    it("should clamp page to valid range", () => {
      const p = calculatePagination(100, 10, 50);
      expect(p.page).toBe(5);
    });

    it("should handle empty results", () => {
      const p = calculatePagination(1, 10, 0);
      expect(p.totalPages).toBe(1);
      expect(p.hasNextPage).toBe(false);
    });

    it("should handle partial last page", () => {
      const p = calculatePagination(3, 10, 25);
      expect(p.totalPages).toBe(3);
    });
  });

  describe("getPageInfo", () => {
    it("should calculate start/end index", () => {
      const pagination = calculatePagination(2, 10, 100);
      const info = getPageInfo(pagination);
      expect(info.startIndex).toBe(11);
      expect(info.endIndex).toBe(20);
      expect(info.itemCount).toBe(10);
    });

    it("should handle partial last page", () => {
      const pagination = calculatePagination(3, 10, 25);
      const info = getPageInfo(pagination);
      expect(info.endIndex).toBe(25);
      expect(info.itemCount).toBe(5);
    });

    it("should handle empty results", () => {
      const pagination = calculatePagination(1, 10, 0);
      const info = getPageInfo(pagination);
      expect(info.itemCount).toBe(0);
    });
  });

  describe("getPageNumbers", () => {
    it("should return all pages for 7 or fewer", () => {
      expect(getPageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5]);
    });

    it("should return 7 pages exactly", () => {
      expect(getPageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it("should use ellipsis (-1) for large page counts", () => {
      const pages = getPageNumbers(1, 20);
      expect(pages).toContain(-1);
      expect(pages[0]).toBe(1);
      expect(pages[pages.length - 1]).toBe(20);
    });

    it("should show pages around current page", () => {
      const pages = getPageNumbers(10, 20);
      expect(pages).toContain(10);
      expect(pages).toContain(9);
      expect(pages).toContain(11);
    });
  });

  describe("fuzzyScore", () => {
    it("should return 1 for exact match", () => {
      expect(fuzzyScore("hello", "hello")).toBe(1);
    });

    it("should return 0.9 for substring match", () => {
      expect(fuzzyScore("ello", "hello")).toBe(0.9);
    });

    it("should return 0.95 for prefix match", () => {
      expect(fuzzyScore("hel", "hello")).toBe(0.95);
    });

    it("should return 1 for empty query", () => {
      expect(fuzzyScore("", "hello")).toBe(1);
    });

    it("should return 0 for no match", () => {
      expect(fuzzyScore("xyz", "hello")).toBe(0);
    });

    it("should be case insensitive", () => {
      expect(fuzzyScore("HELLO", "hello")).toBe(1);
    });
  });

  describe("fuzzySearch", () => {
    const items = [
      { name: "HTTP Request" },
      { name: "Telegram" },
      { name: "OpenAI" },
      { name: "GitHub" },
    ];
    const getStr = (item: { name: string }) => item.name;

    it("should find matching items", () => {
      const result = fuzzySearch(items, "git", getStr);
      expect(result.some((i) => i.name === "GitHub")).toBe(true);
    });

    it("should return all items for empty query", () => {
      expect(fuzzySearch(items, "", getStr)).toHaveLength(4);
    });

    it("should return empty for no matches", () => {
      const result = fuzzySearch(items, "zzzzzz", getStr);
      expect(result).toHaveLength(0);
    });

    it("should rank better matches first", () => {
      const result = fuzzySearch(items, "http", getStr);
      expect(result[0].name).toBe("HTTP Request");
    });
  });
});
