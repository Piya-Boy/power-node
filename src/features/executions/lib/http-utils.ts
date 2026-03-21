/**
 * HTTP utility functions for the HTTP Request node and integration executors.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface HttpRequestConfig {
  url: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  followRedirects?: boolean;
}

export interface ParsedUrl {
  protocol: string;
  hostname: string;
  port: string | null;
  pathname: string;
  search: string;
  params: Record<string, string>;
}

/**
 * Parse a URL string into its components.
 */
export function parseUrl(urlString: string): ParsedUrl | null {
  try {
    const url = new URL(urlString);
    const params: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return {
      protocol: url.protocol.replace(":", ""),
      hostname: url.hostname,
      port: url.port || null,
      pathname: url.pathname,
      search: url.search,
      params,
    };
  } catch {
    return null;
  }
}

/**
 * Build a URL with query parameters.
 */
export function buildUrl(
  base: string,
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  try {
    const url = new URL(base);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  } catch {
    return base;
  }
}

/**
 * Normalize HTTP method to uppercase.
 */
export function normalizeMethod(method: string): HttpMethod {
  const upper = method.toUpperCase() as HttpMethod;
  const valid: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
  return valid.includes(upper) ? upper : "GET";
}

/**
 * Detect if a response is likely JSON.
 */
export function isJsonContentType(contentType: string): boolean {
  return contentType.includes("application/json") || contentType.includes("+json");
}

/**
 * Parse response body based on content type.
 */
export function parseResponseBody(
  body: string,
  contentType: string,
): unknown {
  if (isJsonContentType(contentType)) {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
}

/**
 * Build Authorization header from credentials.
 */
export function buildAuthHeader(
  type: "bearer" | "basic" | "api_key",
  value: string,
  headerName?: string,
): Record<string, string> {
  switch (type) {
    case "bearer":
      return { Authorization: `Bearer ${value}` };
    case "basic":
      return { Authorization: `Basic ${Buffer.from(value).toString("base64")}` };
    case "api_key":
      return { [headerName || "X-API-Key"]: value };
    default:
      return {};
  }
}

/**
 * Extract error message from HTTP response.
 */
export function extractHttpError(status: number, body: unknown): string {
  const statusText = HTTP_STATUS_MESSAGES[status] || "Unknown Error";

  if (typeof body === "object" && body !== null) {
    const b = body as Record<string, unknown>;
    const msg = b.message || b.error || b.error_description || b.detail;
    if (msg) return `${status} ${statusText}: ${msg}`;
  }

  if (typeof body === "string" && body.length > 0 && body.length < 200) {
    return `${status} ${statusText}: ${body}`;
  }

  return `${status} ${statusText}`;
}

export const HTTP_STATUS_MESSAGES: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No Content",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};
