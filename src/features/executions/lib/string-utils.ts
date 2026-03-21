/**
 * String transformation utilities used by Transform, Code, and AI nodes.
 */

/**
 * Convert a string to different case formats.
 */
export function toCase(
  str: string,
  format: "camel" | "pascal" | "snake" | "kebab" | "upper" | "lower" | "title",
): string {
  const words = str
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .trim()
    .split(/\s+/);

  switch (format) {
    case "camel":
      return words
        .map((w, i) =>
          i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
        )
        .join("");
    case "pascal":
      return words
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join("");
    case "snake":
      return words.map((w) => w.toLowerCase()).join("_");
    case "kebab":
      return words.map((w) => w.toLowerCase()).join("-");
    case "upper":
      return str.toUpperCase();
    case "lower":
      return str.toLowerCase();
    case "title":
      return words
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    default:
      return str;
  }
}

/**
 * Truncate a string to a maximum length with an optional suffix.
 */
export function truncate(str: string, maxLength: number, suffix: string = "..."): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Slugify a string (URL-safe).
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Count words in a string.
 */
export function countWords(str: string): number {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Extract numbers from a string.
 */
export function extractNumbers(str: string): number[] {
  const matches = str.match(/-?\d+\.?\d*/g);
  return matches ? matches.map(Number) : [];
}

/**
 * Interpolate a template string using ${key} syntax (not Handlebars).
 * Simpler than Handlebars for inline use.
 */
export function interpolate(
  template: string,
  values: Record<string, unknown>,
): string {
  return template.replace(/\$\{([^}]+)\}/g, (_, key) => {
    const val = values[key.trim()];
    return val !== undefined && val !== null ? String(val) : "";
  });
}

/**
 * Check if a string is a valid email.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Check if a string is a valid URL.
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Escape HTML special characters.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Strip HTML tags from a string.
 */
export function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

/**
 * Generate a random string of given length.
 */
export function randomString(length: number, charset: string = "alphanumeric"): string {
  const charsets: Record<string, string> = {
    alphanumeric: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    numeric: "0123456789",
    hex: "0123456789abcdef",
    alpha: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  };
  const chars = charsets[charset] || charsets.alphanumeric;
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
