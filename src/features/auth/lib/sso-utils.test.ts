import { describe, it, expect } from "vitest";
import {
  validateSamlConfig,
  validateOidcConfig,
  buildSamlAuthnRequest,
  parseSamlResponse,
  mapSamlAttributesToProfile,
  buildOidcAuthRequest,
  parseOidcIdToken,
  mapOidcClaimsToProfile,
  findConnectionForEmail,
  findConnectionById,
  validateConnection,
  createSsoConnection,
  summarizeSsoConnections,
  generateCodeVerifier,
  computeCodeChallenge,
  validateCodeChallenge,
  generateOidcState,
  parseOidcState,
  generateNonce,
  type SamlConfig,
  type OidcConfig,
  type SsoConnection,
} from "./sso-utils";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const validSamlConfig: SamlConfig = {
  entityId: "https://powernode.example.com/saml/metadata",
  assertionConsumerUrl: "https://powernode.example.com/saml/callback",
  idpEntityId: "https://idp.example.com",
  idpSsoUrl: "https://idp.example.com/sso",
  idpCertificate: "-----BEGIN CERTIFICATE-----\nMIIBkTCB+wIJ...\n-----END CERTIFICATE-----",
  attributeMapping: {
    email: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    name: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
    groups: "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups",
  },
};

const validOidcConfig: OidcConfig = {
  clientId: "my-client-id",
  clientSecret: "my-client-secret",
  discoveryUrl: "https://accounts.google.com/.well-known/openid-configuration",
  redirectUri: "https://powernode.example.com/auth/callback",
  scopes: ["openid", "email", "profile"],
};

const makeConnection = (overrides: Partial<SsoConnection> = {}): SsoConnection => ({
  id: "conn-1",
  name: "Acme Corp SAML",
  provider: "saml",
  domain: "acme.com",
  enabled: true,
  config: validSamlConfig,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// validateSamlConfig
// ─────────────────────────────────────────────────────────────────────────────

describe("validateSamlConfig", () => {
  it("passes valid config", () => {
    const result = validateSamlConfig(validSamlConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when entityId is missing", () => {
    const result = validateSamlConfig({ ...validSamlConfig, entityId: "" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("entityId is required");
  });

  it("fails when assertionConsumerUrl is invalid", () => {
    const result = validateSamlConfig({ ...validSamlConfig, assertionConsumerUrl: "not-a-url" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("assertionConsumerUrl"))).toBe(true);
  });

  it("fails when idpCertificate is not PEM", () => {
    const result = validateSamlConfig({ ...validSamlConfig, idpCertificate: "rawcertdata" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("idpCertificate"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateOidcConfig
// ─────────────────────────────────────────────────────────────────────────────

describe("validateOidcConfig", () => {
  it("passes valid config", () => {
    const result = validateOidcConfig(validOidcConfig);
    expect(result.valid).toBe(true);
  });

  it("fails when clientId is missing", () => {
    const result = validateOidcConfig({ ...validOidcConfig, clientId: "" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("clientId is required");
  });

  it("fails when discoveryUrl is invalid", () => {
    const result = validateOidcConfig({ ...validOidcConfig, discoveryUrl: "not-a-url" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("discoveryUrl"))).toBe(true);
  });

  it("fails when redirectUri is missing", () => {
    const result = validateOidcConfig({ ...validOidcConfig, redirectUri: "" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("redirectUri is required");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSamlAuthnRequest
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSamlAuthnRequest", () => {
  it("builds a valid AuthnRequest XML", () => {
    const { xml, requestId } = buildSamlAuthnRequest({ config: validSamlConfig });
    expect(xml).toContain("AuthnRequest");
    expect(xml).toContain(validSamlConfig.entityId);
    expect(xml).toContain(validSamlConfig.assertionConsumerUrl);
    expect(xml).toContain(validSamlConfig.idpSsoUrl);
    expect(requestId).toBeTruthy();
    expect(requestId.startsWith("_")).toBe(true);
  });

  it("uses provided requestId", () => {
    const { requestId } = buildSamlAuthnRequest({
      config: validSamlConfig,
      requestId: "_custom-id-123",
    });
    expect(requestId).toBe("_custom-id-123");
  });

  it("uses HTTP-Redirect binding", () => {
    const { xml } = buildSamlAuthnRequest({
      config: validSamlConfig,
      binding: "HTTP-Redirect",
    });
    expect(xml).toContain("HTTP-Redirect");
  });

  it("includes NameIDPolicy", () => {
    const { xml } = buildSamlAuthnRequest({ config: validSamlConfig });
    expect(xml).toContain("NameIDPolicy");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseSamlResponse
// ─────────────────────────────────────────────────────────────────────────────

const makeSamlXml = (options: {
  nameId?: string;
  status?: string;
  notOnOrAfter?: string;
  attributes?: Record<string, string>;
} = {}): string => {
  const {
    nameId = "user@acme.com",
    status = "urn:oasis:names:tc:SAML:2.0:status:Success",
    notOnOrAfter = new Date(Date.now() + 3600_000).toISOString(),
    attributes = {},
  } = options;

  const attrXml = Object.entries(attributes)
    .map(
      ([name, value]) =>
        `<saml:Attribute Name="${name}"><saml:AttributeValue>${value}</saml:AttributeValue></saml:Attribute>`
    )
    .join("\n");

  return `<?xml version="1.0"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
  <saml:Issuer>https://idp.example.com</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="${status}"/>
  </samlp:Status>
  <saml:Assertion>
    <saml:Conditions NotBefore="2020-01-01T00:00:00Z" NotOnOrAfter="${notOnOrAfter}"/>
    <saml:AuthnStatement SessionIndex="_session-123"/>
    <saml:Subject>
      <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${nameId}</saml:NameID>
    </saml:Subject>
    <saml:AttributeStatement>
      ${attrXml}
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`;
};

describe("parseSamlResponse", () => {
  it("parses a valid SAML response", () => {
    const xml = makeSamlXml({
      attributes: {
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress": "user@acme.com",
      },
    });
    const b64 = Buffer.from(xml).toString("base64");
    const parsed = parseSamlResponse(b64);
    expect(parsed.nameId).toBe("user@acme.com");
    expect(parsed.issuer).toBe("https://idp.example.com");
    expect(parsed.isValid).toBe(true);
    expect(parsed.validationErrors).toHaveLength(0);
  });

  it("extracts attributes", () => {
    const xml = makeSamlXml({
      attributes: {
        email: "alice@acme.com",
        role: "admin",
      },
    });
    const b64 = Buffer.from(xml).toString("base64");
    const parsed = parseSamlResponse(b64);
    expect(parsed.attributes["email"]).toBe("alice@acme.com");
    expect(parsed.attributes["role"]).toBe("admin");
  });

  it("marks expired assertion as invalid", () => {
    const xml = makeSamlXml({
      notOnOrAfter: new Date(Date.now() - 1000).toISOString(),
    });
    const b64 = Buffer.from(xml).toString("base64");
    const parsed = parseSamlResponse(b64);
    expect(parsed.isValid).toBe(false);
    expect(parsed.validationErrors.some((e) => e.includes("expired"))).toBe(true);
  });

  it("returns error on invalid base64", () => {
    const parsed = parseSamlResponse("!!not-valid-base64!!");
    expect(parsed.isValid).toBe(false);
  });

  it("returns error on failed status", () => {
    const xml = makeSamlXml({
      status: "urn:oasis:names:tc:SAML:2.0:status:Responder",
    });
    const b64 = Buffer.from(xml).toString("base64");
    const parsed = parseSamlResponse(b64);
    expect(parsed.isValid).toBe(false);
    expect(parsed.validationErrors.some((e) => e.includes("status"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapSamlAttributesToProfile
// ─────────────────────────────────────────────────────────────────────────────

describe("mapSamlAttributesToProfile", () => {
  it("maps attributes to profile", () => {
    const parsed = {
      nameId: "user@acme.com",
      nameIdFormat: "emailAddress",
      attributes: {
        "email": "user@acme.com",
        "firstName": "Alice",
        "lastName": "Smith",
        "groups": ["admins", "devs"],
      },
      issuer: "https://idp.example.com",
      isValid: true,
      validationErrors: [],
    };
    const mapping = { email: "email", firstName: "firstName", lastName: "lastName", groups: "groups" };
    const profile = mapSamlAttributesToProfile(parsed, mapping, "conn-1");
    expect(profile.email).toBe("user@acme.com");
    expect(profile.firstName).toBe("Alice");
    expect(profile.lastName).toBe("Smith");
    expect(profile.groups).toEqual(["admins", "devs"]);
    expect(profile.provider).toBe("saml");
    expect(profile.connectionId).toBe("conn-1");
  });

  it("uses nameId as email fallback", () => {
    const parsed = {
      nameId: "fallback@acme.com",
      nameIdFormat: "",
      attributes: {},
      issuer: "",
      isValid: true,
      validationErrors: [],
    };
    const profile = mapSamlAttributesToProfile(parsed, {}, "conn-1");
    expect(profile.email).toBe("fallback@acme.com");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildOidcAuthRequest
// ─────────────────────────────────────────────────────────────────────────────

describe("buildOidcAuthRequest", () => {
  it("builds a valid auth URL", () => {
    const { url, request } = buildOidcAuthRequest({
      config: validOidcConfig,
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      state: "test-state-123",
    });
    expect(url).toContain("client_id=my-client-id");
    expect(url).toContain("response_type=code");
    expect(url).toContain("state=test-state-123");
    expect(url).toContain("scope=openid");
    expect(request.clientId).toBe("my-client-id");
  });

  it("includes PKCE parameters when codeChallenge provided", () => {
    const { url } = buildOidcAuthRequest({
      config: validOidcConfig,
      authorizationEndpoint: "https://auth.example.com/authorize",
      state: "s",
      codeChallenge: "abc123",
    });
    expect(url).toContain("code_challenge=abc123");
    expect(url).toContain("code_challenge_method=S256");
  });

  it("includes nonce", () => {
    const { url } = buildOidcAuthRequest({
      config: validOidcConfig,
      authorizationEndpoint: "https://auth.example.com/authorize",
      state: "s",
      nonce: "mynonce",
    });
    expect(url).toContain("nonce=mynonce");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseOidcIdToken
// ─────────────────────────────────────────────────────────────────────────────

const makeJwt = (payload: object): string => {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.fakesignature`;
};

describe("parseOidcIdToken", () => {
  it("parses valid JWT claims", () => {
    const token = makeJwt({
      sub: "user-123",
      email: "alice@example.com",
      name: "Alice",
      iss: "https://accounts.google.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    });
    const { claims, valid } = parseOidcIdToken(token);
    expect(valid).toBe(true);
    expect(claims.sub).toBe("user-123");
    expect(claims.email).toBe("alice@example.com");
  });

  it("detects expired tokens", () => {
    const token = makeJwt({
      sub: "user-123",
      iss: "https://issuer.example.com",
      exp: Math.floor(Date.now() / 1000) - 3600,
      iat: Math.floor(Date.now() / 1000) - 7200,
    });
    const { valid, errors } = parseOidcIdToken(token);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("expired"))).toBe(true);
  });

  it("rejects invalid JWT format", () => {
    const { valid, errors } = parseOidcIdToken("not.a.valid.jwt.format.too.many.parts");
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("3 parts"))).toBe(true);
  });

  it("requires sub claim", () => {
    const token = makeJwt({ iss: "https://issuer.example.com" });
    const { valid, errors } = parseOidcIdToken(token);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("sub"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapOidcClaimsToProfile
// ─────────────────────────────────────────────────────────────────────────────

describe("mapOidcClaimsToProfile", () => {
  it("maps OIDC claims to profile", () => {
    const claims = {
      sub: "user-123",
      email: "alice@example.com",
      name: "Alice Smith",
      given_name: "Alice",
      family_name: "Smith",
      groups: ["admins"],
      iss: "https://issuer.example.com",
    };
    const profile = mapOidcClaimsToProfile(claims, {}, "conn-oidc-1");
    expect(profile.id).toBe("user-123");
    expect(profile.email).toBe("alice@example.com");
    expect(profile.name).toBe("Alice Smith");
    expect(profile.groups).toEqual(["admins"]);
    expect(profile.provider).toBe("oidc");
  });

  it("handles missing optional fields gracefully", () => {
    const claims = { sub: "u1", iss: "https://i.example.com" };
    const profile = mapOidcClaimsToProfile(claims, {}, "conn-1");
    expect(profile.id).toBe("u1");
    expect(profile.email).toBe("");
    expect(profile.groups).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findConnectionForEmail
// ─────────────────────────────────────────────────────────────────────────────

describe("findConnectionForEmail", () => {
  const connections = [
    makeConnection({ id: "c1", domain: "acme.com" }),
    makeConnection({ id: "c2", domain: "corp.com" }),
    makeConnection({ id: "c3", domain: "disabled.com", enabled: false }),
  ];

  it("finds connection by email domain", () => {
    const conn = findConnectionForEmail(connections, "alice@acme.com");
    expect(conn?.id).toBe("c1");
  });

  it("returns null for unknown domain", () => {
    expect(findConnectionForEmail(connections, "alice@unknown.com")).toBeNull();
  });

  it("ignores disabled connections", () => {
    expect(findConnectionForEmail(connections, "alice@disabled.com")).toBeNull();
  });

  it("returns null for invalid email", () => {
    expect(findConnectionForEmail(connections, "notanemail")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findConnectionById
// ─────────────────────────────────────────────────────────────────────────────

describe("findConnectionById", () => {
  const connections = [makeConnection({ id: "c1" }), makeConnection({ id: "c2" })];

  it("finds connection by id", () => {
    expect(findConnectionById(connections, "c1")?.id).toBe("c1");
  });

  it("returns null for unknown id", () => {
    expect(findConnectionById(connections, "c99")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateConnection
// ─────────────────────────────────────────────────────────────────────────────

describe("validateConnection", () => {
  it("validates a valid SAML connection", () => {
    const result = validateConnection(makeConnection());
    expect(result.valid).toBe(true);
  });

  it("validates a valid OIDC connection", () => {
    const conn = makeConnection({ provider: "oidc", config: validOidcConfig });
    const result = validateConnection(conn);
    expect(result.valid).toBe(true);
  });

  it("fails when domain is missing", () => {
    const result = validateConnection(makeConnection({ domain: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("domain"))).toBe(true);
  });

  it("fails when domain format is invalid", () => {
    const result = validateConnection(makeConnection({ domain: "not-a-domain" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("domain"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createSsoConnection
// ─────────────────────────────────────────────────────────────────────────────

describe("createSsoConnection", () => {
  it("creates a connection with defaults", () => {
    const conn = createSsoConnection({
      name: "Test SAML",
      provider: "saml",
      domain: "example.com",
      config: validSamlConfig,
    });
    expect(conn.id).toBeTruthy();
    expect(conn.enabled).toBe(true);
    expect(conn.domain).toBe("example.com");
    expect(conn.createdAt).toBeInstanceOf(Date);
  });

  it("lowercases domain", () => {
    const conn = createSsoConnection({
      name: "Test",
      provider: "oidc",
      domain: "UPPERCASE.COM",
      config: validOidcConfig,
    });
    expect(conn.domain).toBe("uppercase.com");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summarizeSsoConnections
// ─────────────────────────────────────────────────────────────────────────────

describe("summarizeSsoConnections", () => {
  it("groups connections by provider", () => {
    const connections = [
      makeConnection({ id: "s1", provider: "saml", domain: "a.com" }),
      makeConnection({ id: "s2", provider: "saml", domain: "b.com" }),
      makeConnection({ id: "o1", provider: "oidc", domain: "c.com", config: validOidcConfig }),
      makeConnection({ id: "s3", provider: "saml", domain: "d.com", enabled: false }),
    ];
    const summary = summarizeSsoConnections(connections);
    expect(summary.saml.total).toBe(3);
    expect(summary.saml.enabled).toBe(2);
    expect(summary.oidc.total).toBe(1);
    expect(summary.oidc.enabled).toBe(1);
    expect(summary.saml.domains).toContain("a.com");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PKCE
// ─────────────────────────────────────────────────────────────────────────────

describe("generateCodeVerifier", () => {
  it("generates a string of default length 64", () => {
    const v = generateCodeVerifier();
    expect(v).toHaveLength(64);
  });

  it("generates a string of custom length", () => {
    expect(generateCodeVerifier(128)).toHaveLength(128);
  });

  it("generates unique values", () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });
});

describe("computeCodeChallenge", () => {
  it("returns a non-empty string", () => {
    const challenge = computeCodeChallenge("my-verifier-value");
    expect(challenge.length).toBeGreaterThan(0);
  });

  it("is deterministic for same input", () => {
    const v = "test-verifier";
    expect(computeCodeChallenge(v)).toBe(computeCodeChallenge(v));
  });

  it("produces different output for different inputs", () => {
    expect(computeCodeChallenge("verifier-1")).not.toBe(computeCodeChallenge("verifier-2"));
  });
});

describe("validateCodeChallenge", () => {
  it("validates correctly", () => {
    const verifier = generateCodeVerifier();
    const challenge = computeCodeChallenge(verifier);
    expect(validateCodeChallenge(verifier, challenge)).toBe(true);
  });

  it("rejects wrong verifier", () => {
    const challenge = computeCodeChallenge("correct-verifier");
    expect(validateCodeChallenge("wrong-verifier", challenge)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// State / Nonce
// ─────────────────────────────────────────────────────────────────────────────

describe("generateOidcState / parseOidcState", () => {
  it("round-trips state correctly", () => {
    const state = generateOidcState("conn-123", "/dashboard");
    const parsed = parseOidcState(state);
    expect(parsed?.connectionId).toBe("conn-123");
    expect(parsed?.returnUrl).toBe("/dashboard");
  });

  it("handles state without returnUrl", () => {
    const state = generateOidcState("conn-abc");
    const parsed = parseOidcState(state);
    expect(parsed?.connectionId).toBe("conn-abc");
    expect(parsed?.returnUrl).toBeUndefined();
  });

  it("returns null for invalid state", () => {
    expect(parseOidcState("not-valid-base64url!!!")).toBeNull();
  });
});

describe("generateNonce", () => {
  it("generates a non-empty string", () => {
    const nonce = generateNonce();
    expect(nonce.length).toBeGreaterThan(0);
  });

  it("generates unique nonces", () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});
