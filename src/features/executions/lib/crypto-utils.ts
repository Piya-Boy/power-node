import crypto from "crypto";

/**
 * Cryptography utilities for the Crypto node.
 * Hashing, HMAC, encoding/decoding, UUID generation.
 */

export type HashAlgorithm = "md5" | "sha1" | "sha256" | "sha512";
export type Encoding = "hex" | "base64" | "base64url";

/**
 * Hash a string using the given algorithm.
 */
export function hash(
  input: string,
  algorithm: HashAlgorithm = "sha256",
  encoding: Encoding = "hex",
): string {
  return crypto.createHash(algorithm).update(input).digest(encoding as "hex" | "base64" | "base64url");
}

/**
 * Create an HMAC signature.
 */
export function hmac(
  input: string,
  secret: string,
  algorithm: HashAlgorithm = "sha256",
  encoding: Encoding = "hex",
): string {
  return crypto.createHmac(algorithm, secret).update(input).digest(encoding as "hex" | "base64" | "base64url");
}

/**
 * Encode a string or buffer to Base64.
 */
export function base64Encode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64");
}

/**
 * Decode a Base64 string.
 */
export function base64Decode(input: string): string {
  return Buffer.from(input, "base64").toString("utf8");
}

/**
 * URL-safe Base64 encode.
 */
export function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * URL-safe Base64 decode.
 */
export function base64UrlDecode(input: string): string {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/**
 * Encode to hex.
 */
export function hexEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("hex");
}

/**
 * Decode from hex.
 */
export function hexDecode(input: string): string {
  return Buffer.from(input, "hex").toString("utf8");
}

/**
 * Generate a random UUID v4.
 */
export function generateUuid(): string {
  return crypto.randomUUID();
}

/**
 * Generate a random hex string.
 */
export function randomHex(bytes: number = 16): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Constant-time string comparison (for security).
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * Verify an HMAC signature.
 */
export function verifyHmac(
  input: string,
  signature: string,
  secret: string,
  algorithm: HashAlgorithm = "sha256",
  encoding: Encoding = "hex",
): boolean {
  const expected = hmac(input, secret, algorithm, encoding);
  return secureCompare(signature, expected);
}
