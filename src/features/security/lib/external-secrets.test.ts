import { describe, it, expect } from "vitest";
import {
  parseSecretUri,
  formatSecretUri,
  buildVaultPath,
  buildAwsSecretPath,
  buildGcpSecretName,
  buildAzureKvSecretUrl,
  extractFieldFromSecret,
  validateSecretReference,
  validateVaultConfig,
  validateAwsSmConfig,
  validateGcpSmConfig,
  validateAzureKvConfig,
  validateExternalSecretsConfig,
  createSecretMetadata,
  markSecretRotated,
  getRotationStatus,
  extractSecretReferences,
  interpolateSecrets,
  getMissingSecrets,
  mockSecretResolution,
  asCachedResult,
  filterSecretsByStatus,
  getSecretsNeedingRotation,
  summarizeSecretsConfig,
  type SecretReference,
  type SecretMetadata,
  type SecretRotationPolicy,
  type ExternalSecretsConfig,
} from "./external-secrets";

// ─────────────────────────────────────────────────────────────────────────────
// parseSecretUri
// ─────────────────────────────────────────────────────────────────────────────

describe("parseSecretUri", () => {
  it("parses vault URI with field and version", () => {
    const ref = parseSecretUri("vault://secret/data/myapp/db#password@v2");
    expect(ref?.provider).toBe("vault");
    expect(ref?.path).toBe("secret/data/myapp/db");
    expect(ref?.field).toBe("password");
    expect(ref?.version).toBe("v2");
  });

  it("parses AWS SM URI", () => {
    const ref = parseSecretUri("aws-sm://us-east-1/myapp/db-creds#username");
    expect(ref?.provider).toBe("aws-sm");
    expect(ref?.path).toBe("us-east-1/myapp/db-creds");
    expect(ref?.field).toBe("username");
    expect(ref?.version).toBeUndefined();
  });

  it("parses GCP SM URI", () => {
    const ref = parseSecretUri("gcp-sm://my-project/my-secret@latest");
    expect(ref?.provider).toBe("gcp-sm");
    expect(ref?.path).toBe("my-project/my-secret");
    expect(ref?.version).toBe("latest");
  });

  it("parses Azure KV URI", () => {
    const ref = parseSecretUri("azure-kv://https://myvault.vault.azure.net/secrets/db");
    expect(ref?.provider).toBe("azure-kv");
  });

  it("parses env URI", () => {
    const ref = parseSecretUri("env://MY_SECRET");
    expect(ref?.provider).toBe("env");
    expect(ref?.path).toBe("MY_SECRET");
  });

  it("returns null for unknown provider", () => {
    expect(parseSecretUri("unknown://some/path")).toBeNull();
  });

  it("returns null for invalid URI format", () => {
    expect(parseSecretUri("not-a-uri")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatSecretUri
// ─────────────────────────────────────────────────────────────────────────────

describe("formatSecretUri", () => {
  it("formats basic reference", () => {
    const ref: SecretReference = { provider: "vault", path: "secret/myapp" };
    expect(formatSecretUri(ref)).toBe("vault://secret/myapp");
  });

  it("includes field and version", () => {
    const ref: SecretReference = { provider: "aws-sm", path: "us-east-1/myapp", field: "pass", version: "AWSCURRENT" };
    expect(formatSecretUri(ref)).toBe("aws-sm://us-east-1/myapp#pass@AWSCURRENT");
  });

  it("round-trips with parseSecretUri", () => {
    const uri = "gcp-sm://my-project/my-secret@latest";
    const ref = parseSecretUri(uri)!;
    expect(formatSecretUri(ref)).toBe(uri);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Path builders
// ─────────────────────────────────────────────────────────────────────────────

describe("buildVaultPath", () => {
  it("builds KV v2 path", () => {
    expect(buildVaultPath("secret", "myapp/db")).toBe("secret/data/myapp/db");
  });

  it("trims leading/trailing slashes", () => {
    expect(buildVaultPath("/secret/", "/myapp/db")).toBe("secret/data/myapp/db");
  });
});

describe("buildAwsSecretPath", () => {
  it("builds path from region and name", () => {
    expect(buildAwsSecretPath("us-east-1", "myapp/db")).toBe("us-east-1/myapp/db");
  });

  it("returns ARN unchanged", () => {
    const arn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:myapp";
    expect(buildAwsSecretPath("us-east-1", arn)).toBe(arn);
  });
});

describe("buildGcpSecretName", () => {
  it("builds resource name with default version", () => {
    expect(buildGcpSecretName("my-project", "my-secret")).toBe(
      "projects/my-project/secrets/my-secret/versions/latest"
    );
  });

  it("uses specific version", () => {
    expect(buildGcpSecretName("my-project", "my-secret", "3")).toContain("versions/3");
  });
});

describe("buildAzureKvSecretUrl", () => {
  it("builds secret URL", () => {
    const url = buildAzureKvSecretUrl("https://myvault.vault.azure.net", "db-password");
    expect(url).toBe("https://myvault.vault.azure.net/secrets/db-password");
  });

  it("includes version when provided", () => {
    const url = buildAzureKvSecretUrl(
      "https://myvault.vault.azure.net",
      "db-password",
      "abc123"
    );
    expect(url).toContain("abc123");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractFieldFromSecret
// ─────────────────────────────────────────────────────────────────────────────

describe("extractFieldFromSecret", () => {
  it("extracts a field from JSON secret", () => {
    const json = JSON.stringify({ username: "admin", password: "hunter2" });
    expect(extractFieldFromSecret(json, "username")).toBe("admin");
    expect(extractFieldFromSecret(json, "password")).toBe("hunter2");
  });

  it("returns null for missing field", () => {
    const json = JSON.stringify({ username: "admin" });
    expect(extractFieldFromSecret(json, "password")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(extractFieldFromSecret("not json", "key")).toBeNull();
  });

  it("converts non-string values to string", () => {
    const json = JSON.stringify({ port: 5432 });
    expect(extractFieldFromSecret(json, "port")).toBe("5432");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateSecretReference
// ─────────────────────────────────────────────────────────────────────────────

describe("validateSecretReference", () => {
  it("passes valid vault reference", () => {
    const result = validateSecretReference({ provider: "vault", path: "secret/myapp/db" });
    expect(result.valid).toBe(true);
  });

  it("fails when path is empty", () => {
    const result = validateSecretReference({ provider: "vault", path: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("path"))).toBe(true);
  });

  it("fails for vault path without slash", () => {
    const result = validateSecretReference({ provider: "vault", path: "nodash" });
    expect(result.valid).toBe(false);
  });

  it("fails for aws-sm path without region", () => {
    const result = validateSecretReference({ provider: "aws-sm", path: "just-a-name" });
    expect(result.valid).toBe(false);
  });

  it("passes gcp-sm with project/secret", () => {
    const result = validateSecretReference({ provider: "gcp-sm", path: "my-project/my-secret" });
    expect(result.valid).toBe(true);
  });

  it("fails for azure-kv without URL", () => {
    const result = validateSecretReference({ provider: "azure-kv", path: "just-a-name" });
    expect(result.valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Config validators
// ─────────────────────────────────────────────────────────────────────────────

describe("validateVaultConfig", () => {
  it("passes valid config", () => {
    const result = validateVaultConfig({ address: "https://vault.example.com" });
    expect(result.valid).toBe(true);
  });

  it("fails when address is missing", () => {
    const result = validateVaultConfig({ address: "" });
    expect(result.valid).toBe(false);
  });

  it("fails when address is invalid URL", () => {
    const result = validateVaultConfig({ address: "not-a-url" });
    expect(result.valid).toBe(false);
  });
});

describe("validateAwsSmConfig", () => {
  it("passes valid config", () => {
    const result = validateAwsSmConfig({ region: "us-east-1" });
    expect(result.valid).toBe(true);
  });

  it("fails when region is missing", () => {
    const result = validateAwsSmConfig({ region: "" });
    expect(result.valid).toBe(false);
  });

  it("fails when region format is invalid", () => {
    const result = validateAwsSmConfig({ region: "myregion" });
    expect(result.valid).toBe(false);
  });
});

describe("validateGcpSmConfig", () => {
  it("passes valid config", () => {
    expect(validateGcpSmConfig({ projectId: "my-project" }).valid).toBe(true);
  });

  it("fails when projectId is missing", () => {
    expect(validateGcpSmConfig({ projectId: "" }).valid).toBe(false);
  });
});

describe("validateAzureKvConfig", () => {
  it("passes valid config", () => {
    const result = validateAzureKvConfig({ vaultUrl: "https://myvault.vault.azure.net" });
    expect(result.valid).toBe(true);
  });

  it("fails when vaultUrl is missing", () => {
    expect(validateAzureKvConfig({ vaultUrl: "" }).valid).toBe(false);
  });
});

describe("validateExternalSecretsConfig", () => {
  it("validates vault provider", () => {
    const config: ExternalSecretsConfig = {
      provider: "vault",
      enabled: true,
      config: { address: "https://vault.example.com" },
    };
    expect(validateExternalSecretsConfig(config).valid).toBe(true);
  });

  it("validates env provider (always valid)", () => {
    const config: ExternalSecretsConfig = {
      provider: "env",
      enabled: true,
      config: {} as never,
    };
    expect(validateExternalSecretsConfig(config).valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createSecretMetadata
// ─────────────────────────────────────────────────────────────────────────────

describe("createSecretMetadata", () => {
  it("creates metadata with defaults", () => {
    const ref: SecretReference = { provider: "vault", path: "secret/myapp/db" };
    const meta = createSecretMetadata({ name: "DB Password", reference: ref });
    expect(meta.id).toBeTruthy();
    expect(meta.status).toBe("active");
    expect(meta.name).toBe("DB Password");
    expect(meta.createdAt).toBeInstanceOf(Date);
    expect(meta.nextRotationAt).toBeUndefined();
  });

  it("sets rotation dates when policy provided", () => {
    const ref: SecretReference = { provider: "vault", path: "secret/myapp/db" };
    const policy: SecretRotationPolicy = { enabled: true, intervalDays: 30 };
    const meta = createSecretMetadata({ name: "DB", reference: ref, rotationPolicy: policy });
    expect(meta.nextRotationAt).toBeInstanceOf(Date);
    expect(meta.lastRotatedAt).toBeInstanceOf(Date);
    const expectedDays = 30 * 24 * 60 * 60 * 1000;
    const diff = meta.nextRotationAt!.getTime() - meta.createdAt.getTime();
    expect(Math.abs(diff - expectedDays)).toBeLessThan(1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// markSecretRotated
// ─────────────────────────────────────────────────────────────────────────────

describe("markSecretRotated", () => {
  it("updates rotation timestamps", () => {
    const ref: SecretReference = { provider: "vault", path: "secret/myapp/db" };
    const meta = createSecretMetadata({ name: "DB", reference: ref });
    const policy: SecretRotationPolicy = { enabled: true, intervalDays: 90 };
    const rotated = markSecretRotated(meta, policy);
    expect(rotated.lastRotatedAt).toBeInstanceOf(Date);
    expect(rotated.nextRotationAt).toBeInstanceOf(Date);
    expect(rotated.status).toBe("active");
  });

  it("clears nextRotationAt when policy disabled", () => {
    const ref: SecretReference = { provider: "vault", path: "secret/myapp/db" };
    const meta = createSecretMetadata({ name: "DB", reference: ref });
    const policy: SecretRotationPolicy = { enabled: false, intervalDays: 0 };
    const rotated = markSecretRotated(meta, policy);
    expect(rotated.nextRotationAt).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getRotationStatus
// ─────────────────────────────────────────────────────────────────────────────

describe("getRotationStatus", () => {
  const makeMetaWithNext = (daysFromNow: number): SecretMetadata => {
    const ref: SecretReference = { provider: "vault", path: "secret/myapp/db" };
    const meta = createSecretMetadata({ name: "DB", reference: ref });
    return {
      ...meta,
      nextRotationAt: new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000),
    };
  };

  it("returns overdue when past nextRotationAt", () => {
    const meta = makeMetaWithNext(-5);
    const policy: SecretRotationPolicy = { enabled: true, intervalDays: 30 };
    const status = getRotationStatus(meta, policy);
    expect(status.isOverdue).toBe(true);
    expect(status.daysOverdue).toBeGreaterThan(0);
  });

  it("returns isDueSoon within notifyDaysBefore window", () => {
    const meta = makeMetaWithNext(3);
    const policy: SecretRotationPolicy = { enabled: true, intervalDays: 30, notifyDaysBefore: 7 };
    const status = getRotationStatus(meta, policy);
    expect(status.isDueSoon).toBe(true);
    expect(status.isOverdue).toBe(false);
  });

  it("returns neither overdue nor dueSoon when far from rotation", () => {
    const meta = makeMetaWithNext(30);
    const policy: SecretRotationPolicy = { enabled: true, intervalDays: 90, notifyDaysBefore: 7 };
    const status = getRotationStatus(meta, policy);
    expect(status.isOverdue).toBe(false);
    expect(status.isDueSoon).toBe(false);
    expect(status.daysUntilRotation).toBeGreaterThan(7);
  });

  it("returns not-configured when policy disabled", () => {
    const ref: SecretReference = { provider: "vault", path: "secret/myapp/db" };
    const meta = createSecretMetadata({ name: "DB", reference: ref });
    const policy: SecretRotationPolicy = { enabled: false, intervalDays: 0 };
    const status = getRotationStatus(meta, policy);
    expect(status.isOverdue).toBe(false);
    expect(status.message).toContain("not configured");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractSecretReferences
// ─────────────────────────────────────────────────────────────────────────────

describe("extractSecretReferences", () => {
  it("extracts secret refs from template", () => {
    const template = "password: {{secret:vault://secret/myapp/db#password}} user: {{secret:env://DB_USER}}";
    const refs = extractSecretReferences(template);
    expect(refs).toHaveLength(2);
    expect(refs[0].provider).toBe("vault");
    expect(refs[1].provider).toBe("env");
  });

  it("returns empty for template with no secrets", () => {
    expect(extractSecretReferences("hello world")).toHaveLength(0);
  });

  it("ignores invalid secret URIs", () => {
    const refs = extractSecretReferences("{{secret:invalid-uri}}");
    expect(refs).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// interpolateSecrets
// ─────────────────────────────────────────────────────────────────────────────

describe("interpolateSecrets", () => {
  it("replaces secret placeholders", () => {
    const template = "HOST={{secret:env://DB_HOST}} PORT={{secret:env://DB_PORT}}";
    const resolved = {
      "env://DB_HOST": "localhost",
      "env://DB_PORT": "5432",
    };
    expect(interpolateSecrets(template, resolved)).toBe("HOST=localhost PORT=5432");
  });

  it("leaves unresolved secrets in place", () => {
    const template = "{{secret:env://MISSING}}";
    expect(interpolateSecrets(template, {})).toBe("{{secret:env://MISSING}}");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getMissingSecrets
// ─────────────────────────────────────────────────────────────────────────────

describe("getMissingSecrets", () => {
  it("returns unresolved references", () => {
    const template = "{{secret:env://DB_HOST}} {{secret:env://DB_PASS}}";
    const resolved = { "env://DB_HOST": "localhost" };
    const missing = getMissingSecrets(template, resolved);
    expect(missing).toHaveLength(1);
    expect(missing[0].path).toBe("DB_PASS");
  });

  it("returns empty when all resolved", () => {
    const template = "{{secret:env://DB_HOST}}";
    const resolved = { "env://DB_HOST": "localhost" };
    expect(getMissingSecrets(template, resolved)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mockSecretResolution / asCachedResult
// ─────────────────────────────────────────────────────────────────────────────

describe("mockSecretResolution", () => {
  it("creates a resolution result", () => {
    const ref: SecretReference = { provider: "env", path: "DB_PASS" };
    const result = mockSecretResolution(ref, "mysecret");
    expect(result.value).toBe("mysecret");
    expect(result.source).toBe("env");
    expect(result.cached).toBe(false);
    expect(result.resolvedAt).toBeInstanceOf(Date);
  });
});

describe("asCachedResult", () => {
  it("marks result as cached", () => {
    const ref: SecretReference = { provider: "env", path: "DB_PASS" };
    const result = mockSecretResolution(ref, "mysecret");
    const cached = asCachedResult(result);
    expect(cached.cached).toBe(true);
    expect(cached.value).toBe("mysecret");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// filterSecretsByStatus
// ─────────────────────────────────────────────────────────────────────────────

describe("filterSecretsByStatus", () => {
  const makeSecretMeta = (status: SecretMetadata["status"]): SecretMetadata => {
    const ref: SecretReference = { provider: "env", path: "K" };
    return { ...createSecretMetadata({ name: "S", reference: ref }), status };
  };

  it("filters by status", () => {
    const secrets = [
      makeSecretMeta("active"),
      makeSecretMeta("active"),
      makeSecretMeta("deprecated"),
      makeSecretMeta("deleted"),
    ];
    expect(filterSecretsByStatus(secrets, "active")).toHaveLength(2);
    expect(filterSecretsByStatus(secrets, "deprecated")).toHaveLength(1);
    expect(filterSecretsByStatus(secrets, "deleted")).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getSecretsNeedingRotation
// ─────────────────────────────────────────────────────────────────────────────

describe("getSecretsNeedingRotation", () => {
  it("returns secrets overdue for rotation", () => {
    const ref: SecretReference = { provider: "vault", path: "secret/myapp/db" };
    const overdueSecret = {
      ...createSecretMetadata({ name: "DB", reference: ref }),
      id: "s1",
      nextRotationAt: new Date(Date.now() - 86_400_000),
    };
    const healthySecret = {
      ...createSecretMetadata({ name: "DB2", reference: ref }),
      id: "s2",
      nextRotationAt: new Date(Date.now() + 30 * 86_400_000),
    };
    const policies = new Map<string, SecretRotationPolicy>([
      ["s1", { enabled: true, intervalDays: 30 }],
      ["s2", { enabled: true, intervalDays: 30 }],
    ]);
    const results = getSecretsNeedingRotation([overdueSecret, healthySecret], policies);
    expect(results).toHaveLength(1);
    expect(results[0].metadata.id).toBe("s1");
    expect(results[0].status.isOverdue).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summarizeSecretsConfig
// ─────────────────────────────────────────────────────────────────────────────

describe("summarizeSecretsConfig", () => {
  it("summarizes provider configs", () => {
    const configs: ExternalSecretsConfig[] = [
      { provider: "vault", enabled: true, config: { address: "https://vault.example.com" } },
      { provider: "aws-sm", enabled: true, config: { region: "us-east-1" } },
      { provider: "gcp-sm", enabled: false, config: { projectId: "proj" } },
    ];
    const summary = summarizeSecretsConfig(configs);
    expect(summary.totalProviders).toBe(3);
    expect(summary.enabledProviders).toContain("vault");
    expect(summary.enabledProviders).toContain("aws-sm");
    expect(summary.disabledProviders).toContain("gcp-sm");
  });
});
