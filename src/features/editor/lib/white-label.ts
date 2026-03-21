/**
 * Phase 41 — White-labeling & Embed Mode
 * Pure utilities for white-labeling the PowerNode editor and
 * embedding it inside third-party applications.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ColorScheme = "light" | "dark" | "system";

export interface BrandColors {
  primary: string;          // hex color, e.g., "#6366f1"
  primaryForeground: string;
  secondary?: string;
  accent?: string;
  background?: string;
  foreground?: string;
  border?: string;
  destructive?: string;
}

export interface BrandTypography {
  fontFamily?: string;       // CSS font-family value
  fontSize?: string;         // base font size, e.g., "14px"
  headingFontFamily?: string;
}

export interface LogoConfig {
  url?: string;              // URL to logo image
  text?: string;             // text-only logo fallback
  width?: number;
  height?: number;
  darkModeUrl?: string;      // separate dark mode logo
}

export interface WhiteLabelConfig {
  id: string;
  name: string;              // client/tenant name
  colors: BrandColors;
  typography?: BrandTypography;
  logo?: LogoConfig;
  colorScheme?: ColorScheme;
  customCss?: string;        // additional CSS overrides
  hideAttribution?: boolean; // hide "Powered by PowerNode"
  hiddenFeatures?: string[]; // feature flags to hide
  allowedDomains?: string[]; // CORS/embed allowed origins
  createdAt: Date;
  updatedAt: Date;
}

export interface EmbedConfig {
  tenantId: string;
  whiteLabelId?: string;
  allowedOrigins: string[];
  features: EmbedFeatureFlags;
  layout?: EmbedLayout;
  authentication?: EmbedAuthConfig;
  onEvents?: string[];       // list of events to emit to host
}

export interface EmbedFeatureFlags {
  showToolbar?: boolean;
  showMinimap?: boolean;
  showExecutionHistory?: boolean;
  showNodeLibrary?: boolean;
  allowExport?: boolean;
  allowImport?: boolean;
  allowSettings?: boolean;
  readOnly?: boolean;
}

export interface EmbedLayout {
  width?: string;            // CSS width, e.g., "100%", "800px"
  height?: string;           // CSS height, e.g., "600px", "100vh"
  borderRadius?: string;
  padding?: string;
}

export interface EmbedAuthConfig {
  mode: "jwt" | "api_key" | "oauth";
  tokenParam?: string;       // query param name for token
}

export interface GeneratedTheme {
  cssVariables: Record<string, string>;
  cssString: string;
}

export interface WhiteLabelValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a white-label configuration.
 */
export function validateWhiteLabelConfig(config: WhiteLabelConfig): WhiteLabelValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.id) errors.push("id is required");
  if (!config.name) errors.push("name is required");

  if (!config.colors.primary) errors.push("colors.primary is required");
  if (!config.colors.primaryForeground) errors.push("colors.primaryForeground is required");

  if (config.colors.primary && !isValidHexColor(config.colors.primary)) {
    errors.push(`colors.primary must be a valid hex color (got: ${config.colors.primary})`);
  }
  if (config.colors.primaryForeground && !isValidHexColor(config.colors.primaryForeground)) {
    errors.push(`colors.primaryForeground must be a valid hex color`);
  }

  if (config.logo?.url && !isValidUrl(config.logo.url)) {
    errors.push("logo.url must be a valid URL");
  }
  if (config.logo?.darkModeUrl && !isValidUrl(config.logo.darkModeUrl)) {
    errors.push("logo.darkModeUrl must be a valid URL");
  }

  if (config.allowedDomains) {
    for (const domain of config.allowedDomains) {
      if (!isValidDomainOrWildcard(domain)) {
        errors.push(`Invalid domain in allowedDomains: ${domain}`);
      }
    }
  }

  if (config.customCss && config.customCss.includes("<script")) {
    errors.push("customCss must not contain script tags");
  }

  if (!config.logo?.url && !config.logo?.text) {
    warnings.push("No logo configured — default PowerNode logo will be used");
  }
  if (config.hideAttribution) {
    warnings.push("Hiding attribution requires an Enterprise plan");
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate an embed configuration.
 */
export function validateEmbedConfig(config: EmbedConfig): WhiteLabelValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.tenantId) errors.push("tenantId is required");
  if (!config.allowedOrigins || config.allowedOrigins.length === 0) {
    errors.push("At least one allowedOrigin is required");
  }

  for (const origin of config.allowedOrigins ?? []) {
    if (!isValidOrigin(origin)) {
      errors.push(`Invalid origin: ${origin}`);
    }
  }

  if (config.features.readOnly && config.features.allowExport) {
    warnings.push("readOnly mode is set but allowExport is also enabled");
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate CSS custom properties (variables) from a brand color config.
 */
export function generateCssVariables(colors: BrandColors): Record<string, string> {
  const vars: Record<string, string> = {
    "--color-primary": colors.primary,
    "--color-primary-foreground": colors.primaryForeground,
  };

  if (colors.secondary) vars["--color-secondary"] = colors.secondary;
  if (colors.accent) vars["--color-accent"] = colors.accent;
  if (colors.background) vars["--color-background"] = colors.background;
  if (colors.foreground) vars["--color-foreground"] = colors.foreground;
  if (colors.border) vars["--color-border"] = colors.border;
  if (colors.destructive) vars["--color-destructive"] = colors.destructive;

  return vars;
}

/**
 * Generate a complete CSS theme string from a white-label config.
 */
export function generateTheme(config: WhiteLabelConfig): GeneratedTheme {
  const cssVariables = generateCssVariables(config.colors);

  if (config.typography?.fontFamily) {
    cssVariables["--font-family"] = config.typography.fontFamily;
  }
  if (config.typography?.fontSize) {
    cssVariables["--font-size-base"] = config.typography.fontSize;
  }
  if (config.typography?.headingFontFamily) {
    cssVariables["--font-family-heading"] = config.typography.headingFontFamily;
  }

  const varLines = Object.entries(cssVariables)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");

  let cssString = `:root {\n${varLines}\n}`;

  if (config.customCss) {
    cssString += `\n\n/* Custom CSS */\n${config.customCss}`;
  }

  return { cssVariables, cssString };
}

/**
 * Apply theme overrides for dark mode.
 */
export function generateDarkModeOverrides(colors: Partial<BrandColors>): string {
  const vars = generateCssVariables({
    primary: colors.primary ?? "",
    primaryForeground: colors.primaryForeground ?? "",
    ...colors,
  });

  const overrides = Object.entries(vars)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");

  return `[data-theme="dark"] {\n${overrides}\n}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Embed Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate an embed URL for an iframe.
 */
export function generateEmbedUrl(params: {
  baseUrl: string;
  workflowId: string;
  config: EmbedConfig;
  token?: string;
}): string {
  const { baseUrl, workflowId, config, token } = params;
  const url = new URL(`${baseUrl}/embed/workflows/${workflowId}`);

  url.searchParams.set("tenantId", config.tenantId);
  if (config.whiteLabelId) url.searchParams.set("theme", config.whiteLabelId);
  if (token) {
    const tokenParam = config.authentication?.tokenParam ?? "token";
    url.searchParams.set(tokenParam, token);
  }
  if (config.features.readOnly) url.searchParams.set("readOnly", "1");
  if (!config.features.showToolbar) url.searchParams.set("hideToolbar", "1");
  if (!config.features.showMinimap) url.searchParams.set("hideMinimap", "1");

  return url.toString();
}

/**
 * Generate an HTML iframe snippet for embedding.
 */
export function generateIframeSnippet(params: {
  embedUrl: string;
  layout?: EmbedLayout;
  title?: string;
}): string {
  const { embedUrl, layout = {}, title = "PowerNode Workflow Editor" } = params;
  const width = layout.width ?? "100%";
  const height = layout.height ?? "600px";
  const borderRadius = layout.borderRadius ?? "8px";

  return `<iframe
  src="${embedUrl}"
  width="${width}"
  height="${height}"
  style="border: none; border-radius: ${borderRadius};"
  title="${title}"
  allow="clipboard-read; clipboard-write"
></iframe>`.trim();
}

/**
 * Check if a request origin is allowed by an embed config.
 */
export function isOriginAllowed(origin: string, config: EmbedConfig): boolean {
  return config.allowedOrigins.some((allowed) => {
    if (allowed === "*") return true;
    if (allowed.startsWith("*.")) {
      const baseDomain = allowed.slice(2);
      return origin.endsWith(`.${baseDomain}`) || origin === baseDomain;
    }
    return origin === allowed;
  });
}

/**
 * Apply feature flag defaults (fill in missing booleans).
 */
export function applyFeatureDefaults(flags: EmbedFeatureFlags): Required<EmbedFeatureFlags> {
  return {
    showToolbar: flags.showToolbar ?? true,
    showMinimap: flags.showMinimap ?? true,
    showExecutionHistory: flags.showExecutionHistory ?? true,
    showNodeLibrary: flags.showNodeLibrary ?? true,
    allowExport: flags.allowExport ?? false,
    allowImport: flags.allowImport ?? false,
    allowSettings: flags.allowSettings ?? false,
    readOnly: flags.readOnly ?? false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// White-label Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new white-label configuration with defaults.
 */
export function createWhiteLabelConfig(params: {
  name: string;
  colors: BrandColors;
  logo?: LogoConfig;
  typography?: BrandTypography;
}): WhiteLabelConfig {
  return {
    id: `wl-${generateId()}`,
    name: params.name,
    colors: params.colors,
    logo: params.logo,
    typography: params.typography,
    colorScheme: "system",
    hideAttribution: false,
    hiddenFeatures: [],
    allowedDomains: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Merge a partial white-label config into an existing one.
 */
export function mergeWhiteLabelConfig(
  base: WhiteLabelConfig,
  overrides: Partial<WhiteLabelConfig>
): WhiteLabelConfig {
  return {
    ...base,
    ...overrides,
    colors: { ...base.colors, ...overrides.colors },
    typography: { ...base.typography, ...overrides.typography },
    logo: { ...base.logo, ...overrides.logo },
    updatedAt: new Date(),
  };
}

/**
 * Extract a sanitized version of a white-label config (safe to send to client).
 * Removes internal fields.
 */
export function sanitizeForClient(config: WhiteLabelConfig): Omit<WhiteLabelConfig, "id" | "allowedDomains"> {
  const { id: _id, allowedDomains: _domains, ...rest } = config;
  void _id; void _domains;
  return rest;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isValidHexColor(color: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(color);
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function isValidDomainOrWildcard(domain: string): boolean {
  if (domain === "*") return true;
  if (domain.startsWith("*.")) {
    return /^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/.test(domain.slice(2));
  }
  return /^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/.test(domain);
}

function isValidOrigin(origin: string): boolean {
  if (origin === "*") return true;
  try {
    const u = new URL(origin);
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
