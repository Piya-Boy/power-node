/**
 * Array transformation utilities for the Loop, Filter, Sort, Aggregate, and Remove Duplicates nodes.
 */

/**
 * Group array items by a key.
 */
export function groupBy<T extends Record<string, unknown>>(
  items: T[],
  key: string,
): Record<string, T[]> {
  return items.reduce(
    (acc, item) => {
      const groupKey = String(item[key] ?? "__unknown__");
      if (!acc[groupKey]) acc[groupKey] = [];
      acc[groupKey].push(item);
      return acc;
    },
    {} as Record<string, T[]>,
  );
}

/**
 * Remove duplicate items from array by a key or value equality.
 */
export function removeDuplicates<T>(
  items: T[],
  key?: string,
): T[] {
  if (!key) {
    const seen = new Set<string>();
    return items.filter((item) => {
      const serialized = JSON.stringify(item);
      if (seen.has(serialized)) return false;
      seen.add(serialized);
      return true;
    });
  }

  const seen = new Set<unknown>();
  return items.filter((item) => {
    const val = (item as Record<string, unknown>)[key];
    if (seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}

/**
 * Sort an array of objects by a key.
 */
export function sortBy<T extends Record<string, unknown>>(
  items: T[],
  key: string,
  direction: "asc" | "desc" = "asc",
): T[] {
  return [...items].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];

    let comparison = 0;
    if (typeof aVal === "string" && typeof bVal === "string") {
      comparison = aVal.localeCompare(bVal);
    } else if (typeof aVal === "number" && typeof bVal === "number") {
      comparison = aVal - bVal;
    } else if (aVal instanceof Date && bVal instanceof Date) {
      comparison = aVal.getTime() - bVal.getTime();
    } else {
      comparison = String(aVal).localeCompare(String(bVal));
    }

    return direction === "asc" ? comparison : -comparison;
  });
}

/**
 * Aggregate values in an array by computing sum, avg, min, max, count.
 */
export function aggregate(
  items: Record<string, unknown>[],
  field: string,
  operation: "sum" | "avg" | "min" | "max" | "count",
): number {
  if (operation === "count") return items.length;

  const values = items
    .map((item) => Number(item[field]))
    .filter((v) => !isNaN(v));

  if (values.length === 0) return 0;

  switch (operation) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "avg":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    default:
      return 0;
  }
}

/**
 * Chunk an array into smaller arrays of a given size.
 */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Flatten a nested array by one level.
 */
export function flatten<T>(items: (T | T[])[]): T[] {
  return items.reduce<T[]>((acc, item) => {
    return Array.isArray(item) ? [...acc, ...item] : [...acc, item];
  }, []);
}

/**
 * Filter array items by field conditions.
 */
export function filterBy<T extends Record<string, unknown>>(
  items: T[],
  conditions: Array<{
    field: string;
    operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "contains" | "starts_with" | "ends_with";
    value: unknown;
  }>,
): T[] {
  return items.filter((item) =>
    conditions.every(({ field, operator, value }) => {
      const itemVal = item[field];
      switch (operator) {
        case "eq": return itemVal === value;
        case "neq": return itemVal !== value;
        case "gt": return Number(itemVal) > Number(value);
        case "lt": return Number(itemVal) < Number(value);
        case "gte": return Number(itemVal) >= Number(value);
        case "lte": return Number(itemVal) <= Number(value);
        case "contains":
          return typeof itemVal === "string" && itemVal.includes(String(value));
        case "starts_with":
          return typeof itemVal === "string" && itemVal.startsWith(String(value));
        case "ends_with":
          return typeof itemVal === "string" && itemVal.endsWith(String(value));
        default:
          return true;
      }
    }),
  );
}

/**
 * Zip two arrays together.
 */
export function zip<A, B>(a: A[], b: B[]): [A, B][] {
  const length = Math.min(a.length, b.length);
  return Array.from({ length }, (_, i) => [a[i], b[i]]);
}
