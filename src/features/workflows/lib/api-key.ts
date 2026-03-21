import { createId } from "@paralleldrive/cuid2";
import crypto from "crypto";

const API_KEY_PREFIX = "pn_";

export function generateApiKey(): string {
  const random = crypto.randomBytes(32).toString("hex");
  return `${API_KEY_PREFIX}${random}`;
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function isValidApiKeyFormat(key: string): boolean {
  return key.startsWith(API_KEY_PREFIX) && key.length === API_KEY_PREFIX.length + 64;
}

export function maskApiKey(key: string): string {
  if (key.length < 12) return "***";
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}
