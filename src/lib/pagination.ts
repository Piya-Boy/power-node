/**
 * Pagination and search utilities for list views.
 */

export interface PaginationState {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PageInfo {
  startIndex: number;
  endIndex: number;
  itemCount: number;
}

/**
 * Calculate pagination state from raw values.
 */
export function calculatePagination(
  page: number,
  pageSize: number,
  totalCount: number,
): PaginationState {
  const clampedPage = Math.max(1, Math.min(page, Math.ceil(totalCount / pageSize) || 1));
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return {
    page: clampedPage,
    pageSize,
    totalCount,
    totalPages,
    hasNextPage: clampedPage < totalPages,
    hasPreviousPage: clampedPage > 1,
  };
}

/**
 * Get info about which items are shown on the current page.
 */
export function getPageInfo(pagination: PaginationState): PageInfo {
  const startIndex = (pagination.page - 1) * pagination.pageSize + 1;
  const endIndex = Math.min(
    pagination.page * pagination.pageSize,
    pagination.totalCount,
  );
  return {
    startIndex,
    endIndex,
    itemCount: Math.max(0, endIndex - startIndex + 1),
  };
}

/**
 * Generate page number array for pagination controls.
 * Returns at most 7 page numbers with ellipsis indicators (-1).
 */
export function getPageNumbers(
  currentPage: number,
  totalPages: number,
): number[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: number[] = [1];

  if (currentPage <= 3) {
    pages.push(2, 3, 4, -1, totalPages);
  } else if (currentPage >= totalPages - 2) {
    pages.push(-1, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
  } else {
    pages.push(-1, currentPage - 1, currentPage, currentPage + 1, -1, totalPages);
  }

  return pages;
}

/**
 * Fuzzy search: compute a similarity score between query and target.
 * Returns 0 (no match) to 1 (exact match).
 */
export function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (t === q) return 1;
  if (t.startsWith(q)) return 0.95;
  if (t.includes(q)) return 0.9;

  // Character matching
  let matches = 0;
  let lastIndex = -1;
  for (const char of q) {
    const idx = t.indexOf(char, lastIndex + 1);
    if (idx === -1) return 0;
    matches++;
    lastIndex = idx;
  }

  return matches / t.length;
}

/**
 * Apply fuzzy search to a list of items.
 */
export function fuzzySearch<T>(
  items: T[],
  query: string,
  getSearchString: (item: T) => string,
  threshold: number = 0.1,
): T[] {
  if (!query) return items;

  return items
    .map((item) => ({
      item,
      score: fuzzyScore(query, getSearchString(item)),
    }))
    .filter(({ score }) => score >= threshold)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}
