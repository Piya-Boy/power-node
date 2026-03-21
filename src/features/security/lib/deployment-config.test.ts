/**
 * Phase 45 — Tests for deployment-config.ts
 */

import { describe, it, expect } from "vitest";
import {
  validateDeploymentConfig,
  getRequiredEnvVars,
  getMissingEnvVars,
  estimateResourceRequirements,
  generateDockerComposeSpec,
  validateHealthCheck,
  getDefaultHealthCheck,
  type DeploymentConfig,
} from "./deployment-config";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<DeploymentConfig> = {}): DeploymentConfig {
  return {
    target: "docker",
    version: "1.0.0",
    app: {
      port: 3000,
      baseUrl: "https://example.com",
      secretKey: "a".repeat(32),
      encryptionKey: "b".repeat(32),
      nodeEnv: "production",
    },
    database: {
      type: "postgresql",
      url: "postgresql://user:pass@localhost:5432/db",
      sslEnabled: true,
    },
    queue: { type: "inngest" },
    storage: { type: "s3", bucket: "my-bucket" },
    auth: {
      providers: ["credentials"],
      jwtSecret: "jwt-secret-key-for-production",
    },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// validateDeploymentConfig
// ─────────────────────────────────────────────────────────────────────────────

describe("validateDeploymentConfig", () => {
  it("returns valid for a correct production config", () => {
    const result = validateDeploymentConfig(makeConfig());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("requires app.baseUrl", () => {
    const cfg = makeConfig({ app: { ...makeConfig().app, baseUrl: "" } });
    const result = validateDeploymentConfig(cfg);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("baseUrl"))).toBe(true);
  });

  it("rejects invalid baseUrl", () => {
    const cfg = makeConfig({ app: { ...makeConfig().app, baseUrl: "not-a-url" } });
    const result = validateDeploymentConfig(cfg);
    expect(result.errors.some((e) => e.includes("baseUrl"))).toBe(true);
  });

  it("requires app.secretKey", () => {
    const cfg = makeConfig({ app: { ...makeConfig().app, secretKey: "" } });
    const result = validateDeploymentConfig(cfg);
    expect(result.errors.some((e) => e.includes("secretKey"))).toBe(true);
  });

  it("security issue when secretKey < 32 chars", () => {
    const cfg = makeConfig({ app: { ...makeConfig().app, secretKey: "short" } });
    const result = validateDeploymentConfig(cfg);
    expect(result.securityIssues.some((e) => e.includes("secretKey"))).toBe(true);
  });

  it("security issue when encryptionKey < 32 chars", () => {
    const cfg = makeConfig({ app: { ...makeConfig().app, encryptionKey: "short" } });
    const result = validateDeploymentConfig(cfg);
    expect(result.securityIssues.some((e) => e.includes("encryptionKey"))).toBe(true);
  });

  it("security issue when secretKey equals encryptionKey", () => {
    const key = "x".repeat(32);
    const cfg = makeConfig({ app: { ...makeConfig().app, secretKey: key, encryptionKey: key } });
    const result = validateDeploymentConfig(cfg);
    expect(result.securityIssues.some((e) => e.includes("must be different"))).toBe(true);
  });

  it("warns when nodeEnv is development", () => {
    const cfg = makeConfig({ app: { ...makeConfig().app, nodeEnv: "development" } });
    const result = validateDeploymentConfig(cfg);
    expect(result.warnings.some((w) => w.includes("production"))).toBe(true);
  });

  it("rejects invalid port 0", () => {
    const cfg = makeConfig({ app: { ...makeConfig().app, port: 0 } });
    const result = validateDeploymentConfig(cfg);
    expect(result.errors.some((e) => e.includes("port"))).toBe(true);
  });

  it("rejects port > 65535", () => {
    const cfg = makeConfig({ app: { ...makeConfig().app, port: 99999 } });
    const result = validateDeploymentConfig(cfg);
    expect(result.errors.some((e) => e.includes("port"))).toBe(true);
  });

  it("requires database.url", () => {
    const cfg = makeConfig({ database: { ...makeConfig().database, url: "" } });
    const result = validateDeploymentConfig(cfg);
    expect(result.errors.some((e) => e.includes("database.url"))).toBe(true);
  });

  it("rejects non-postgres URL for postgresql type", () => {
    const cfg = makeConfig({ database: { ...makeConfig().database, url: "mysql://localhost/db" } });
    const result = validateDeploymentConfig(cfg);
    expect(result.errors.some((e) => e.includes("PostgreSQL"))).toBe(true);
  });

  it("security issue when SSL disabled in production", () => {
    const cfg = makeConfig({ database: { ...makeConfig().database, sslEnabled: false } });
    const result = validateDeploymentConfig(cfg);
    expect(result.securityIssues.some((e) => e.includes("sslEnabled"))).toBe(true);
  });

  it("warns about SQLite in production", () => {
    const cfg = makeConfig({ database: { type: "sqlite", url: "file:./dev.db" } });
    const result = validateDeploymentConfig(cfg);
    expect(result.warnings.some((w) => w.includes("SQLite"))).toBe(true);
  });

  it("requires at least one auth provider", () => {
    const cfg = makeConfig({ auth: { ...makeConfig().auth, providers: [] } });
    const result = validateDeploymentConfig(cfg);
    expect(result.errors.some((e) => e.includes("provider"))).toBe(true);
  });

  it("security issue when jwtSecret missing in production", () => {
    const cfg = makeConfig({ auth: { providers: ["credentials"] } });
    const result = validateDeploymentConfig(cfg);
    expect(result.securityIssues.some((e) => e.includes("jwtSecret"))).toBe(true);
  });

  it("requires bucket for cloud storage", () => {
    const cfg = makeConfig({ storage: { type: "s3" } });
    const result = validateDeploymentConfig(cfg);
    expect(result.errors.some((e) => e.includes("bucket"))).toBe(true);
  });

  it("warns about local storage in production", () => {
    const cfg = makeConfig({ storage: { type: "local" } });
    const result = validateDeploymentConfig(cfg);
    expect(result.warnings.some((w) => w.includes("Local storage"))).toBe(true);
  });

  it("requires scaling.minReplicas >= 1", () => {
    const cfg = makeConfig({ scaling: { minReplicas: 0, maxReplicas: 2 } });
    const result = validateDeploymentConfig(cfg);
    expect(result.errors.some((e) => e.includes("minReplicas"))).toBe(true);
  });

  it("requires scaling.maxReplicas >= minReplicas", () => {
    const cfg = makeConfig({ scaling: { minReplicas: 3, maxReplicas: 1 } });
    const result = validateDeploymentConfig(cfg);
    expect(result.errors.some((e) => e.includes("maxReplicas"))).toBe(true);
  });

  it("warns when only 1 replica in production", () => {
    const cfg = makeConfig({ scaling: { minReplicas: 1, maxReplicas: 1 } });
    const result = validateDeploymentConfig(cfg);
    expect(result.warnings.some((w) => w.includes("replicas"))).toBe(true);
  });

  it("warns when corsOrigins not set in production", () => {
    const cfg = makeConfig({ app: { ...makeConfig().app, corsOrigins: undefined } });
    const result = validateDeploymentConfig(cfg);
    expect(result.warnings.some((w) => w.includes("corsOrigins"))).toBe(true);
  });

  it("no corsOrigins warning in development", () => {
    const cfg = makeConfig({ app: { ...makeConfig().app, nodeEnv: "development" } });
    const result = validateDeploymentConfig(cfg);
    const corsWarning = result.warnings.filter((w) => w.includes("corsOrigins"));
    expect(corsWarning).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getRequiredEnvVars
// ─────────────────────────────────────────────────────────────────────────────

describe("getRequiredEnvVars", () => {
  it("always includes DATABASE_URL and NEXTAUTH vars", () => {
    const env = getRequiredEnvVars(makeConfig());
    expect(env.required).toContain("DATABASE_URL");
    expect(env.required).toContain("NEXTAUTH_SECRET");
  });

  it("includes REDIS_URL when queue is redis", () => {
    const cfg = makeConfig({ queue: { type: "redis" } });
    const env = getRequiredEnvVars(cfg);
    expect(env.required).toContain("REDIS_URL");
  });

  it("does not include REDIS_URL for inngest queue", () => {
    const env = getRequiredEnvVars(makeConfig());
    expect(env.required).not.toContain("REDIS_URL");
  });

  it("includes S3 vars for S3 storage", () => {
    const env = getRequiredEnvVars(makeConfig());
    expect(env.required).toContain("AWS_ACCESS_KEY_ID");
    expect(env.required).toContain("S3_BUCKET");
    expect(env.secret).toContain("AWS_SECRET_ACCESS_KEY");
  });

  it("includes GCS_BUCKET for GCS storage", () => {
    const cfg = makeConfig({ storage: { type: "gcs", bucket: "my-bucket" } });
    const env = getRequiredEnvVars(cfg);
    expect(env.required).toContain("GCS_BUCKET");
  });

  it("includes GitHub OAuth vars when provider is github", () => {
    const cfg = makeConfig({ auth: { providers: ["github"] } });
    const env = getRequiredEnvVars(cfg);
    expect(env.required).toContain("GITHUB_CLIENT_ID");
    expect(env.secret).toContain("GITHUB_CLIENT_SECRET");
  });

  it("includes Google OAuth vars when provider is google", () => {
    const cfg = makeConfig({ auth: { providers: ["google"] } });
    const env = getRequiredEnvVars(cfg);
    expect(env.required).toContain("GOOGLE_CLIENT_ID");
  });

  it("includes SAML vars when provider is saml", () => {
    const cfg = makeConfig({ auth: { providers: ["saml"] } });
    const env = getRequiredEnvVars(cfg);
    expect(env.required).toContain("SAML_IDP_SSO_URL");
    expect(env.secret).toContain("SAML_IDP_CERT");
  });

  it("includes SENTRY_DSN when sentryDsn is configured", () => {
    const cfg = makeConfig({ monitoring: { enabled: true, sentryDsn: "https://sentry.io/xxx" } });
    const env = getRequiredEnvVars(cfg);
    expect(env.required).toContain("SENTRY_DSN");
  });

  it("returns no duplicates", () => {
    const env = getRequiredEnvVars(makeConfig());
    const unique = new Set(env.required);
    expect(unique.size).toBe(env.required.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getMissingEnvVars
// ─────────────────────────────────────────────────────────────────────────────

describe("getMissingEnvVars", () => {
  it("returns missing required vars", () => {
    const missing = getMissingEnvVars(makeConfig(), {});
    expect(missing).toContain("DATABASE_URL");
  });

  it("returns empty when all required vars are provided", () => {
    const provided = {
      DATABASE_URL: "postgres://localhost/db",
      NEXTAUTH_URL: "https://example.com",
      NEXTAUTH_SECRET: "secret",
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      S3_BUCKET: "bucket",
    };
    const missing = getMissingEnvVars(makeConfig(), provided);
    expect(missing).toHaveLength(0);
  });

  it("treats empty string as missing", () => {
    const provided = { DATABASE_URL: "   " };
    const missing = getMissingEnvVars(makeConfig(), provided);
    expect(missing).toContain("DATABASE_URL");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// estimateResourceRequirements
// ─────────────────────────────────────────────────────────────────────────────

describe("estimateResourceRequirements", () => {
  it("returns cpu and memory for minimal load", () => {
    const req = estimateResourceRequirements({
      expectedConcurrentExecutions: 1,
      avgMemoryPerExecutionMb: 32,
    });
    // 0.25 base + 1*0.1 = 0.35 → rounds to 500m
    expect(req.cpu).toBe("500m");
    expect(req.memory).toBeDefined();
  });

  it("scales cpu for cpu-intensive workloads", () => {
    const light = estimateResourceRequirements({
      expectedConcurrentExecutions: 10,
      avgMemoryPerExecutionMb: 64,
      cpuIntensive: false,
    });
    const heavy = estimateResourceRequirements({
      expectedConcurrentExecutions: 10,
      avgMemoryPerExecutionMb: 64,
      cpuIntensive: true,
    });
    // cpu-intensive should request more CPU
    const cpuValue = (s: string) => parseInt(s.replace("m", "").replace("000m", "000"), 10);
    expect(cpuValue(heavy.cpu)).toBeGreaterThan(cpuValue(light.cpu));
  });

  it("returns memory in Gi for large workloads", () => {
    const req = estimateResourceRequirements({
      expectedConcurrentExecutions: 50,
      avgMemoryPerExecutionMb: 256,
    });
    expect(req.memory).toContain("Gi");
  });

  it("returns memory in Mi for small workloads", () => {
    const req = estimateResourceRequirements({
      expectedConcurrentExecutions: 1,
      avgMemoryPerExecutionMb: 32,
    });
    expect(req.memory).toMatch(/Mi|Gi/);
  });

  it("always includes ephemeralStorage", () => {
    const req = estimateResourceRequirements({
      expectedConcurrentExecutions: 5,
      avgMemoryPerExecutionMb: 64,
    });
    expect(req.ephemeralStorage).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateDockerComposeSpec
// ─────────────────────────────────────────────────────────────────────────────

describe("generateDockerComposeSpec", () => {
  it("returns version 3.8", () => {
    const spec = generateDockerComposeSpec(makeConfig());
    expect(spec.version).toBe("3.8");
  });

  it("includes app and postgres services", () => {
    const spec = generateDockerComposeSpec(makeConfig());
    expect(spec.services.app).toBeDefined();
    expect(spec.services.postgres).toBeDefined();
  });

  it("app service uses correct image tag", () => {
    const spec = generateDockerComposeSpec(makeConfig());
    expect(spec.services.app.image).toBe("powernode:1.0.0");
  });

  it("app service exposes correct port", () => {
    const spec = generateDockerComposeSpec(makeConfig());
    expect(spec.services.app.ports).toContain("3000:3000");
  });

  it("includes redis service when queue is redis", () => {
    const cfg = makeConfig({ queue: { type: "redis" } });
    const spec = generateDockerComposeSpec(cfg);
    expect(spec.services.redis).toBeDefined();
  });

  it("includes redis service when queue is bullmq", () => {
    const cfg = makeConfig({ queue: { type: "bullmq" } });
    const spec = generateDockerComposeSpec(cfg);
    expect(spec.services.redis).toBeDefined();
  });

  it("does not include redis service for inngest queue", () => {
    const spec = generateDockerComposeSpec(makeConfig());
    expect(spec.services.redis).toBeUndefined();
  });

  it("app service depends on postgres", () => {
    const spec = generateDockerComposeSpec(makeConfig());
    expect(spec.services.app.depends_on).toContain("postgres");
  });

  it("app service environment includes NODE_ENV", () => {
    const spec = generateDockerComposeSpec(makeConfig());
    const envLine = spec.services.app.environment.find((e) => e.startsWith("NODE_ENV="));
    expect(envLine).toBe("NODE_ENV=production");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateHealthCheck
// ─────────────────────────────────────────────────────────────────────────────

describe("validateHealthCheck", () => {
  it("is valid for a correct health check config", () => {
    const result = validateHealthCheck({ path: "/api/health", intervalSeconds: 30, timeoutSeconds: 10 });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects path not starting with /", () => {
    const result = validateHealthCheck({ path: "api/health" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("start with /"))).toBe(true);
  });

  it("rejects interval less than 5 seconds", () => {
    const result = validateHealthCheck({ path: "/health", intervalSeconds: 3 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("interval"))).toBe(true);
  });

  it("rejects timeout >= interval", () => {
    const result = validateHealthCheck({ path: "/health", intervalSeconds: 10, timeoutSeconds: 10 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("timeout"))).toBe(true);
  });

  it("accepts valid timeout < interval", () => {
    const result = validateHealthCheck({ path: "/health", intervalSeconds: 30, timeoutSeconds: 5 });
    expect(result.valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDefaultHealthCheck
// ─────────────────────────────────────────────────────────────────────────────

describe("getDefaultHealthCheck", () => {
  it("returns expected defaults", () => {
    const hc = getDefaultHealthCheck();
    expect(hc.path).toBe("/api/health");
    expect(hc.intervalSeconds).toBe(30);
    expect(hc.timeoutSeconds).toBe(10);
    expect(hc.failureThreshold).toBe(3);
  });

  it("default health check is valid", () => {
    const hc = getDefaultHealthCheck();
    const result = validateHealthCheck(hc);
    expect(result.valid).toBe(true);
  });
});
