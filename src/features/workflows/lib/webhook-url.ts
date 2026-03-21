import crypto from "crypto";

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function getWebhookUrl(secret: string, baseUrl?: string): string {
  const base = baseUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}/api/webhooks/trigger/${secret}`;
}
