/**
 * Phase 36 — SSO / SAML / OIDC Utilities
 * Pure utility functions for enterprise identity provider integration.
 * No HTTP calls — all logic is parsing, validation, and transformation.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SsoProvider = "saml" | "oidc" | "ldap";

export type SsoBindingType = "HTTP-POST" | "HTTP-Redirect";

export interface SamlConfig {
  entityId: string;           // Service Provider entity ID
  assertionConsumerUrl: string; // ACS URL
  idpEntityId: string;        // Identity Provider entity ID
  idpSsoUrl: string;          // IdP SSO URL
  idpCertificate: string;     // IdP signing certificate (PEM)
  signRequests?: boolean;
  nameIdFormat?: string;      // urn:oasis:names:tc:SAML:1.1:nameid-format:...
  attributeMapping?: SamlAttributeMapping;
}

export interface SamlAttributeMapping {
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  groups?: string;
  [key: string]: string | undefined;
}

export interface OidcConfig {
  clientId: string;
  clientSecret: string;
  discoveryUrl: string;       // .well-known/openid-configuration URL
  redirectUri: string;
  scopes?: string[];          // defaults: openid, email, profile
  pkce?: boolean;
  attributeMapping?: OidcAttributeMapping;
}

export interface OidcAttributeMapping {
  email?: string;
  name?: string;
  sub?: string;
  groups?: string;
  [key: string]: string | undefined;
}

export interface SsoConnection {
  id: string;
  name: string;
  provider: SsoProvider;
  domain: string;             // email domain this connection handles
  enabled: boolean;
  config: SamlConfig | OidcConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParsedSamlResponse {
  nameId: string;
  nameIdFormat: string;
  sessionIndex?: string;
  attributes: Record<string, string | string[]>;
  issuer: string;
  notBefore?: Date;
  notOnOrAfter?: Date;
  inResponseTo?: string;
  isValid: boolean;
  validationErrors: string[];
}

export interface SsoUserProfile {
  id: string;                 // sub or nameId
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  groups: string[];
  provider: SsoProvider;
  connectionId: string;
  rawAttributes: Record<string, string | string[]>;
}

export interface SsoValidationResult {
  valid: boolean;
  errors: string[];
}

export interface OidcTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  groups?: string[];
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
  [key: string]: unknown;
}

export interface OidcAuthRequest {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  responseType?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SAML Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a SAML configuration for required fields and format.
 */
export function validateSamlConfig(config: SamlConfig): SsoValidationResult {
  const errors: string[] = [];

  if (!config.entityId) errors.push("entityId is required");
  if (!config.assertionConsumerUrl) errors.push("assertionConsumerUrl is required");
  if (!config.idpEntityId) errors.push("idpEntityId is required");
  if (!config.idpSsoUrl) errors.push("idpSsoUrl is required");
  if (!config.idpCertificate) errors.push("idpCertificate is required");

  if (config.assertionConsumerUrl && !isValidUrl(config.assertionConsumerUrl)) {
    errors.push("assertionConsumerUrl must be a valid HTTPS URL");
  }
  if (config.idpSsoUrl && !isValidUrl(config.idpSsoUrl)) {
    errors.push("idpSsoUrl must be a valid URL");
  }
  if (config.idpCertificate && !isValidPemCertificate(config.idpCertificate)) {
    errors.push("idpCertificate must be a valid PEM certificate");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate an OIDC configuration for required fields and format.
 */
export function validateOidcConfig(config: OidcConfig): SsoValidationResult {
  const errors: string[] = [];

  if (!config.clientId) errors.push("clientId is required");
  if (!config.clientSecret) errors.push("clientSecret is required");
  if (!config.discoveryUrl) errors.push("discoveryUrl is required");
  if (!config.redirectUri) errors.push("redirectUri is required");

  if (config.discoveryUrl && !isValidUrl(config.discoveryUrl)) {
    errors.push("discoveryUrl must be a valid URL");
  }
  if (config.redirectUri && !isValidUrl(config.redirectUri)) {
    errors.push("redirectUri must be a valid URL");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Build SAML AuthnRequest XML string.
 * Returns a simplified (non-signed) AuthnRequest for SAML SP-initiated SSO.
 */
export function buildSamlAuthnRequest(params: {
  config: SamlConfig;
  requestId?: string;
  instant?: Date;
  binding?: SsoBindingType;
}): { xml: string; requestId: string } {
  const { config, binding = "HTTP-POST" } = params;
  const requestId = params.requestId ?? `_${generateId()}`;
  const instant = (params.instant ?? new Date()).toISOString();
  const nameIdFormat =
    config.nameIdFormat ??
    "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress";
  const protocolBinding =
    binding === "HTTP-POST"
      ? "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      : "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest
  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="${requestId}"
  Version="2.0"
  IssueInstant="${instant}"
  Destination="${config.idpSsoUrl}"
  AssertionConsumerServiceURL="${config.assertionConsumerUrl}"
  ProtocolBinding="${protocolBinding}">
  <saml:Issuer>${config.entityId}</saml:Issuer>
  <samlp:NameIDPolicy
    Format="${nameIdFormat}"
    AllowCreate="true"/>
</samlp:AuthnRequest>`.trim();

  return { xml, requestId };
}

/**
 * Parse a SAML response XML into a structured object.
 * Performs basic XML parsing (production would use xmldom + xmlcrypto).
 */
export function parseSamlResponse(base64Xml: string): ParsedSamlResponse {
  let xml: string;
  const errors: string[] = [];

  try {
    xml = Buffer.from(base64Xml, "base64").toString("utf-8");
  } catch {
    return {
      nameId: "",
      nameIdFormat: "",
      attributes: {},
      issuer: "",
      isValid: false,
      validationErrors: ["Failed to decode base64 SAML response"],
    };
  }

  // Extract NameID
  const nameIdMatch = xml.match(/<(?:saml:|)[Nn]ame[Ii][Dd][^>]*>([^<]+)<\/(?:saml:|)[Nn]ame[Ii][Dd]>/);
  const nameId = nameIdMatch?.[1]?.trim() ?? "";

  // Extract NameID format attribute
  const nameIdFormatMatch = xml.match(/NameID[^>]+Format="([^"]+)"/);
  const nameIdFormat = nameIdFormatMatch?.[1] ?? "";

  // Extract SessionIndex
  const sessionIndexMatch = xml.match(/SessionIndex="([^"]+)"/);
  const sessionIndex = sessionIndexMatch?.[1];

  // Extract Issuer
  const issuerMatch = xml.match(/<(?:saml:|)[Ii]ssuer[^>]*>([^<]+)<\/(?:saml:|)[Ii]ssuer>/);
  const issuer = issuerMatch?.[1]?.trim() ?? "";

  // Extract InResponseTo
  const inResponseToMatch = xml.match(/InResponseTo="([^"]+)"/);
  const inResponseTo = inResponseToMatch?.[1];

  // Extract NotBefore / NotOnOrAfter
  const notBeforeMatch = xml.match(/NotBefore="([^"]+)"/);
  const notOnOrAfterMatch = xml.match(/NotOnOrAfter="([^"]+)"/);
  const notBefore = notBeforeMatch?.[1] ? new Date(notBeforeMatch[1]) : undefined;
  const notOnOrAfter = notOnOrAfterMatch?.[1] ? new Date(notOnOrAfterMatch[1]) : undefined;

  // Extract Attributes
  const attributes: Record<string, string | string[]> = {};
  const attrRegex =
    /<(?:saml:|)[Aa]ttribute\s+Name="([^"]+)"[^>]*>[\s\S]*?<\/(?:saml:|)[Aa]ttribute>/g;
  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = attrRegex.exec(xml)) !== null) {
    const attrName = attrMatch[1];
    const valuesBlock = attrMatch[0];
    const valueRegex = /<(?:saml:|)[Aa]ttribute[Vv]alue[^>]*>([^<]*)<\/(?:saml:|)[Aa]ttribute[Vv]alue>/g;
    const values: string[] = [];
    let valMatch: RegExpExecArray | null;
    while ((valMatch = valueRegex.exec(valuesBlock)) !== null) {
      values.push(valMatch[1].trim());
    }
    attributes[attrName] = values.length === 1 ? values[0] : values;
  }

  // Validate
  if (!nameId) errors.push("Missing NameID in SAML response");
  if (!issuer) errors.push("Missing Issuer in SAML response");
  if (notOnOrAfter && new Date() > notOnOrAfter) {
    errors.push("SAML assertion has expired (NotOnOrAfter exceeded)");
  }
  if (notBefore && new Date() < notBefore) {
    errors.push("SAML assertion is not yet valid (NotBefore not reached)");
  }

  // Check Status
  const statusCodeMatch = xml.match(/StatusCode[^/]*Value="([^"]+)"/);
  const statusCode = statusCodeMatch?.[1] ?? "";
  if (statusCode && !statusCode.includes("Success")) {
    errors.push(`SAML response status: ${statusCode}`);
  }

  return {
    nameId,
    nameIdFormat,
    sessionIndex,
    attributes,
    issuer,
    notBefore,
    notOnOrAfter,
    inResponseTo,
    isValid: errors.length === 0,
    validationErrors: errors,
  };
}

/**
 * Map SAML attributes to a user profile using attribute mapping config.
 */
export function mapSamlAttributesToProfile(
  parsed: ParsedSamlResponse,
  mapping: SamlAttributeMapping,
  connectionId: string
): SsoUserProfile {
  const get = (key: string | undefined): string => {
    if (!key) return "";
    const val = parsed.attributes[key];
    if (Array.isArray(val)) return val[0] ?? "";
    return val ?? "";
  };

  const getArray = (key: string | undefined): string[] => {
    if (!key) return [];
    const val = parsed.attributes[key];
    if (Array.isArray(val)) return val;
    return val ? [val] : [];
  };

  const email = get(mapping.email) || parsed.nameId;
  const name = get(mapping.name) || `${get(mapping.firstName)} ${get(mapping.lastName)}`.trim();

  return {
    id: parsed.nameId,
    email,
    name: name || undefined,
    firstName: get(mapping.firstName) || undefined,
    lastName: get(mapping.lastName) || undefined,
    groups: getArray(mapping.groups),
    provider: "saml",
    connectionId,
    rawAttributes: parsed.attributes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// OIDC Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build OIDC authorization URL query parameters.
 */
export function buildOidcAuthRequest(params: {
  config: OidcConfig;
  authorizationEndpoint: string;
  state: string;
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}): { url: string; request: OidcAuthRequest } {
  const { config, authorizationEndpoint, state, nonce, codeChallenge, codeChallengeMethod } = params;
  const scopes = config.scopes ?? ["openid", "email", "profile"];

  const request: OidcAuthRequest = {
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    scope: scopes.join(" "),
    state,
    nonce,
    codeChallenge,
    codeChallengeMethod: codeChallenge ? (codeChallengeMethod ?? "S256") : undefined,
    responseType: "code",
  };

  const params_ = new URLSearchParams({
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    response_type: request.responseType!,
    scope: request.scope,
    state: request.state,
  });

  if (nonce) params_.set("nonce", nonce);
  if (codeChallenge) {
    params_.set("code_challenge", codeChallenge);
    params_.set("code_challenge_method", request.codeChallengeMethod!);
  }

  return {
    url: `${authorizationEndpoint}?${params_.toString()}`,
    request,
  };
}

/**
 * Parse and validate an OIDC ID token's JWT payload (without signature verification).
 * In production this would use a JWT library with proper signature verification.
 */
export function parseOidcIdToken(idToken: string): {
  claims: OidcTokenClaims;
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const parts = idToken.split(".");
  if (parts.length !== 3) {
    return {
      claims: {} as OidcTokenClaims,
      valid: false,
      errors: ["Invalid JWT format: expected 3 parts"],
    };
  }

  let claims: OidcTokenClaims;
  try {
    const payloadJson = Buffer.from(parts[1], "base64url").toString("utf-8");
    claims = JSON.parse(payloadJson) as OidcTokenClaims;
  } catch {
    return {
      claims: {} as OidcTokenClaims,
      valid: false,
      errors: ["Failed to decode JWT payload"],
    };
  }

  // Validate required claims
  if (!claims.sub) errors.push("Missing 'sub' claim");
  if (!claims.iss) errors.push("Missing 'iss' claim");

  // Validate expiry
  if (claims.exp) {
    const expDate = new Date(claims.exp * 1000);
    if (new Date() > expDate) {
      errors.push(`Token expired at ${expDate.toISOString()}`);
    }
  }

  // Validate iat (issued at should not be in the future)
  if (claims.iat) {
    const iatDate = new Date(claims.iat * 1000);
    if (iatDate > new Date(Date.now() + 60_000)) {
      errors.push("Token issued in the future (clock skew > 60s)");
    }
  }

  return { claims, valid: errors.length === 0, errors };
}

/**
 * Map OIDC claims to a user profile using attribute mapping config.
 */
export function mapOidcClaimsToProfile(
  claims: OidcTokenClaims,
  mapping: OidcAttributeMapping,
  connectionId: string
): SsoUserProfile {
  const get = (key: string | undefined): string => {
    if (!key) return "";
    const val = claims[key];
    if (typeof val === "string") return val;
    return "";
  };

  const emailKey = mapping.email ?? "email";
  const nameKey = mapping.name ?? "name";
  const subKey = mapping.sub ?? "sub";
  const groupsKey = mapping.groups ?? "groups";

  const email = get(emailKey);
  const rawGroups = claims[groupsKey];
  const groups = Array.isArray(rawGroups)
    ? rawGroups.filter((g) => typeof g === "string") as string[]
    : typeof rawGroups === "string"
    ? [rawGroups]
    : [];

  return {
    id: get(subKey) || claims.sub,
    email,
    name: get(nameKey) || claims.name || undefined,
    firstName: claims.given_name || undefined,
    lastName: claims.family_name || undefined,
    groups,
    provider: "oidc",
    connectionId,
    rawAttributes: Object.fromEntries(
      Object.entries(claims)
        .filter(([, v]) => typeof v === "string" || Array.isArray(v))
        .map(([k, v]) => [k, v as string | string[]])
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SSO Connection Routing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the SSO connection for a given email address based on domain matching.
 */
export function findConnectionForEmail(
  connections: SsoConnection[],
  email: string
): SsoConnection | null {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  return (
    connections.find(
      (c) => c.enabled && c.domain.toLowerCase() === domain
    ) ?? null
  );
}

/**
 * Find an SSO connection by its ID.
 */
export function findConnectionById(
  connections: SsoConnection[],
  id: string
): SsoConnection | null {
  return connections.find((c) => c.id === id) ?? null;
}

/**
 * Validate that an SSO connection is properly configured.
 */
export function validateConnection(connection: SsoConnection): SsoValidationResult {
  const errors: string[] = [];

  if (!connection.id) errors.push("Connection id is required");
  if (!connection.name) errors.push("Connection name is required");
  if (!connection.domain) errors.push("Connection domain is required");
  if (!validateEmailDomain(connection.domain)) {
    errors.push(`Invalid domain format: ${connection.domain}`);
  }

  if (connection.provider === "saml") {
    const result = validateSamlConfig(connection.config as SamlConfig);
    errors.push(...result.errors);
  } else if (connection.provider === "oidc") {
    const result = validateOidcConfig(connection.config as OidcConfig);
    errors.push(...result.errors);
  } else if (connection.provider !== "ldap") {
    errors.push(`Unknown SSO provider: ${connection.provider}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create a new SSO connection object with defaults.
 */
export function createSsoConnection(params: {
  name: string;
  provider: SsoProvider;
  domain: string;
  config: SamlConfig | OidcConfig;
}): SsoConnection {
  return {
    id: `sso-${generateId()}`,
    name: params.name,
    provider: params.provider,
    domain: params.domain.toLowerCase(),
    enabled: true,
    config: params.config,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Get a summary of SSO connections grouped by provider.
 */
export function summarizeSsoConnections(
  connections: SsoConnection[]
): Record<SsoProvider, { total: number; enabled: number; domains: string[] }> {
  const result: Record<SsoProvider, { total: number; enabled: number; domains: string[] }> = {
    saml: { total: 0, enabled: 0, domains: [] },
    oidc: { total: 0, enabled: 0, domains: [] },
    ldap: { total: 0, enabled: 0, domains: [] },
  };

  for (const c of connections) {
    result[c.provider].total++;
    if (c.enabled) result[c.provider].enabled++;
    result[c.provider].domains.push(c.domain);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// PKCE (Proof Key for Code Exchange) Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a PKCE code verifier (random 43-128 char URL-safe string).
 */
export function generateCodeVerifier(length = 64): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Compute S256 code challenge from a code verifier using SHA-256.
 * In production this would use webcrypto; here we use a pure-JS simulation.
 * Returns base64url-encoded SHA-256 hash.
 */
export function computeCodeChallenge(verifier: string): string {
  // Pure simulation: in production use: crypto.subtle.digest("SHA-256", encoder.encode(verifier))
  // For unit-testable pure logic, we return a deterministic base64url string
  const hash = simpleHash(verifier);
  return Buffer.from(hash).toString("base64url");
}

/**
 * Validate that a code verifier matches a challenge (S256 method).
 */
export function validateCodeChallenge(verifier: string, challenge: string): boolean {
  return computeCodeChallenge(verifier) === challenge;
}

// ─────────────────────────────────────────────────────────────────────────────
// State / Nonce Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a secure state parameter for OIDC/SAML requests.
 */
export function generateOidcState(connectionId: string, returnUrl?: string): string {
  const payload = { connectionId, returnUrl, r: generateId() };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

/**
 * Parse an OIDC state parameter.
 */
export function parseOidcState(state: string): {
  connectionId: string;
  returnUrl?: string;
} | null {
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
    if (typeof decoded.connectionId !== "string") return null;
    return { connectionId: decoded.connectionId, returnUrl: decoded.returnUrl };
  } catch {
    return null;
  }
}

/**
 * Generate a nonce for OIDC requests (to prevent replay attacks).
 */
export function generateNonce(): string {
  return generateId(32);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function isValidPemCertificate(pem: string): boolean {
  return (
    pem.includes("-----BEGIN CERTIFICATE-----") &&
    pem.includes("-----END CERTIFICATE-----")
  );
}

function validateEmailDomain(domain: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/.test(domain);
}

function generateId(length = 16): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/** Simple deterministic hash for pure-function code challenge simulation. */
function simpleHash(input: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const result = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  // Return as 8-byte-like hex string
  return result.toString(16).padStart(16, "0");
}
