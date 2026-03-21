/**
 * Phase 26 — Enterprise & Security: Two-Factor Authentication utilities
 * Pure helpers for TOTP/backup-code workflows (no crypto deps beyond built-in).
 */

import { createHmac, randomBytes } from "crypto";

export interface TwoFactorSetup {
  secret: string;       // Base32-encoded TOTP secret
  backupCodes: string[];
  qrUri: string;        // otpauth:// URI for QR code
}

export interface TotpConfig {
  digits?: number;        // default 6
  period?: number;        // seconds, default 30
  algorithm?: "SHA1" | "SHA256" | "SHA512";
}

// Base32 alphabet (RFC 4648)
const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Generate a cryptographically random Base32 secret (160 bits = 20 bytes).
 */
export function generateTotpSecret(byteLength = 20): string {
  const bytes = randomBytes(byteLength);
  let result = "";
  let buffer = 0;
  let bitsLeft = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitsLeft += 8;
    while (bitsLeft >= 5) {
      bitsLeft -= 5;
      result += BASE32_CHARS[(buffer >> bitsLeft) & 0x1f];
    }
  }
  if (bitsLeft > 0) {
    result += BASE32_CHARS[(buffer << (5 - bitsLeft)) & 0x1f];
  }
  return result;
}

/**
 * Decode a Base32 string to a Buffer.
 */
export function base32Decode(input: string): Buffer {
  const str = input.toUpperCase().replace(/=+$/, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bitsLeft = 0;

  for (const ch of str) {
    const val = BASE32_CHARS.indexOf(ch);
    if (val === -1) throw new Error(`Invalid base32 character: ${ch}`);
    buffer = (buffer << 5) | val;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      bitsLeft -= 8;
      bytes.push((buffer >> bitsLeft) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

/**
 * Compute a TOTP token for a given timestamp.
 */
export function computeTotp(
  secret: string,
  timestamp = Date.now(),
  config: TotpConfig = {}
): string {
  const { digits = 6, period = 30, algorithm = "SHA1" } = config;
  const keyBytes = base32Decode(secret);
  const counter = Math.floor(timestamp / 1000 / period);

  // Counter as 8-byte big-endian buffer
  const counterBuf = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    counterBuf[i] = c & 0xff;
    c = Math.floor(c / 256);
  }

  const hmacAlg = algorithm === "SHA1" ? "sha1" : algorithm === "SHA256" ? "sha256" : "sha512";
  const mac = createHmac(hmacAlg, keyBytes).update(counterBuf).digest();

  // Dynamic truncation
  const offset = mac[mac.length - 1] & 0x0f;
  const code =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);

  return String(code % Math.pow(10, digits)).padStart(digits, "0");
}

/**
 * Verify a TOTP token allowing ±1 time step drift.
 */
export function verifyTotp(
  token: string,
  secret: string,
  config: TotpConfig = {}
): boolean {
  const { period = 30 } = config;
  const now = Date.now();
  for (const offset of [-1, 0, 1]) {
    const expected = computeTotp(secret, now + offset * period * 1000, config);
    if (timingSafeEqual(token, expected)) return true;
  }
  return false;
}

/**
 * Generate N backup codes (8-char alphanumeric).
 */
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8);
    let code = "";
    for (const b of bytes) {
      code += charset[b % charset.length];
    }
    codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}`);
  }
  return codes;
}

/**
 * Build an otpauth:// URI for QR code generation.
 */
export function buildOtpAuthUri(params: {
  secret: string;
  issuer: string;
  accountName: string;
  digits?: number;
  period?: number;
  algorithm?: string;
}): string {
  const { secret, issuer, accountName, digits = 6, period = 30, algorithm = "SHA1" } = params;
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const iss = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${iss}&algorithm=${algorithm}&digits=${digits}&period=${period}`;
}

/**
 * Create a full 2FA setup bundle.
 */
export function createTwoFactorSetup(params: {
  issuer: string;
  accountName: string;
  config?: TotpConfig;
}): TwoFactorSetup {
  const secret = generateTotpSecret();
  const backupCodes = generateBackupCodes(10);
  const qrUri = buildOtpAuthUri({
    secret,
    issuer: params.issuer,
    accountName: params.accountName,
    digits: params.config?.digits,
    period: params.config?.period,
    algorithm: params.config?.algorithm,
  });
  return { secret, backupCodes, qrUri };
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}

/**
 * Validate backup code format (XXXX-XXXX).
 */
export function isValidBackupCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code);
}

/**
 * Consume a backup code from the list. Returns new list or null if not found.
 */
export function consumeBackupCode(
  codes: string[],
  provided: string
): string[] | null {
  const normalised = provided.toUpperCase().trim();
  const index = codes.findIndex((c) => timingSafeEqual(c, normalised));
  if (index === -1) return null;
  return codes.filter((_, i) => i !== index);
}
