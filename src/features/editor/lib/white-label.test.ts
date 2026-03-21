import { describe, it, expect } from "vitest";
import {
  validateWhiteLabelConfig,
  validateEmbedConfig,
  generateCssVariables,
  generateTheme,
  generateDarkModeOverrides,
  generateEmbedUrl,
  generateIframeSnippet,
  isOriginAllowed,
  applyFeatureDefaults,
  createWhiteLabelConfig,
  mergeWhiteLabelConfig,
  sanitizeForClient,
  type WhiteLabelConfig,
  type EmbedConfig,
  type BrandColors,
} from "./white-label";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const validColors: BrandColors = {
  primary: "#6366f1",
  primaryForeground: "#ffffff",
  secondary: "#8b5cf6",
  accent: "#f59e0b",
  background: "#ffffff",
  foreground: "#111827",
  border: "#e5e7eb",
};

const makeConfig = (overrides: Partial<WhiteLabelConfig> = {}): WhiteLabelConfig => ({
  id: "wl-1",
  name: "Acme Corp",
  colors: validColors,
  colorScheme: "light",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeEmbedConfig = (overrides: Partial<EmbedConfig> = {}): EmbedConfig => ({
  tenantId: "tenant-1",
  allowedOrigins: ["https://app.acme.com"],
  features: { showToolbar: true },
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// validateWhiteLabelConfig
// ─────────────────────────────────────────────────────────────────────────────

describe("validateWhiteLabelConfig", () => {
  it("passes valid config", () => {
    const result = validateWhiteLabelConfig(makeConfig());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when id is missing", () => {
    const result = validateWhiteLabelConfig(makeConfig({ id: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("id is required");
  });

  it("fails when name is missing", () => {
    const result = validateWhiteLabelConfig(makeConfig({ name: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("name is required");
  });

  it("fails on invalid hex color", () => {
    const result = validateWhiteLabelConfig(
      makeConfig({ colors: { primary: "not-a-color", primaryForeground: "#fff" } })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("colors.primary"))).toBe(true);
  });

  it("accepts 3-digit hex colors", () => {
    const result = validateWhiteLabelConfig(
      makeConfig({ colors: { primary: "#abc", primaryForeground: "#fff" } })
    );
    expect(result.valid).toBe(true);
  });

  it("warns when hiding attribution", () => {
    const result = validateWhiteLabelConfig(makeConfig({ hideAttribution: true }));
    expect(result.warnings.some((w) => w.includes("attribution"))).toBe(true);
  });

  it("fails on invalid logo URL", () => {
    const result = validateWhiteLabelConfig(
      makeConfig({ logo: { url: "not-a-url" } })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("logo.url"))).toBe(true);
  });

  it("fails on invalid domain in allowedDomains", () => {
    const result = validateWhiteLabelConfig(
      makeConfig({ allowedDomains: ["not-a-domain"] })
    );
    expect(result.valid).toBe(false);
  });

  it("accepts wildcard domain", () => {
    const result = validateWhiteLabelConfig(
      makeConfig({ allowedDomains: ["*.example.com"] })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects script tags in customCss", () => {
    const result = validateWhiteLabelConfig(
      makeConfig({ customCss: ".foo { color: red; } <script>alert(1)</script>" })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("script"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateEmbedConfig
// ─────────────────────────────────────────────────────────────────────────────

describe("validateEmbedConfig", () => {
  it("passes valid config", () => {
    const result = validateEmbedConfig(makeEmbedConfig());
    expect(result.valid).toBe(true);
  });

  it("fails when tenantId is missing", () => {
    const result = validateEmbedConfig(makeEmbedConfig({ tenantId: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("tenantId is required");
  });

  it("fails when allowedOrigins is empty", () => {
    const result = validateEmbedConfig(makeEmbedConfig({ allowedOrigins: [] }));
    expect(result.valid).toBe(false);
  });

  it("fails for invalid origin", () => {
    const result = validateEmbedConfig(makeEmbedConfig({ allowedOrigins: ["not-a-url"] }));
    expect(result.valid).toBe(false);
  });

  it("warns when readOnly + allowExport", () => {
    const result = validateEmbedConfig(
      makeEmbedConfig({ features: { readOnly: true, allowExport: true } })
    );
    expect(result.warnings.some((w) => w.includes("readOnly"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateCssVariables
// ─────────────────────────────────────────────────────────────────────────────

describe("generateCssVariables", () => {
  it("generates primary and primaryForeground vars", () => {
    const vars = generateCssVariables({ primary: "#6366f1", primaryForeground: "#fff" });
    expect(vars["--color-primary"]).toBe("#6366f1");
    expect(vars["--color-primary-foreground"]).toBe("#fff");
  });

  it("includes optional colors when provided", () => {
    const vars = generateCssVariables(validColors);
    expect(vars["--color-secondary"]).toBe("#8b5cf6");
    expect(vars["--color-accent"]).toBe("#f59e0b");
    expect(vars["--color-background"]).toBe("#ffffff");
  });

  it("skips undefined optional colors", () => {
    const vars = generateCssVariables({ primary: "#000", primaryForeground: "#fff" });
    expect("--color-secondary" in vars).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateTheme
// ─────────────────────────────────────────────────────────────────────────────

describe("generateTheme", () => {
  it("generates CSS string with variables", () => {
    const { cssString, cssVariables } = generateTheme(makeConfig());
    expect(cssString).toContain(":root {");
    expect(cssString).toContain("--color-primary");
    expect(cssVariables["--color-primary"]).toBe("#6366f1");
  });

  it("includes typography variables", () => {
    const config = makeConfig({
      typography: { fontFamily: "Inter, sans-serif", fontSize: "14px" },
    });
    const { cssString } = generateTheme(config);
    expect(cssString).toContain("--font-family");
    expect(cssString).toContain("Inter, sans-serif");
  });

  it("appends custom CSS after variables", () => {
    const config = makeConfig({ customCss: ".my-class { color: red; }" });
    const { cssString } = generateTheme(config);
    expect(cssString).toContain(".my-class");
    expect(cssString.indexOf(".my-class")).toBeGreaterThan(cssString.indexOf(":root"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateDarkModeOverrides
// ─────────────────────────────────────────────────────────────────────────────

describe("generateDarkModeOverrides", () => {
  it("generates dark mode CSS selector", () => {
    const css = generateDarkModeOverrides({ primary: "#818cf8", primaryForeground: "#fff" });
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain("--color-primary");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateEmbedUrl
// ─────────────────────────────────────────────────────────────────────────────

describe("generateEmbedUrl", () => {
  it("builds a valid embed URL", () => {
    const url = generateEmbedUrl({
      baseUrl: "https://powernode.example.com",
      workflowId: "wf-123",
      config: makeEmbedConfig(),
    });
    expect(url).toContain("/embed/workflows/wf-123");
    expect(url).toContain("tenantId=tenant-1");
  });

  it("includes token in URL", () => {
    const url = generateEmbedUrl({
      baseUrl: "https://powernode.example.com",
      workflowId: "wf-1",
      config: makeEmbedConfig({ authentication: { mode: "jwt", tokenParam: "jwt" } }),
      token: "my-jwt-token",
    });
    expect(url).toContain("jwt=my-jwt-token");
  });

  it("adds readOnly param", () => {
    const url = generateEmbedUrl({
      baseUrl: "https://powernode.example.com",
      workflowId: "wf-1",
      config: makeEmbedConfig({ features: { readOnly: true } }),
    });
    expect(url).toContain("readOnly=1");
  });

  it("adds hideToolbar when showToolbar is false", () => {
    const url = generateEmbedUrl({
      baseUrl: "https://powernode.example.com",
      workflowId: "wf-1",
      config: makeEmbedConfig({ features: { showToolbar: false } }),
    });
    expect(url).toContain("hideToolbar=1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateIframeSnippet
// ─────────────────────────────────────────────────────────────────────────────

describe("generateIframeSnippet", () => {
  it("generates an iframe HTML snippet", () => {
    const html = generateIframeSnippet({ embedUrl: "https://example.com/embed/wf-1" });
    expect(html).toContain("<iframe");
    expect(html).toContain("https://example.com/embed/wf-1");
    expect(html).toContain("border: none");
  });

  it("uses custom layout dimensions", () => {
    const html = generateIframeSnippet({
      embedUrl: "https://example.com/embed/wf-1",
      layout: { width: "800px", height: "500px" },
    });
    expect(html).toContain('width="800px"');
    expect(html).toContain('height="500px"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isOriginAllowed
// ─────────────────────────────────────────────────────────────────────────────

describe("isOriginAllowed", () => {
  const config = makeEmbedConfig({
    allowedOrigins: ["https://app.acme.com", "*.staging.acme.com", "*"],
  });

  it("allows exact origin match", () => {
    expect(isOriginAllowed("https://app.acme.com", makeEmbedConfig({ allowedOrigins: ["https://app.acme.com"] }))).toBe(true);
  });

  it("allows wildcard *", () => {
    expect(isOriginAllowed("https://anything.example.com", makeEmbedConfig({ allowedOrigins: ["*"] }))).toBe(true);
  });

  it("allows subdomain with wildcard", () => {
    const subConfig = makeEmbedConfig({ allowedOrigins: ["*.acme.com"] });
    expect(isOriginAllowed("sub.acme.com", subConfig)).toBe(true);
    expect(isOriginAllowed("other.acme.com", subConfig)).toBe(true);
  });

  it("rejects non-matching origins", () => {
    const strictConfig = makeEmbedConfig({ allowedOrigins: ["https://app.acme.com"] });
    expect(isOriginAllowed("https://evil.com", strictConfig)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyFeatureDefaults
// ─────────────────────────────────────────────────────────────────────────────

describe("applyFeatureDefaults", () => {
  it("fills in defaults for empty flags", () => {
    const defaults = applyFeatureDefaults({});
    expect(defaults.showToolbar).toBe(true);
    expect(defaults.showMinimap).toBe(true);
    expect(defaults.readOnly).toBe(false);
    expect(defaults.allowExport).toBe(false);
  });

  it("preserves explicitly set values", () => {
    const flags = applyFeatureDefaults({ readOnly: true, allowExport: true });
    expect(flags.readOnly).toBe(true);
    expect(flags.allowExport).toBe(true);
    expect(flags.showToolbar).toBe(true); // default
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createWhiteLabelConfig
// ─────────────────────────────────────────────────────────────────────────────

describe("createWhiteLabelConfig", () => {
  it("creates config with generated id", () => {
    const config = createWhiteLabelConfig({ name: "Test", colors: validColors });
    expect(config.id).toBeTruthy();
    expect(config.id.startsWith("wl-")).toBe(true);
    expect(config.colorScheme).toBe("system");
    expect(config.hideAttribution).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mergeWhiteLabelConfig
// ─────────────────────────────────────────────────────────────────────────────

describe("mergeWhiteLabelConfig", () => {
  it("merges color overrides", () => {
    const base = makeConfig();
    const merged = mergeWhiteLabelConfig(base, {
      colors: { primary: "#ff0000", primaryForeground: "#fff" },
    });
    expect(merged.colors.primary).toBe("#ff0000");
    expect(merged.colors.secondary).toBe("#8b5cf6"); // preserved from base
  });

  it("updates updatedAt", () => {
    const base = makeConfig();
    const before = base.updatedAt;
    const merged = mergeWhiteLabelConfig(base, { name: "New Name" });
    expect(merged.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sanitizeForClient
// ─────────────────────────────────────────────────────────────────────────────

describe("sanitizeForClient", () => {
  it("removes id and allowedDomains", () => {
    const config = makeConfig({ allowedDomains: ["example.com"] });
    const sanitized = sanitizeForClient(config);
    expect("id" in sanitized).toBe(false);
    expect("allowedDomains" in sanitized).toBe(false);
    expect(sanitized.name).toBe("Acme Corp");
  });
});
