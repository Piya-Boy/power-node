/**
 * Phase 77 — Workflow Pagination Helper
 * Pure utilities for cursor-based and offset-based pagination,
 * sorting, filtering slices, and generating pagination metadata.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SortOrder = "asc" | "desc";

export interface SortSpec {
  field: string;
  order: SortOrder;
}

export interface OffsetPageRequest {
  page: number;       // 1-based
  pageSize: number;
  sort?: SortSpec[];
}

export interface OffsetPageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  from: number;       // 1-based index of first item
  to: number;         // 1-based index of last item
}

export interface CursorPageRequest {
  cursor?: string;    // opaque cursor (base64-encoded position)
  limit: number;
  sort?: SortSpec[];
  direction?: "forward" | "backward";
}

export interface CursorPageResult<T> {
  items: T[];
  nextCursor?: string;
  prevCursor?: string;
  hasNext: boolean;
  hasPrev: boolean;
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cursor Encoding
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encode a cursor from a record and field name.
 * The cursor encodes the index and value for stable pagination.
 */
export function encodeCursor(index: number, value: unknown): string {
  const payload = JSON.stringify({ index, value });
  return Buffer.from(payload).toString("base64");
}

/**
 * Decode a cursor string.
 */
export function decodeCursor(cursor: string): { index: number; value: unknown } | undefined {
  try {
    const payload = Buffer.from(cursor, "base64").toString("utf8");
    return JSON.parse(payload);
  } catch {
    return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sorting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract a nested field value using dot notation.
 */
function getFieldValue(item: Record<string, unknown>, field: string): unknown {
  const parts = field.split(".");
  let cur: unknown = item;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Sort an array of records by multiple sort specs.
 */
export function sortItems<T extends Record<string, unknown>>(
  items: T[],
  sort: SortSpec[]
): T[] {
  if (sort.length === 0) return [...items];
  return [...items].sort((a, b) => {
    for (const { field, order } of sort) {
      const av = getFieldValue(a, field);
      const bv = getFieldValue(b, field);
      let cmp = 0;
      if (av === undefined || av === null) cmp = 1;
      else if (bv === undefined || bv === null) cmp = -1;
      else if (typeof av === "string" && typeof bv === "string") cmp = av.localeCompare(bv);
      else if (av < bv) cmp = -1;
      else if (av > bv) cmp = 1;
      if (cmp !== 0) return order === "asc" ? cmp : -cmp;
    }
    return 0;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Offset Pagination
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Paginate an array using offset/page number.
 */
export function paginateOffset<T extends Record<string, unknown>>(
  items: T[],
  request: OffsetPageRequest
): OffsetPageResult<T> {
  const { pageSize } = request;
  const safePageSize = Math.max(1, Math.min(pageSize, 1000));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const page = Math.max(1, Math.min(request.page, totalPages));

  const sorted = request.sort ? sortItems(items, request.sort) : [...items];

  const start = (page - 1) * safePageSize;
  const end = Math.min(start + safePageSize, total);
  const sliced = sorted.slice(start, end);

  return {
    items: sliced,
    total,
    page,
    pageSize: safePageSize,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    from: total === 0 ? 0 : start + 1,
    to: end,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cursor Pagination
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Paginate an array using an opaque cursor.
 * The cursor encodes the index of the last seen item.
 */
export function paginateCursor<T extends Record<string, unknown>>(
  items: T[],
  request: CursorPageRequest
): CursorPageResult<T> {
  const { limit, cursor, direction = "forward" } = request;
  const safeLimit = Math.max(1, Math.min(limit, 1000));

  const sorted = request.sort ? sortItems(items, request.sort) : [...items];

  let startIndex = 0;

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded !== undefined) {
      if (direction === "forward") {
        startIndex = Math.min(decoded.index + 1, sorted.length);
      } else {
        startIndex = Math.max(0, decoded.index - safeLimit);
      }
    }
  }

  const endIndex = Math.min(startIndex + safeLimit, sorted.length);
  const sliced = sorted.slice(startIndex, endIndex);

  const nextCursor = endIndex < sorted.length
    ? encodeCursor(endIndex - 1, getFieldValue(sliced[sliced.length - 1], request.sort?.[0]?.field ?? "id"))
    : undefined;

  const prevCursor = startIndex > 0
    ? encodeCursor(startIndex - 1, getFieldValue(sorted[startIndex - 1], request.sort?.[0]?.field ?? "id"))
    : undefined;

  return {
    items: sliced,
    nextCursor,
    prevCursor,
    hasNext: endIndex < sorted.length,
    hasPrev: startIndex > 0,
    count: sliced.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clamp a page number to valid range.
 */
export function clampPage(page: number, totalPages: number): number {
  return Math.max(1, Math.min(page, Math.max(1, totalPages)));
}

/**
 * Compute the total number of pages for a given item count and page size.
 */
export function totalPages(totalItems: number, pageSize: number): number {
  if (totalItems <= 0 || pageSize <= 0) return 1;
  return Math.ceil(totalItems / pageSize);
}

/**
 * Generate an array of page numbers for pagination UI (with ellipsis markers).
 * Returns numbers and -1 for ellipsis gaps.
 */
export function generatePageNumbers(currentPage: number, total: number, maxVisible = 7): number[] {
  if (total <= maxVisible) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: number[] = [];
  const halfWindow = Math.floor(maxVisible / 2);

  let start = Math.max(2, currentPage - halfWindow + 1);
  let end = Math.min(total - 1, currentPage + halfWindow - 1);

  if (currentPage <= halfWindow) {
    start = 2;
    end = maxVisible - 2;
  } else if (currentPage > total - halfWindow) {
    start = total - maxVisible + 3;
    end = total - 1;
  }

  pages.push(1);
  if (start > 2) pages.push(-1); // ellipsis
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push(-1); // ellipsis
  pages.push(total);

  return pages;
}

/**
 * Get a named page: "first", "last", "next", "prev".
 */
export function getNamedPage(
  named: "first" | "last" | "next" | "prev",
  currentPage: number,
  total: number
): number {
  switch (named) {
    case "first": return 1;
    case "last": return Math.max(1, total);
    case "next": return Math.min(currentPage + 1, total);
    case "prev": return Math.max(currentPage - 1, 1);
  }
}

/**
 * Build a URL query string for pagination parameters.
 */
export function buildPageQuery(
  params: { page?: number; pageSize?: number; sortField?: string; sortOrder?: SortOrder }
): string {
  const parts: string[] = [];
  if (params.page !== undefined) parts.push(`page=${params.page}`);
  if (params.pageSize !== undefined) parts.push(`pageSize=${params.pageSize}`);
  if (params.sortField) parts.push(`sort=${encodeURIComponent(params.sortField)}`);
  if (params.sortOrder) parts.push(`order=${params.sortOrder}`);
  return parts.join("&");
}
