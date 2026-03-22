/**
 * Phase 45 — Self-hosted Deployment Configuration
 * Pure utilities for validating Docker/Kubernetes deployment manifests,
 * environment configuration, health checks, and scaling policies.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DeploymentTarget = "docker" | "kubernetes" | "docker-compose" | "bare-metal";

export type DatabaseType = "postgresql" | "mysql" | "sqlite";

export type QueueType = "inngest" | "redis" | "bullmq" | "sqs";

export type StorageType = "local" | "s3" | "gcs" | "azure-blob";

export type AuthProvider = "credentials" | "github" | "google" | "saml" | "oidc";

export interface DeploymentConfig {
  target: DeploymentTarget;
  version: string;
  app: AppConfig;
  database: DatabaseConfig;
  queue: QueueConfig;
  storage: StorageConfig;
  auth: AuthDeploymentConfig;
  scaling?: ScalingConfig;
  monitoring?: MonitoringConfig;
}

export interface AppConfig {
  port: number;
  host?: string;
  baseUrl: string;
  secretKey: string;          // >=32 chars
  encryptionKey: string;      // >=32 chars
  nodeEnv: "development" | "production" | "test";
  maxWorkers?: number;
  logLevel?: "error" | "warn" | "info" | "debug";
  corsOrigins?: string[];
}

export interface DatabaseConfig {
  type: DatabaseType;
  url: string;                // connection string
  poolMin?: number;
  poolMax?: number;
  sslEnabled?: boolean;
  migrationOnStart?: boolean;
}

export interface QueueConfig {
  type: QueueType;
  connectionUrl?: string;     // for Redis/BullMQ
  maxConcurrency?: number;
  retryAttempts?: number;
}

export interface StorageConfig {
  type: StorageType;
  localPath?: string;         // for local storage
  bucket?: string;            // for S3/GCS/Azure
  region?: string;
  endpoint?: string;          // custom endpoint (e.g., MinIO)
  maxFileSizeMb?: number;
}

export interface AuthDeploymentConfig {
  providers: AuthProvider[];
  sessionMaxAgeSeconds?: number;
  jwtSecret?: string;
  oauthCallbackUrl?: string;
}

export interface ScalingConfig {
  minReplicas: number;
  maxReplicas: number;
  targetCpuPercent?: number;
  targetMemoryPercent?: number;
  scaleDownDelaySeconds?: number;
}

export interface MonitoringConfig {
  enabled: boolean;
  metricsPort?: number;
  healthCheckPath?: string;
  sentryDsn?: string;
  logExporter?: "stdout" | "file" | "cloudwatch" | "gcp" | "datadog";
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  securityIssues: string[];
}

export interface EnvironmentVariables {
  required: string[];
  optional: string[];
  secret: string[];
}

export interface ResourceRequirements {
  cpu: string;
  memory: string;
  ephemeralStorage?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a deployment configuration.
 */
export function validateDeploymentConfig(
  config: DeploymentConfig
): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const securityIssues: string[] = [];

  // App config
  if (!config.app.baseUrl) errors.push("app.baseUrl is required");
  if (config.app.baseUrl && !isValidUrl(config.app.baseUrl)) {
    errors.push("app.baseUrl must be a valid URL");
  }
  if (!config.app.secretKey) {
    errors.push("app.secretKey is required");
  } else if (config.app.secretKey.length < 32) {
    securityIssues.push("app.secretKey should be at least 32 characters");
  }
  if (!config.app.encryptionKey) {
    errors.push("app.encryptionKey is required");
  } else if (config.app.encryptionKey.length < 32) {
    securityIssues.push("app.encryptionKey should be at least 32 characters");
  }
  if (config.app.secretKey === config.app.encryptionKey) {
    securityIssues.push("app.secretKey and app.encryptionKey must be different");
  }
  if (config.app.nodeEnv !== "production") {
    warnings.push(`app.nodeEnv is "${config.app.nodeEnv}" — set to "production" for production deployments`);
  }
  if (config.app.port < 1 || config.app.port > 65535) {
    errors.push("app.port must be between 1 and 65535");
  }

  // Database
  if (!config.database.url) {
    errors.push("database.url is required");
  } else if (config.database.type === "postgresql" && !config.database.url.startsWith("postgres")) {
    errors.push("database.url must be a PostgreSQL connection string");
  }
  if (config.app.nodeEnv === "production" && !config.database.sslEnabled) {
    securityIssues.push("database.sslEnabled should be true in production");
  }
  if (config.database.type === "sqlite" && config.app.nodeEnv === "production") {
    warnings.push("SQLite is not recommended for production; use PostgreSQL");
  }

  // Auth
  if (!config.auth.providers || config.auth.providers.length === 0) {
    errors.push("At least one auth.provider is required");
  }
  if (!config.auth.jwtSecret && config.app.nodeEnv === "production") {
    securityIssues.push("auth.jwtSecret should be explicitly set in production");
  }

  // Storage
  if (config.storage.type !== "local" && !config.storage.bucket) {
    errors.push("storage.bucket is required for cloud storage");
  }
  if (config.storage.type === "local" && config.app.nodeEnv === "production") {
    warnings.push("Local storage is not suitable for production; use S3/GCS/Azure");
  }

  // Scaling
  if (config.scaling) {
    if (config.scaling.minReplicas < 1) {
      errors.push("scaling.minReplicas must be at least 1");
    }
    if (config.scaling.maxReplicas < config.scaling.minReplicas) {
      errors.push("scaling.maxReplicas must be >= minReplicas");
    }
    if (config.app.nodeEnv === "production" && config.scaling.maxReplicas < 2) {
      warnings.push("Consider at least 2 replicas for production high availability");
    }
  }

  // CORS
  if (config.app.nodeEnv === "production" && !config.app.corsOrigins) {
    warnings.push("app.corsOrigins not configured — consider restricting CORS in production");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    securityIssues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Environment Variables
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get required and optional environment variables for a deployment config.
 */
export function getRequiredEnvVars(config: DeploymentConfig): EnvironmentVariables {
  const required: string[] = [
    "DATABASE_URL",
    "NEXTAUTH_URL",
    "NEXTAUTH_SECRET",
  ];

  const optional: string[] = [
    "PORT",
    "LOG_LEVEL",
    "MAX_WORKERS",
    "NODE_ENV",
  ];

  const secret: string[] = [
    "NEXTAUTH_SECRET",
    "ENCRYPTION_KEY",
    "DATABASE_URL",
  ];

  if (config.queue.type !== "inngest") {
    required.push("REDIS_URL");
  }

  if (config.storage.type === "s3") {
    required.push("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_BUCKET");
    secret.push("AWS_SECRET_ACCESS_KEY");
    optional.push("AWS_REGION", "S3_ENDPOINT");
  }
  if (config.storage.type === "gcs") {
    required.push("GCS_BUCKET");
    optional.push("GOOGLE_APPLICATION_CREDENTIALS");
  }

  if (config.auth.providers.includes("github")) {
    required.push("GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET");
    secret.push("GITHUB_CLIENT_SECRET");
  }
  if (config.auth.providers.includes("google")) {
    required.push("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET");
    secret.push("GOOGLE_CLIENT_SECRET");
  }
  if (config.auth.providers.includes("saml")) {
    required.push("SAML_IDP_SSO_URL", "SAML_IDP_CERT", "SAML_ENTITY_ID");
    secret.push("SAML_IDP_CERT");
  }

  if (config.monitoring?.sentryDsn) {
    required.push("SENTRY_DSN");
    secret.push("SENTRY_DSN");
  }

  return {
    required: [...new Set(required)],
    optional: [...new Set(optional)],
    secret: [...new Set(secret)],
  };
}

/**
 * Check which required environment variables are missing.
 */
export function getMissingEnvVars(
  config: DeploymentConfig,
  provided: Record<string, string>
): string[] {
  const { required } = getRequiredEnvVars(config);
  return required.filter((v) => !provided[v] || provided[v].trim() === "");
}

// ─────────────────────────────────────────────────────────────────────────────
// Resource Estimation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimate resource requirements based on expected load.
 */
export function estimateResourceRequirements(params: {
  expectedConcurrentExecutions: number;
  avgMemoryPerExecutionMb: number;
  cpuIntensive?: boolean;
}): ResourceRequirements {
  const { expectedConcurrentExecutions, avgMemoryPerExecutionMb, cpuIntensive = false } = params;

  const baseCpu = 0.25;
  const baseMemory = 256;

  const totalMemoryMb = baseMemory + expectedConcurrentExecutions * avgMemoryPerExecutionMb;
  const cpuMultiplier = cpuIntensive ? 0.5 : 0.1;
  const totalCpu = baseCpu + expectedConcurrentExecutions * cpuMultiplier;

  // Round up to standard sizes
  const cpuStr = totalCpu <= 0.25 ? "250m"
    : totalCpu <= 0.5 ? "500m"
    : totalCpu <= 1 ? "1000m"
    : `${Math.ceil(totalCpu)}000m`;

  const memoryMb = Math.ceil(totalMemoryMb / 64) * 64; // round up to nearest 64MB
  const memoryStr = memoryMb >= 1024 ? `${Math.ceil(memoryMb / 1024)}Gi` : `${memoryMb}Mi`;

  return {
    cpu: cpuStr,
    memory: memoryStr,
    ephemeralStorage: "1Gi",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Docker Compose Generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a minimal Docker Compose configuration as a plain object.
 */
export function generateDockerComposeSpec(config: DeploymentConfig): {
  version: string;
  services: Record<string, {
    image: string;
    environment: string[];
    ports?: string[];
    depends_on?: string[];
    restart?: string;
  }>;
} {
  const services: Record<string, ReturnType<typeof generateDockerComposeSpec>["services"][string]> = {
    app: {
      image: `powernode:${config.version}`,
      environment: [
        "DATABASE_URL=${DATABASE_URL}",
        "NEXTAUTH_URL=${NEXTAUTH_URL}",
        "NEXTAUTH_SECRET=${NEXTAUTH_SECRET}",
        `NODE_ENV=${config.app.nodeEnv}`,
        `PORT=${config.app.port}`,
      ],
      ports: [`${config.app.port}:${config.app.port}`],
      restart: "unless-stopped",
      depends_on: ["postgres"],
    },
    postgres: {
      image: "postgres:15-alpine",
      environment: [
        "POSTGRES_DB=powernode",
        "POSTGRES_USER=powernode",
        "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}",
      ],
      restart: "unless-stopped",
    },
  };

  if (config.queue.type === "redis" || config.queue.type === "bullmq") {
    services.redis = {
      image: "redis:7-alpine",
      restart: "unless-stopped",
    };
    services.app.depends_on?.push("redis");
  }

  return { version: "3.8", services };
}

// ─────────────────────────────────────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a health check configuration.
 */
export function validateHealthCheck(config: {
  path: string;
  intervalSeconds?: number;
  timeoutSeconds?: number;
  failureThreshold?: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!config.path.startsWith("/")) {
    errors.push("health check path must start with /");
  }
  if (config.intervalSeconds && config.intervalSeconds < 5) {
    errors.push("health check interval should be at least 5 seconds");
  }
  if (config.timeoutSeconds && config.timeoutSeconds >= (config.intervalSeconds ?? 30)) {
    errors.push("health check timeout must be less than interval");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Get default health check config for a deployment.
 */
export function getDefaultHealthCheck(): {
  path: string;
  intervalSeconds: number;
  timeoutSeconds: number;
  failureThreshold: number;
} {
  return {
    path: "/api/health",
    intervalSeconds: 30,
    timeoutSeconds: 10,
    failureThreshold: 3,
  };
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
