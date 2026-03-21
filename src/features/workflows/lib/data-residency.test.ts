import { describe, it, expect } from "vitest";
import {
  isGdprRegion,
  isDataCategoryAllowed,
  isCrossBorderTransferAllowed,
  isRetentionExpired,
  getRetentionExpiryDate,
  getDaysUntilExpiry,
  createDataSubjectRequest,
  isDsrOverdue,
  getDsrDaysRemaining,
  createConsentRecord,
  revokeConsent,
  isConsentValid,
  getValidConsents,
  checkGdprCompliance,
  getEncryptionRequiredCategories,
  getPiiCategories,
  getDefaultRetentionPolicy,
  DATA_INVENTORY,
  REGION_METADATA,
  type DataResidencyPolicy,
  type RetentionPolicy,
  type ConsentRecord,
} from "./data-residency";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const makePolicy = (overrides: Partial<DataResidencyPolicy> = {}): DataResidencyPolicy => ({
  id: "policy-1",
  name: "EU GDPR Policy",
  region: "eu-west-1",
  allowedCategories: [],
  restrictedCategories: [],
  frameworks: ["gdpr"],
  crossBorderTransferAllowed: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeRetentionPolicy = (overrides: Partial<RetentionPolicy> = {}): RetentionPolicy => ({
  id: "rp-1",
  category: "audit_logs",
  retentionDays: 365,
  onExpiry: "delete",
  frameworks: ["gdpr"],
  ...overrides,
});

const makeConsent = (overrides: Partial<ConsentRecord> = {}): ConsentRecord => ({
  id: "consent-1",
  userId: "user-1",
  purpose: "Analytics processing",
  category: "workflow_execution_data",
  framework: "gdpr",
  status: "granted",
  grantedAt: new Date(),
  version: "1.0",
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// DATA_INVENTORY
// ─────────────────────────────────────────────────────────────────────────────

describe("DATA_INVENTORY", () => {
  it("defines all 8 data categories", () => {
    expect(Object.keys(DATA_INVENTORY)).toHaveLength(8);
  });

  it("user_credentials require encryption", () => {
    expect(DATA_INVENTORY.user_credentials.encryptionRequired).toBe(true);
  });

  it("anonymous_data does not contain PII", () => {
    expect(DATA_INVENTORY.anonymous_data.containsPII).toBe(false);
  });

  it("personal_data is classified as restricted", () => {
    expect(DATA_INVENTORY.personal_data.classification).toBe("restricted");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isGdprRegion
// ─────────────────────────────────────────────────────────────────────────────

describe("isGdprRegion", () => {
  it("EU regions are GDPR regions", () => {
    expect(isGdprRegion("eu-west-1")).toBe(true);
    expect(isGdprRegion("eu-central-1")).toBe(true);
  });

  it("Non-EU regions are not GDPR regions", () => {
    expect(isGdprRegion("us-east-1")).toBe(false);
    expect(isGdprRegion("ap-southeast-1")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isDataCategoryAllowed
// ─────────────────────────────────────────────────────────────────────────────

describe("isDataCategoryAllowed", () => {
  it("allows category when allowedCategories is empty (all allowed)", () => {
    const policy = makePolicy({ allowedCategories: [], restrictedCategories: [] });
    expect(isDataCategoryAllowed(policy, "audit_logs")).toBe(true);
  });

  it("allows category when in allowedCategories", () => {
    const policy = makePolicy({ allowedCategories: ["audit_logs"] });
    expect(isDataCategoryAllowed(policy, "audit_logs")).toBe(true);
  });

  it("rejects category not in allowedCategories", () => {
    const policy = makePolicy({ allowedCategories: ["audit_logs"] });
    expect(isDataCategoryAllowed(policy, "ai_prompts")).toBe(false);
  });

  it("rejects restricted category", () => {
    const policy = makePolicy({ restrictedCategories: ["webhook_payloads"] });
    expect(isDataCategoryAllowed(policy, "webhook_payloads")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isCrossBorderTransferAllowed
// ─────────────────────────────────────────────────────────────────────────────

describe("isCrossBorderTransferAllowed", () => {
  it("returns false when crossBorderTransferAllowed is false", () => {
    const policy = makePolicy({ crossBorderTransferAllowed: false });
    expect(isCrossBorderTransferAllowed(policy, "us-east-1")).toBe(false);
  });

  it("returns true when allowed and no country restrictions", () => {
    const policy = makePolicy({ crossBorderTransferAllowed: true });
    expect(isCrossBorderTransferAllowed(policy, "us-east-1")).toBe(true);
  });

  it("allows approved transfer country", () => {
    const policy = makePolicy({
      crossBorderTransferAllowed: true,
      approvedTransferCountries: ["US", "CA"],
    });
    expect(isCrossBorderTransferAllowed(policy, "us-east-1")).toBe(true);
    expect(isCrossBorderTransferAllowed(policy, "ca-central-1")).toBe(true);
  });

  it("rejects non-approved transfer country", () => {
    const policy = makePolicy({
      crossBorderTransferAllowed: true,
      approvedTransferCountries: ["CA"],
    });
    expect(isCrossBorderTransferAllowed(policy, "us-east-1")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Retention Policy
// ─────────────────────────────────────────────────────────────────────────────

describe("isRetentionExpired", () => {
  it("returns false for indefinite retention (0 days)", () => {
    const policy = makeRetentionPolicy({ retentionDays: 0 });
    expect(isRetentionExpired(policy, new Date("2020-01-01"))).toBe(false);
  });

  it("returns false for recent data", () => {
    const policy = makeRetentionPolicy({ retentionDays: 30 });
    expect(isRetentionExpired(policy, new Date())).toBe(false);
  });

  it("returns true for data past retention period", () => {
    const policy = makeRetentionPolicy({ retentionDays: 30 });
    const createdAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    expect(isRetentionExpired(policy, createdAt)).toBe(true);
  });
});

describe("getRetentionExpiryDate", () => {
  it("returns null for indefinite retention", () => {
    expect(getRetentionExpiryDate(makeRetentionPolicy({ retentionDays: 0 }), new Date())).toBeNull();
  });

  it("calculates expiry date correctly", () => {
    const createdAt = new Date("2023-01-01");
    const expiry = getRetentionExpiryDate(makeRetentionPolicy({ retentionDays: 365 }), createdAt);
    expect(expiry?.getFullYear()).toBe(2024);
  });
});

describe("getDaysUntilExpiry", () => {
  it("returns null for indefinite retention", () => {
    expect(getDaysUntilExpiry(makeRetentionPolicy({ retentionDays: 0 }), new Date())).toBeNull();
  });

  it("returns positive days for future expiry", () => {
    const policy = makeRetentionPolicy({ retentionDays: 30 });
    const createdAt = new Date();
    const days = getDaysUntilExpiry(policy, createdAt);
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(30);
  });

  it("returns negative days for expired data", () => {
    const policy = makeRetentionPolicy({ retentionDays: 30 });
    const createdAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const days = getDaysUntilExpiry(policy, createdAt);
    expect(days).toBeLessThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Data Subject Requests
// ─────────────────────────────────────────────────────────────────────────────

describe("createDataSubjectRequest", () => {
  it("creates a DSR with 30-day due date", () => {
    const dsr = createDataSubjectRequest({ type: "deletion", subjectId: "user@example.com" });
    expect(dsr.id).toBeTruthy();
    expect(dsr.status).toBe("pending");
    expect(dsr.type).toBe("deletion");
    const daysUntilDue = Math.round(
      (dsr.dueAt.getTime() - dsr.requestedAt.getTime()) / (24 * 60 * 60 * 1000)
    );
    expect(daysUntilDue).toBe(30);
  });
});

describe("isDsrOverdue", () => {
  it("returns true for overdue pending DSR", () => {
    const dsr = createDataSubjectRequest({ type: "access", subjectId: "u1" });
    const futureNow = new Date(dsr.dueAt.getTime() + 1000);
    expect(isDsrOverdue(dsr, futureNow)).toBe(true);
  });

  it("returns false for completed DSR", () => {
    const dsr = { ...createDataSubjectRequest({ type: "access", subjectId: "u1" }), status: "completed" as const };
    const futureNow = new Date(dsr.dueAt.getTime() + 1000);
    expect(isDsrOverdue(dsr, futureNow)).toBe(false);
  });

  it("returns false for DSR not yet due", () => {
    const dsr = createDataSubjectRequest({ type: "access", subjectId: "u1" });
    expect(isDsrOverdue(dsr)).toBe(false);
  });
});

describe("getDsrDaysRemaining", () => {
  it("returns positive days for pending DSR", () => {
    const dsr = createDataSubjectRequest({ type: "access", subjectId: "u1" });
    expect(getDsrDaysRemaining(dsr)).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Consent
// ─────────────────────────────────────────────────────────────────────────────

describe("createConsentRecord", () => {
  it("creates a granted consent record", () => {
    const record = createConsentRecord({
      userId: "u1",
      purpose: "AI processing",
      category: "ai_prompts",
      framework: "gdpr",
      status: "granted",
      version: "1.0",
    });
    expect(record.id).toBeTruthy();
    expect(record.status).toBe("granted");
    expect(record.grantedAt).toBeInstanceOf(Date);
  });

  it("sets expiry when expiresInDays provided", () => {
    const record = createConsentRecord({
      userId: "u1",
      purpose: "Analytics",
      category: "workflow_execution_data",
      framework: "gdpr",
      status: "granted",
      version: "1.0",
      expiresInDays: 365,
    });
    expect(record.expiresAt).toBeInstanceOf(Date);
  });
});

describe("revokeConsent", () => {
  it("revokes a consent record", () => {
    const record = makeConsent();
    const revoked = revokeConsent(record);
    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedAt).toBeInstanceOf(Date);
  });
});

describe("isConsentValid", () => {
  it("returns true for granted non-expired consent", () => {
    expect(isConsentValid(makeConsent())).toBe(true);
  });

  it("returns false for revoked consent", () => {
    expect(isConsentValid(makeConsent({ status: "revoked" }))).toBe(false);
  });

  it("returns false for expired consent", () => {
    const expired = makeConsent({
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(isConsentValid(expired)).toBe(false);
  });
});

describe("getValidConsents", () => {
  it("returns only valid consents for user", () => {
    const consents = [
      makeConsent({ userId: "u1", id: "c1" }),
      makeConsent({ userId: "u1", status: "revoked", id: "c2" }),
      makeConsent({ userId: "u2", id: "c3" }),
    ];
    const valid = getValidConsents(consents, "u1");
    expect(valid).toHaveLength(1);
    expect(valid[0].id).toBe("c1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkGdprCompliance
// ─────────────────────────────────────────────────────────────────────────────

describe("checkGdprCompliance", () => {
  it("passes for EU region with consent for PII", () => {
    const policy = makePolicy({ region: "eu-west-1" });
    const consents = [makeConsent({ category: "workflow_execution_data" })];
    const result = checkGdprCompliance(policy, consents, ["workflow_execution_data"]);
    expect(result.compliant).toBe(true);
    expect(result.passed.some((p) => p.includes("EU"))).toBe(true);
  });

  it("fails for non-EU region without transfer mechanism", () => {
    const policy = makePolicy({ region: "us-east-1", crossBorderTransferAllowed: false });
    const result = checkGdprCompliance(policy, [], []);
    expect(result.compliant).toBe(false);
    expect(result.failed.some((f) => f.includes("outside EU"))).toBe(true);
  });

  it("fails when PII category has no consent", () => {
    const policy = makePolicy();
    const result = checkGdprCompliance(policy, [], ["workflow_execution_data"]);
    expect(result.compliant).toBe(false);
    expect(result.failed.some((f) => f.includes("consent"))).toBe(true);
  });

  it("fails for restricted category", () => {
    const policy = makePolicy({ restrictedCategories: ["webhook_payloads"] });
    const result = checkGdprCompliance(policy, [], ["webhook_payloads"]);
    expect(result.compliant).toBe(false);
    expect(result.failed.some((f) => f.includes("restricted"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getEncryptionRequiredCategories / getPiiCategories
// ─────────────────────────────────────────────────────────────────────────────

describe("getEncryptionRequiredCategories", () => {
  it("returns categories requiring encryption for GDPR", () => {
    const categories = getEncryptionRequiredCategories("gdpr");
    expect(categories).toContain("user_credentials");
    expect(categories).toContain("personal_data");
    expect(categories).toContain("workflow_execution_data");
  });
});

describe("getPiiCategories", () => {
  it("returns all PII categories", () => {
    const pii = getPiiCategories();
    expect(pii).toContain("personal_data");
    expect(pii).toContain("workflow_execution_data");
    expect(pii).not.toContain("anonymous_data");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDefaultRetentionPolicy
// ─────────────────────────────────────────────────────────────────────────────

describe("getDefaultRetentionPolicy", () => {
  it("returns correct retention for audit_logs", () => {
    const policy = getDefaultRetentionPolicy("audit_logs");
    expect(policy.retentionDays).toBe(365);
    expect(policy.onExpiry).toBe("delete");
    expect(policy.frameworks).toContain("gdpr");
  });

  it("returns indefinite for user_credentials", () => {
    const policy = getDefaultRetentionPolicy("user_credentials");
    expect(policy.retentionDays).toBe(0);
    expect(policy.onExpiry).toBe("archive");
  });
});
