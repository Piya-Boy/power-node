import { describe, it, expect } from "vitest";
import {
  encodeCursor,
  decodeCursor,
  sortItems,
  paginateOffset,
  paginateCursor,
  clampPage,
  totalPages,
  generatePageNumbers,
  getNamedPage,
  buildPageQuery,
} from "./pagination";

// ─────────────────────────────────────────────────────────────────────────────
// encodeCursor / decodeCursor
// ─────────────────────────────────────────────────────────────────────────────

describe("encodeCursor / decodeCursor", () => {
  it("encodes and decodes a cursor", () => {
    const cursor = encodeCursor(5, "value-x");
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual({ index: 5, value: "value-x" });
  });

  it("handles numeric value", () => {
    const cursor = encodeCursor(0, 42);
    const decoded = decodeCursor(cursor);
    expect(decoded?.value).toBe(42);
  });

  it("returns undefined for invalid cursor", () => {
    expect(decodeCursor("not-valid-base64!!!")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sortItems
// ─────────────────────────────────────────────────────────────────────────────

describe("sortItems", () => {
  const items = [
    { name: "Charlie", age: 35 },
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
  ];

  it("sorts by string field asc", () => {
    const sorted = sortItems(items, [{ field: "name", order: "asc" }]);
    expect(sorted.map((i) => i.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("sorts by string field desc", () => {
    const sorted = sortItems(items, [{ field: "name", order: "desc" }]);
    expect(sorted[0].name).toBe("Charlie");
  });

  it("sorts by number field asc", () => {
    const sorted = sortItems(items, [{ field: "age", order: "asc" }]);
    expect(sorted[0].age).toBe(25);
  });

  it("secondary sort", () => {
    const data = [
      { dept: "eng", level: 2 },
      { dept: "eng", level: 1 },
      { dept: "design", level: 3 },
    ];
    const sorted = sortItems(data, [
      { field: "dept", order: "asc" },
      { field: "level", order: "asc" },
    ]);
    expect(sorted[0]).toEqual({ dept: "design", level: 3 });
    expect(sorted[1]).toEqual({ dept: "eng", level: 1 });
  });

  it("returns copy without mutation", () => {
    sortItems(items, [{ field: "name", order: "asc" }]);
    expect(items[0].name).toBe("Charlie");
  });

  it("handles null values (puts nulls last)", () => {
    const data = [{ v: null }, { v: 1 }, { v: 2 }];
    const sorted = sortItems(data as any[], [{ field: "v", order: "asc" }]);
    expect(sorted[sorted.length - 1].v).toBeNull();
  });

  it("returns same order for empty sort spec", () => {
    const sorted = sortItems(items, []);
    expect(sorted).toEqual(items);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// paginateOffset
// ─────────────────────────────────────────────────────────────────────────────

describe("paginateOffset", () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `item${i + 1}` }));

  it("returns first page", () => {
    const result = paginateOffset(items, { page: 1, pageSize: 10 });
    expect(result.items).toHaveLength(10);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(3);
    expect(result.hasNext).toBe(true);
    expect(result.hasPrev).toBe(false);
    expect(result.from).toBe(1);
    expect(result.to).toBe(10);
  });

  it("returns last page with remaining items", () => {
    const result = paginateOffset(items, { page: 3, pageSize: 10 });
    expect(result.items).toHaveLength(5);
    expect(result.hasNext).toBe(false);
    expect(result.hasPrev).toBe(true);
    expect(result.from).toBe(21);
    expect(result.to).toBe(25);
  });

  it("clamps to valid page range", () => {
    const result = paginateOffset(items, { page: 99, pageSize: 10 });
    expect(result.page).toBe(3);
  });

  it("sorts items before paginating", () => {
    const result = paginateOffset(items, {
      page: 1,
      pageSize: 5,
      sort: [{ field: "id", order: "desc" }],
    });
    expect(result.items[0].id).toBe(25);
  });

  it("handles empty items", () => {
    const result = paginateOffset([], { page: 1, pageSize: 10 });
    expect(result.total).toBe(0);
    expect(result.from).toBe(0);
    expect(result.totalPages).toBe(1);
  });

  it("caps pageSize at 1000", () => {
    const result = paginateOffset(items, { page: 1, pageSize: 99999 });
    expect(result.pageSize).toBe(1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// paginateCursor
// ─────────────────────────────────────────────────────────────────────────────

describe("paginateCursor", () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ id: i + 1 }));

  it("returns first page without cursor", () => {
    const result = paginateCursor(items, { limit: 5 });
    expect(result.items).toHaveLength(5);
    expect(result.items[0].id).toBe(1);
    expect(result.hasNext).toBe(true);
    expect(result.hasPrev).toBe(false);
    expect(result.nextCursor).toBeDefined();
    expect(result.prevCursor).toBeUndefined();
  });

  it("follows next cursor for second page", () => {
    const first = paginateCursor(items, { limit: 5 });
    const second = paginateCursor(items, { limit: 5, cursor: first.nextCursor });
    expect(second.items[0].id).toBe(6);
    expect(second.hasNext).toBe(true);
    expect(second.hasPrev).toBe(true);
  });

  it("returns last page", () => {
    const pg1 = paginateCursor(items, { limit: 10 });
    const pg2 = paginateCursor(items, { limit: 10, cursor: pg1.nextCursor });
    expect(pg2.items).toHaveLength(10);
    expect(pg2.hasNext).toBe(false);
  });

  it("handles empty items", () => {
    const result = paginateCursor([], { limit: 5 });
    expect(result.items).toHaveLength(0);
    expect(result.hasNext).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// clampPage / totalPages
// ─────────────────────────────────────────────────────────────────────────────

describe("clampPage", () => {
  it("clamps to 1 minimum", () => expect(clampPage(0, 5)).toBe(1));
  it("clamps to max", () => expect(clampPage(99, 5)).toBe(5));
  it("passes through valid page", () => expect(clampPage(3, 5)).toBe(3));
});

describe("totalPages", () => {
  it("computes total pages", () => expect(totalPages(25, 10)).toBe(3));
  it("returns 1 for zero items", () => expect(totalPages(0, 10)).toBe(1));
  it("returns 1 when all fit", () => expect(totalPages(5, 10)).toBe(1));
  it("handles exact fit", () => expect(totalPages(20, 10)).toBe(2));
});

// ─────────────────────────────────────────────────────────────────────────────
// generatePageNumbers
// ─────────────────────────────────────────────────────────────────────────────

describe("generatePageNumbers", () => {
  it("returns all pages when total <= maxVisible", () => {
    expect(generatePageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("includes first and last page always", () => {
    const pages = generatePageNumbers(5, 20);
    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(20);
  });

  it("uses -1 for ellipsis", () => {
    const pages = generatePageNumbers(10, 20);
    expect(pages.includes(-1)).toBe(true);
  });

  it("no ellipsis for small page count", () => {
    const pages = generatePageNumbers(3, 7);
    expect(pages.includes(-1)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getNamedPage
// ─────────────────────────────────────────────────────────────────────────────

describe("getNamedPage", () => {
  it("first", () => expect(getNamedPage("first", 5, 10)).toBe(1));
  it("last", () => expect(getNamedPage("last", 5, 10)).toBe(10));
  it("next", () => expect(getNamedPage("next", 5, 10)).toBe(6));
  it("next clamps at last", () => expect(getNamedPage("next", 10, 10)).toBe(10));
  it("prev", () => expect(getNamedPage("prev", 5, 10)).toBe(4));
  it("prev clamps at 1", () => expect(getNamedPage("prev", 1, 10)).toBe(1));
});

// ─────────────────────────────────────────────────────────────────────────────
// buildPageQuery
// ─────────────────────────────────────────────────────────────────────────────

describe("buildPageQuery", () => {
  it("builds a query string", () => {
    const q = buildPageQuery({ page: 2, pageSize: 20, sortField: "name", sortOrder: "asc" });
    expect(q).toContain("page=2");
    expect(q).toContain("pageSize=20");
    expect(q).toContain("sort=name");
    expect(q).toContain("order=asc");
  });

  it("omits undefined params", () => {
    const q = buildPageQuery({ page: 1 });
    expect(q).toBe("page=1");
  });

  it("returns empty string for no params", () => {
    expect(buildPageQuery({})).toBe("");
  });
});
