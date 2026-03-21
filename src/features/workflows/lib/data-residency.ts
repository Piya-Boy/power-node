/**
 * Phase 43 — Data Residency & Compliance
 * Pure utilities for managing data residency requirements, GDPR/CCPA compliance,
 * data classification, and retention policies.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DataRegion =
  | "us-east-1"
  | "us-west-2"
  | "eu-west-1"
  | "eu-central-1"
  | "ap-southeast-1"
  | "ap-northeast-1"
  | "ca-central-1"
  | "sa-east-1";

export type DataClassification = "public" | "internal" | "confidential" | "restricted";

export type ComplianceFramework = "gdpr" | "ccpa" | "hipaa" | "soc2" | "pci_dss" | "iso27001";

export type RetentionAction = "delete" | "archive" | "anonymize" | "notify";

export type ConsentStatus = "granted" | "denied" | "pending" | "revoked";

export type DataCategory =
  | "workflow_execution_data"
  | "user_credentials"
  | "audit_logs"
  | "webhook_payloads"
  | "ai_prompts"
  | "integration_tokens"
  | "personal_data"
  | "anonymous_data";

export interface DataResidencyPolicy {
  id: string;
  name: string;
  region: DataRegion;
  allowedCategories: DataCategory[];
  restrictedCategories: DataCategory[];
  frameworks: ComplianceFramework[];
  crossBorderTransferAllowed: boolean;
  approvedTransferCountries?: string[];  // ISO 3166-1 alpha-2 codes
  createdAt: Date;
  updatedAt: Date;
}

export interface RetentionPolicy {
  id: string;
  category: DataCategory;
  retentionDays: number;         // 0 = indefinite
  onExpiry: RetentionAction;
  frameworks: ComplianceFramework[];
  legalHoldAllowed?: boolean;
}

export interface DataSubjectRequest {
  id: string;
  type: "access" | "deletion" | "portability" | "rectification" | "restriction";
  subjectId: string;             // userId or email
  requestedAt: Date;
  dueAt: Date;                   // GDPR: 30 days
  status: "pending" | "processing" | "completed" | "rejected";
  completedAt?: Date;
  reason?: string;
  categories?: DataCategory[];
}

export interface ConsentRecord {
  id: string;
  userId: string;
  purpose: string;               // what the data is used for
  category: DataCategory;
  framework: ComplianceFramework;
  status: ConsentStatus;
  grantedAt?: Date;
  revokedAt?: Date;
  expiresAt?: Date;
  version: string;               // consent text version
  ipAddress?: string;
}

export interface DataInventoryItem {
  category: DataCategory;
  classification: DataClassification;
  description: string;
  containsPII: boolean;
  retentionDays: number;
  encryptionRequired: boolean;
  frameworks: ComplianceFramework[];
}

export interface ComplianceCheckResult {
  compliant: boolean;
  framework: ComplianceFramework;
  passed: string[];
  failed: string[];
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Inventory
// ─────────────────────────────────────────────────────────────────────────────

export const DATA_INVENTORY: Record<DataCategory, DataInventoryItem> = {
  workflow_execution_data: {
    category: "workflow_execution_data",
    classification: "confidential",
    description: "Input/output data from workflow node executions",
    containsPII: true,
    retentionDays: 90,
    encryptionRequired: true,
    frameworks: ["gdpr", "ccpa", "soc2"],
  },
  user_credentials: {
    category: "user_credentials",
    classification: "restricted",
    description: "Encrypted API keys and integration credentials",
    containsPII: false,
    retentionDays: 0, // indefinite until deleted
    encryptionRequired: true,
    frameworks: ["gdpr", "soc2", "pci_dss"],
  },
  audit_logs: {
    category: "audit_logs",
    classification: "confidential",
    description: "User action audit trail",
    containsPII: true,
    retentionDays: 365,
    encryptionRequired: false,
    frameworks: ["gdpr", "soc2", "iso27001"],
  },
  webhook_payloads: {
    category: "webhook_payloads",
    classification: "confidential",
    description: "Raw webhook payloads from external services",
    containsPII: true,
    retentionDays: 30,
    encryptionRequired: true,
    frameworks: ["gdpr", "ccpa"],
  },
  ai_prompts: {
    category: "ai_prompts",
    classification: "confidential",
    description: "User prompts sent to AI providers",
    containsPII: true,
    retentionDays: 30,
    encryptionRequired: true,
    frameworks: ["gdpr", "ccpa"],
  },
  integration_tokens: {
    category: "integration_tokens",
    classification: "restricted",
    description: "OAuth tokens and API keys for third-party integrations",
    containsPII: false,
    retentionDays: 0,
    encryptionRequired: true,
    frameworks: ["soc2", "pci_dss"],
  },
  personal_data: {
    category: "personal_data",
    classification: "restricted",
    description: "Names, emails, and other personal identifiable information",
    containsPII: true,
    retentionDays: 1825, // 5 years
    encryptionRequired: true,
    frameworks: ["gdpr", "ccpa", "hipaa"],
  },
  anonymous_data: {
    category: "anonymous_data",
    classification: "internal",
    description: "Anonymized/aggregated analytics data",
    containsPII: false,
    retentionDays: 0,
    encryptionRequired: false,
    frameworks: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Data Residency
// ─────────────────────────────────────────────────────────────────────────────

export const REGION_METADATA: Record<DataRegion, { country: string; continent: string; gdprRegion: boolean }> = {
  "us-east-1": { country: "US", continent: "North America", gdprRegion: false },
  "us-west-2": { country: "US", continent: "North America", gdprRegion: false },
  "eu-west-1": { country: "IE", continent: "Europe", gdprRegion: true },
  "eu-central-1": { country: "DE", continent: "Europe", gdprRegion: true },
  "ap-southeast-1": { country: "SG", continent: "Asia", gdprRegion: false },
  "ap-northeast-1": { country: "JP", continent: "Asia", gdprRegion: false },
  "ca-central-1": { country: "CA", continent: "North America", gdprRegion: false },
  "sa-east-1": { country: "BR", continent: "South America", gdprRegion: false },
};

/**
 * Check if a region is GDPR-compliant (data stays within EU).
 */
export function isGdprRegion(region: DataRegion): boolean {
  return REGION_METADATA[region]?.gdprRegion ?? false;
}

/**
 * Validate whether a data residency policy allows storing a category of data.
 */
export function isDataCategoryAllowed(
  policy: DataResidencyPolicy,
  category: DataCategory
): boolean {
  if (policy.restrictedCategories.includes(category)) return false;
  if (policy.allowedCategories.length === 0) return true; // all allowed
  return policy.allowedCategories.includes(category);
}

/**
 * Check if cross-border transfer is allowed between two regions.
 */
export function isCrossBorderTransferAllowed(
  policy: DataResidencyPolicy,
  targetRegion: DataRegion
): boolean {
  if (!policy.crossBorderTransferAllowed) return false;
  if (!policy.approvedTransferCountries) return true;
  const targetCountry = REGION_METADATA[targetRegion]?.country;
  return policy.approvedTransferCountries.includes(targetCountry);
}

// ─────────────────────────────────────────────────────────────────────────────
// Retention Policy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a data record has exceeded its retention period.
 */
export function isRetentionExpired(
  policy: RetentionPolicy,
  createdAt: Date,
  now = new Date()
): boolean {
  if (policy.retentionDays === 0) return false; // indefinite
  const expiryMs = createdAt.getTime() + policy.retentionDays * 24 * 60 * 60 * 1000;
  return now.getTime() >= expiryMs;
}

/**
 * Calculate the expiry date for a retention policy.
 */
export function getRetentionExpiryDate(
  policy: RetentionPolicy,
  createdAt: Date
): Date | null {
  if (policy.retentionDays === 0) return null;
  return new Date(createdAt.getTime() + policy.retentionDays * 24 * 60 * 60 * 1000);
}

/**
 * Get days remaining until retention expiry (negative = expired).
 */
export function getDaysUntilExpiry(
  policy: RetentionPolicy,
  createdAt: Date,
  now = new Date()
): number | null {
  if (policy.retentionDays === 0) return null;
  const expiryDate = getRetentionExpiryDate(policy, createdAt)!;
  const msRemaining = expiryDate.getTime() - now.getTime();
  return Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Subject Requests (DSR)
// ─────────────────────────────────────────────────────────────────────────────

const DSR_DUE_DAYS: Record<DataSubjectRequest["type"], number> = {
  access: 30,
  deletion: 30,
  portability: 30,
  rectification: 30,
  restriction: 30,
};

/**
 * Create a new data subject request.
 */
export function createDataSubjectRequest(params: {
  type: DataSubjectRequest["type"];
  subjectId: string;
  categories?: DataCategory[];
  reason?: string;
}): DataSubjectRequest {
  const now = new Date();
  const dueDays = DSR_DUE_DAYS[params.type];
  return {
    id: `dsr-${generateId()}`,
    type: params.type,
    subjectId: params.subjectId,
    requestedAt: now,
    dueAt: new Date(now.getTime() + dueDays * 24 * 60 * 60 * 1000),
    status: "pending",
    categories: params.categories,
    reason: params.reason,
  };
}

/**
 * Check if a DSR is overdue.
 */
export function isDsrOverdue(request: DataSubjectRequest, now = new Date()): boolean {
  return request.status !== "completed" && request.status !== "rejected" && now > request.dueAt;
}

/**
 * Get days remaining to respond to a DSR.
 */
export function getDsrDaysRemaining(request: DataSubjectRequest, now = new Date()): number {
  const ms = request.dueAt.getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

// ─────────────────────────────────────────────────────────────────────────────
// Consent Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new consent record.
 */
export function createConsentRecord(params: {
  userId: string;
  purpose: string;
  category: DataCategory;
  framework: ComplianceFramework;
  status: ConsentStatus;
  version: string;
  ipAddress?: string;
  expiresInDays?: number;
}): ConsentRecord {
  const now = new Date();
  return {
    id: `consent-${generateId()}`,
    userId: params.userId,
    purpose: params.purpose,
    category: params.category,
    framework: params.framework,
    status: params.status,
    grantedAt: params.status === "granted" ? now : undefined,
    expiresAt: params.expiresInDays
      ? new Date(now.getTime() + params.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined,
    version: params.version,
    ipAddress: params.ipAddress,
  };
}

/**
 * Revoke a consent record.
 */
export function revokeConsent(record: ConsentRecord): ConsentRecord {
  return {
    ...record,
    status: "revoked",
    revokedAt: new Date(),
  };
}

/**
 * Check if a consent record is valid (granted and not expired).
 */
export function isConsentValid(record: ConsentRecord, now = new Date()): boolean {
  if (record.status !== "granted") return false;
  if (record.expiresAt && now > record.expiresAt) return false;
  return true;
}

/**
 * Get all valid consent records for a user.
 */
export function getValidConsents(
  records: ConsentRecord[],
  userId: string,
  now = new Date()
): ConsentRecord[] {
  return records.filter(
    (r) => r.userId === userId && isConsentValid(r, now)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compliance Checking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check GDPR compliance for a residency policy and consent records.
 */
export function checkGdprCompliance(
  policy: DataResidencyPolicy,
  consents: ConsentRecord[],
  categories: DataCategory[]
): ComplianceCheckResult {
  const passed: string[] = [];
  const failed: string[] = [];
  const warnings: string[] = [];

  // Check data residency (EU region or approved transfer)
  if (isGdprRegion(policy.region)) {
    passed.push("Data stored in EU region");
  } else {
    if (policy.crossBorderTransferAllowed && policy.approvedTransferCountries?.length) {
      passed.push("Cross-border transfer covered by approved country list");
    } else {
      failed.push("Data stored outside EU without adequate transfer mechanism");
    }
  }

  // Check consent for PII categories
  const piiCategories = categories.filter((c) => DATA_INVENTORY[c]?.containsPII);
  for (const cat of piiCategories) {
    const catConsents = consents.filter(
      (c) => c.category === cat && c.framework === "gdpr"
    );
    if (catConsents.length === 0) {
      failed.push(`No GDPR consent record for PII category: ${cat}`);
    } else if (!catConsents.some((c) => c.status === "granted")) {
      failed.push(`No granted consent for GDPR category: ${cat}`);
    } else {
      passed.push(`Valid GDPR consent for: ${cat}`);
    }
  }

  // Check restricted categories
  for (const cat of categories) {
    if (policy.restrictedCategories.includes(cat)) {
      failed.push(`Category ${cat} is restricted by this residency policy`);
    }
  }

  if (!policy.frameworks.includes("gdpr")) {
    warnings.push("Residency policy does not explicitly list GDPR as a framework");
  }

  return {
    compliant: failed.length === 0,
    framework: "gdpr",
    passed,
    failed,
    warnings,
  };
}

/**
 * Get all data categories that require encryption for a given framework.
 */
export function getEncryptionRequiredCategories(
  framework: ComplianceFramework
): DataCategory[] {
  return Object.values(DATA_INVENTORY)
    .filter(
      (item) =>
        item.encryptionRequired &&
        (item.frameworks.includes(framework) || item.frameworks.length === 0)
    )
    .map((item) => item.category);
}

/**
 * Get all PII categories in the data inventory.
 */
export function getPiiCategories(): DataCategory[] {
  return Object.values(DATA_INVENTORY)
    .filter((item) => item.containsPII)
    .map((item) => item.category);
}

/**
 * Get default retention policy for a data category.
 */
export function getDefaultRetentionPolicy(category: DataCategory): RetentionPolicy {
  const item = DATA_INVENTORY[category];
  return {
    id: `rp-${category}`,
    category,
    retentionDays: item.retentionDays,
    onExpiry: item.retentionDays === 0 ? "archive" : "delete",
    frameworks: item.frameworks,
    legalHoldAllowed: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateId(length = 12): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
