/**
 * Phase 37 — External Secrets Manager Integration
 * Pure utility functions for integrating with external secret managers:
 * HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault.
 * No HTTP calls — all logic is path parsing, validation, and transformation.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SecretProvider = "vault" | "aws-sm" | "gcp-sm" | "azure-kv" | "env";

export type SecretStatus = "active" | "deprecated" | "deleted" | "pending_rotation";

export interface SecretReference {
  provider: SecretProvider;
  path: string;       // provider-specific path
  field?: string;     // JSON field within the secret (for multi-field secrets)
  version?: string;   // specific version/stage (e.g., "AWSCURRENT", "latest")
}

export interface SecretMetadata {
  id: string;
  name: string;
  reference: SecretReference;
  description?: string;
  tags?: Record<string, string>;
  status: SecretStatus;
  lastRotatedAt?: Date;
  nextRotationAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SecretRotationPolicy {
  enabled: boolean;
  intervalDays: number;
  notifyDaysBefore?: number;  // warn this many days before expiry
  autoRotate?: boolean;
}

export interface VaultConfig {
  address: string;        // e.g., https://vault.example.com
  namespace?: string;
  mountPath?: string;     // default: "secret"
  authMethod?: "token" | "approle" | "kubernetes" | "aws";
}

export interface AwsSmConfig {
  region: string;
  endpoint?: string;      // custom endpoint for LocalStack, etc.
  assumeRoleArn?: string;
}

export interface GcpSmConfig {
  projectId: string;
  serviceAccountEmail?: string;
}

export interface AzureKvConfig {
  vaultUrl: string;       // e.g., https://myvault.vault.azure.net
  tenantId?: string;
  clientId?: string;
}

export interface ExternalSecretsConfig {
  provider: SecretProvider;
  config: VaultConfig | AwsSmConfig | GcpSmConfig | AzureKvConfig;
  enabled: boolean;
  cacheSeconds?: number;  // how long to cache resolved secrets
}

export interface SecretResolutionResult {
  value: string;
  resolvedAt: Date;
  source: SecretProvider;
  cached: boolean;
}

export interface SecretValidationResult {
  valid: boolean;
  errors: string[];
}

export interface RotationStatus {
  isOverdue: boolean;
  isDueSoon: boolean;
  daysUntilRotation?: number;
  daysOverdue?: number;
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Path / Reference Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a secret reference URI into a structured SecretReference.
 * URI format: `{provider}://{path}[#{field}][@{version}]`
 * Examples:
 *   vault://secret/data/myapp/db#password
 *   aws-sm://us-east-1/myapp/db-creds#username@AWSCURRENT
 *   gcp-sm://my-project/my-secret@latest
 *   azure-kv://myvault.vault.azure.net/secrets/db-password
 *   env://MY_SECRET_KEY
 */
export function parseSecretUri(uri: string): SecretReference | null {
  const match = uri.match(/^([a-z-]+):\/\/([^#@]+)(?:#([^@]+))?(?:@(.+))?$/);
  if (!match) return null;

  const [, provider, path, field, version] = match;

  if (!isValidProvider(provider)) return null;

  return {
    provider: provider as SecretProvider,
    path: path.trim(),
    field: field?.trim(),
    version: version?.trim(),
  };
}

/**
 * Serialize a SecretReference back into a URI string.
 */
export function formatSecretUri(ref: SecretReference): string {
  let uri = `${ref.provider}://${ref.path}`;
  if (ref.field) uri += `#${ref.field}`;
  if (ref.version) uri += `@${ref.version}`;
  return uri;
}

/**
 * Build a Vault KV v2 secret path.
 * Vault KV v2 paths are like: {mount}/data/{path}
 */
export function buildVaultPath(mount: string, secretPath: string): string {
  const cleanMount = mount.replace(/^\/|\/$/g, "");
  const cleanPath = secretPath.replace(/^\//, "");
  return `${cleanMount}/data/${cleanPath}`;
}

/**
 * Build an AWS Secrets Manager ARN or name path.
 */
export function buildAwsSecretPath(region: string, secretName: string): string {
  if (secretName.startsWith("arn:")) return secretName;
  return `${region}/${secretName}`;
}

/**
 * Build a GCP Secret Manager resource name.
 */
export function buildGcpSecretName(projectId: string, secretId: string, version = "latest"): string {
  return `projects/${projectId}/secrets/${secretId}/versions/${version}`;
}

/**
 * Build an Azure Key Vault secret URL.
 */
export function buildAzureKvSecretUrl(vaultUrl: string, secretName: string, version?: string): string {
  const base = vaultUrl.replace(/\/$/, "");
  const url = `${base}/secrets/${secretName}`;
  return version ? `${url}/${version}` : url;
}

/**
 * Extract field value from a JSON secret string.
 * Returns null if the field does not exist or JSON is invalid.
 */
export function extractFieldFromSecret(secretJson: string, field: string): string | null {
  try {
    const parsed = JSON.parse(secretJson);
    const value = parsed[field];
    if (value === undefined || value === null) return null;
    return String(value);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a SecretReference.
 */
export function validateSecretReference(ref: SecretReference): SecretValidationResult {
  const errors: string[] = [];

  if (!isValidProvider(ref.provider)) {
    errors.push(`Unknown secret provider: ${ref.provider}`);
  }
  if (!ref.path || ref.path.trim() === "") {
    errors.push("Secret path is required");
  }
  if (ref.provider === "vault" && !ref.path.includes("/")) {
    errors.push("Vault path must include mount and secret name (e.g., secret/myapp)");
  }
  if (ref.provider === "aws-sm" && ref.path.split("/").length < 2) {
    errors.push("AWS SM path must include region and secret name");
  }
  if (ref.provider === "gcp-sm" && !ref.path.includes("/")) {
    errors.push("GCP SM path must include project ID and secret ID");
  }
  if (ref.provider === "azure-kv" && !ref.path.startsWith("http")) {
    errors.push("Azure KV path must be a full vault URL");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a Vault configuration.
 */
export function validateVaultConfig(config: VaultConfig): SecretValidationResult {
  const errors: string[] = [];
  if (!config.address) errors.push("Vault address is required");
  if (config.address && !isValidUrl(config.address)) {
    errors.push("Vault address must be a valid URL");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate an AWS SM configuration.
 */
export function validateAwsSmConfig(config: AwsSmConfig): SecretValidationResult {
  const errors: string[] = [];
  if (!config.region) errors.push("AWS region is required");
  if (config.region && !/^[a-z]{2}-[a-z]+-\d+$/.test(config.region)) {
    errors.push(`Invalid AWS region format: ${config.region}`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a GCP SM configuration.
 */
export function validateGcpSmConfig(config: GcpSmConfig): SecretValidationResult {
  const errors: string[] = [];
  if (!config.projectId) errors.push("GCP project ID is required");
  return { valid: errors.length === 0, errors };
}

/**
 * Validate an Azure KV configuration.
 */
export function validateAzureKvConfig(config: AzureKvConfig): SecretValidationResult {
  const errors: string[] = [];
  if (!config.vaultUrl) errors.push("Azure Key Vault URL is required");
  if (config.vaultUrl && !isValidUrl(config.vaultUrl)) {
    errors.push("Azure Key Vault URL must be a valid URL");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate an ExternalSecretsConfig based on its provider type.
 */
export function validateExternalSecretsConfig(
  config: ExternalSecretsConfig
): SecretValidationResult {
  switch (config.provider) {
    case "vault":
      return validateVaultConfig(config.config as VaultConfig);
    case "aws-sm":
      return validateAwsSmConfig(config.config as AwsSmConfig);
    case "gcp-sm":
      return validateGcpSmConfig(config.config as GcpSmConfig);
    case "azure-kv":
      return validateAzureKvConfig(config.config as AzureKvConfig);
    case "env":
      return { valid: true, errors: [] };
    default:
      return { valid: false, errors: [`Unknown provider: ${config.provider}`] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Secret Metadata Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new SecretMetadata object.
 */
export function createSecretMetadata(params: {
  name: string;
  reference: SecretReference;
  description?: string;
  tags?: Record<string, string>;
  rotationPolicy?: SecretRotationPolicy;
}): SecretMetadata {
  const now = new Date();
  const meta: SecretMetadata = {
    id: `secret-${generateId()}`,
    name: params.name,
    reference: params.reference,
    description: params.description,
    tags: params.tags,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  if (params.rotationPolicy?.enabled && params.rotationPolicy.intervalDays > 0) {
    meta.lastRotatedAt = now;
    meta.nextRotationAt = addDays(now, params.rotationPolicy.intervalDays);
  }

  return meta;
}

/**
 * Update the rotation timestamps after a secret has been rotated.
 */
export function markSecretRotated(
  metadata: SecretMetadata,
  policy: SecretRotationPolicy
): SecretMetadata {
  const now = new Date();
  return {
    ...metadata,
    lastRotatedAt: now,
    nextRotationAt: policy.enabled
      ? addDays(now, policy.intervalDays)
      : undefined,
    updatedAt: now,
    status: "active",
  };
}

/**
 * Get the rotation status for a secret.
 */
export function getRotationStatus(
  metadata: SecretMetadata,
  policy: SecretRotationPolicy,
  now = new Date()
): RotationStatus {
  if (!policy.enabled || !metadata.nextRotationAt) {
    return {
      isOverdue: false,
      isDueSoon: false,
      message: "Rotation not configured",
    };
  }

  const msUntilRotation = metadata.nextRotationAt.getTime() - now.getTime();
  const daysUntilRotation = Math.ceil(msUntilRotation / (1000 * 60 * 60 * 24));
  const notifyDays = policy.notifyDaysBefore ?? 7;

  if (daysUntilRotation < 0) {
    return {
      isOverdue: true,
      isDueSoon: false,
      daysOverdue: Math.abs(daysUntilRotation),
      message: `Secret rotation overdue by ${Math.abs(daysUntilRotation)} day(s)`,
    };
  }

  if (daysUntilRotation <= notifyDays) {
    return {
      isOverdue: false,
      isDueSoon: true,
      daysUntilRotation,
      message: `Secret rotation due in ${daysUntilRotation} day(s)`,
    };
  }

  return {
    isOverdue: false,
    isDueSoon: false,
    daysUntilRotation,
    message: `Next rotation in ${daysUntilRotation} day(s)`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Template Substitution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find all secret reference placeholders in a template string.
 * Pattern: `{{secret:provider://path#field@version}}`
 */
export function extractSecretReferences(template: string): SecretReference[] {
  const regex = /\{\{secret:([^}]+)\}\}/g;
  const refs: SecretReference[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(template)) !== null) {
    const ref = parseSecretUri(match[1]);
    if (ref) refs.push(ref);
  }

  return refs;
}

/**
 * Substitute secret placeholders in a template string with resolved values.
 * `resolvedSecrets` is a map of URI -> resolved value.
 */
export function interpolateSecrets(
  template: string,
  resolvedSecrets: Record<string, string>
): string {
  return template.replace(/\{\{secret:([^}]+)\}\}/g, (_, uri) => {
    return resolvedSecrets[uri] ?? `{{secret:${uri}}}`;
  });
}

/**
 * Check which secret references in a template are unresolved.
 */
export function getMissingSecrets(
  template: string,
  resolvedSecrets: Record<string, string>
): SecretReference[] {
  const refs = extractSecretReferences(template);
  return refs.filter((ref) => {
    const uri = formatSecretUri(ref);
    return !(uri in resolvedSecrets);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulation / Mocking Helpers (for testing without real providers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a mock resolved secret result (for testing / dry runs).
 */
export function mockSecretResolution(
  ref: SecretReference,
  value: string
): SecretResolutionResult {
  return {
    value,
    resolvedAt: new Date(),
    source: ref.provider,
    cached: false,
  };
}

/**
 * Build a "cached" resolution result by updating the resolvedAt field.
 */
export function asCachedResult(
  result: SecretResolutionResult
): SecretResolutionResult {
  return { ...result, cached: true };
}

/**
 * Filter secret metadata by status.
 */
export function filterSecretsByStatus(
  secrets: SecretMetadata[],
  status: SecretStatus
): SecretMetadata[] {
  return secrets.filter((s) => s.status === status);
}

/**
 * Get all secrets that need rotation (overdue or due soon).
 */
export function getSecretsNeedingRotation(
  secrets: SecretMetadata[],
  policies: Map<string, SecretRotationPolicy>,
  now = new Date()
): Array<{ metadata: SecretMetadata; status: RotationStatus }> {
  const results: Array<{ metadata: SecretMetadata; status: RotationStatus }> = [];

  for (const secret of secrets) {
    const policy = policies.get(secret.id);
    if (!policy) continue;
    const rotationStatus = getRotationStatus(secret, policy, now);
    if (rotationStatus.isOverdue || rotationStatus.isDueSoon) {
      results.push({ metadata: secret, status: rotationStatus });
    }
  }

  return results;
}

/**
 * Summarize external secrets configuration across all providers.
 */
export function summarizeSecretsConfig(
  configs: ExternalSecretsConfig[]
): {
  totalProviders: number;
  enabledProviders: SecretProvider[];
  disabledProviders: SecretProvider[];
} {
  const enabled = configs.filter((c) => c.enabled).map((c) => c.provider);
  const disabled = configs.filter((c) => !c.enabled).map((c) => c.provider);
  return {
    totalProviders: configs.length,
    enabledProviders: enabled,
    disabledProviders: disabled,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isValidProvider(value: string): value is SecretProvider {
  return ["vault", "aws-sm", "gcp-sm", "azure-kv", "env"].includes(value);
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function generateId(length = 12): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
