/**
 * Phase 63 — Workflow Localization & i18n Utilities
 * Pure utilities for locale detection, message formatting, pluralization,
 * date/number/currency formatting, and RTL support.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SupportedLocale =
  | "en"
  | "th"
  | "ja"
  | "zh"
  | "de"
  | "fr"
  | "es"
  | "ar"
  | "he"
  | "ko";

export type TextDirection = "ltr" | "rtl";

export interface LocaleConfig {
  locale: SupportedLocale;
  direction: TextDirection;
  numberSeparator: string;     // thousands separator
  decimalSeparator: string;
  currencySymbol: string;
  dateFormat: string;          // e.g. "YYYY-MM-DD"
  timeFormat: "12h" | "24h";
  pluralRules: PluralCategory[];
}

export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

export interface TranslationMessage {
  key: string;
  locale: SupportedLocale;
  value: string;
  pluralForms?: Record<PluralCategory, string>;
  interpolationKeys?: string[];
}

export interface FormatOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  style?: "decimal" | "percent" | "currency";
  currency?: string;
  notation?: "standard" | "compact";
}

// ─────────────────────────────────────────────────────────────────────────────
// Locale Config
// ─────────────────────────────────────────────────────────────────────────────

const LOCALE_CONFIGS: Record<SupportedLocale, LocaleConfig> = {
  en: { locale: "en", direction: "ltr", numberSeparator: ",", decimalSeparator: ".", currencySymbol: "$", dateFormat: "MM/DD/YYYY", timeFormat: "12h", pluralRules: ["one", "other"] },
  th: { locale: "th", direction: "ltr", numberSeparator: ",", decimalSeparator: ".", currencySymbol: "฿", dateFormat: "DD/MM/YYYY", timeFormat: "24h", pluralRules: ["other"] },
  ja: { locale: "ja", direction: "ltr", numberSeparator: ",", decimalSeparator: ".", currencySymbol: "¥", dateFormat: "YYYY/MM/DD", timeFormat: "24h", pluralRules: ["other"] },
  zh: { locale: "zh", direction: "ltr", numberSeparator: ",", decimalSeparator: ".", currencySymbol: "¥", dateFormat: "YYYY/MM/DD", timeFormat: "24h", pluralRules: ["other"] },
  de: { locale: "de", direction: "ltr", numberSeparator: ".", decimalSeparator: ",", currencySymbol: "€", dateFormat: "DD.MM.YYYY", timeFormat: "24h", pluralRules: ["one", "other"] },
  fr: { locale: "fr", direction: "ltr", numberSeparator: " ", decimalSeparator: ",", currencySymbol: "€", dateFormat: "DD/MM/YYYY", timeFormat: "24h", pluralRules: ["one", "other"] },
  es: { locale: "es", direction: "ltr", numberSeparator: ".", decimalSeparator: ",", currencySymbol: "€", dateFormat: "DD/MM/YYYY", timeFormat: "24h", pluralRules: ["one", "other"] },
  ar: { locale: "ar", direction: "rtl", numberSeparator: ",", decimalSeparator: ".", currencySymbol: "﷼", dateFormat: "DD/MM/YYYY", timeFormat: "12h", pluralRules: ["zero", "one", "two", "few", "many", "other"] },
  he: { locale: "he", direction: "rtl", numberSeparator: ",", decimalSeparator: ".", currencySymbol: "₪", dateFormat: "DD/MM/YYYY", timeFormat: "24h", pluralRules: ["one", "two", "many", "other"] },
  ko: { locale: "ko", direction: "ltr", numberSeparator: ",", decimalSeparator: ".", currencySymbol: "₩", dateFormat: "YYYY.MM.DD", timeFormat: "12h", pluralRules: ["other"] },
};

/**
 * Get locale configuration for a locale code.
 */
export function getLocaleConfig(locale: SupportedLocale): LocaleConfig {
  return LOCALE_CONFIGS[locale];
}

/**
 * Get all supported locales.
 */
export function getSupportedLocales(): SupportedLocale[] {
  return Object.keys(LOCALE_CONFIGS) as SupportedLocale[];
}

/**
 * Check if a locale is supported.
 */
export function isSupported(locale: string): locale is SupportedLocale {
  return locale in LOCALE_CONFIGS;
}

/**
 * Get text direction for a locale.
 */
export function getTextDirection(locale: SupportedLocale): TextDirection {
  return LOCALE_CONFIGS[locale].direction;
}

/**
 * Check if a locale uses RTL text direction.
 */
export function isRtl(locale: SupportedLocale): boolean {
  return LOCALE_CONFIGS[locale].direction === "rtl";
}

// ─────────────────────────────────────────────────────────────────────────────
// Message Interpolation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interpolate a message template with variables.
 * Supports {{variableName}} syntax.
 */
export function interpolate(
  template: string,
  variables: Record<string, string | number>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = variables[key];
    return value !== undefined ? String(value) : `{{${key}}}`;
  });
}

/**
 * Extract interpolation keys from a template.
 */
export function extractInterpolationKeys(template: string): string[] {
  const matches = template.matchAll(/\{\{(\w+)\}\}/g);
  const keys = new Set<string>();
  for (const match of matches) {
    keys.add(match[1]);
  }
  return [...keys];
}

/**
 * Validate that a message template has all required variable keys.
 */
export function validateTemplate(
  template: string,
  requiredKeys: string[]
): { valid: boolean; missing: string[] } {
  const available = new Set(extractInterpolationKeys(template));
  const missing = requiredKeys.filter((k) => !available.has(k));
  return { valid: missing.length === 0, missing };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pluralization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine the plural category for a count in a given locale.
 */
export function getPluralCategory(count: number, locale: SupportedLocale): PluralCategory {
  const config = LOCALE_CONFIGS[locale];

  // Arabic: complex plural rules
  if (locale === "ar") {
    if (count === 0) return "zero";
    if (count === 1) return "one";
    if (count === 2) return "two";
    const mod100 = count % 100;
    if (mod100 >= 3 && mod100 <= 10) return "few";
    if (mod100 >= 11 && mod100 <= 99) return "many";
    return "other";
  }

  // Hebrew: one, two, many, other
  if (locale === "he") {
    if (count === 1) return "one";
    if (count === 2) return "two";
    if (count > 10 && count % 10 === 0) return "many";
    return "other";
  }

  // Languages with only "other" (Thai, Japanese, Chinese, Korean)
  if (!config.pluralRules.includes("one")) return "other";

  // Simple one/other rule
  return count === 1 ? "one" : "other";
}

/**
 * Pluralize a message using plural forms dictionary.
 */
export function pluralize(
  count: number,
  forms: Partial<Record<PluralCategory, string>>,
  locale: SupportedLocale
): string {
  const category = getPluralCategory(count, locale);
  return forms[category] ?? forms.other ?? String(count);
}

// ─────────────────────────────────────────────────────────────────────────────
// Number & Currency Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a number according to locale conventions (no Intl dependency).
 */
export function formatNumber(
  value: number,
  locale: SupportedLocale,
  options: FormatOptions = {}
): string {
  const config = LOCALE_CONFIGS[locale];
  const { minimumFractionDigits = 0, maximumFractionDigits = 2 } = options;

  if (options.notation === "compact") {
    if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  }

  if (options.style === "percent") {
    const pct = (value * 100).toFixed(maximumFractionDigits);
    return `${pct}%`;
  }

  const fractionDigits = Math.max(minimumFractionDigits, 0);
  const fixed = Math.abs(value).toFixed(Math.max(fractionDigits, 0));
  const [intPart, fracPart] = fixed.split(".");

  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, config.numberSeparator);
  const result = fracPart !== undefined && (fractionDigits > 0 || fracPart !== "0")
    ? `${formattedInt}${config.decimalSeparator}${fracPart}`
    : formattedInt;

  return value < 0 ? `-${result}` : result;
}

/**
 * Format a currency value.
 */
export function formatCurrency(
  value: number,
  locale: SupportedLocale,
  options: { fractionDigits?: number; symbolPosition?: "before" | "after" } = {}
): string {
  const config = LOCALE_CONFIGS[locale];
  const fractionDigits = options.fractionDigits ?? 2;
  const numStr = formatNumber(value, locale, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
  const position = options.symbolPosition ?? "before";
  return position === "before"
    ? `${config.currencySymbol}${numStr}`
    : `${numStr}${config.currencySymbol}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a date according to a locale's date format.
 */
export function formatDate(date: Date, locale: SupportedLocale): string {
  const config = LOCALE_CONFIGS[locale];
  const year = date.getUTCFullYear().toString();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");

  return config.dateFormat
    .replace("YYYY", year)
    .replace("MM", month)
    .replace("DD", day);
}

/**
 * Format a time (hours + minutes) according to locale time format.
 */
export function formatTime(date: Date, locale: SupportedLocale): string {
  const config = LOCALE_CONFIGS[locale];
  const hours24 = date.getUTCHours();
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");

  if (config.timeFormat === "12h") {
    const period = hours24 < 12 ? "AM" : "PM";
    const hours12 = hours24 % 12 || 12;
    return `${hours12}:${minutes} ${period}`;
  }
  return `${hours24.toString().padStart(2, "0")}:${minutes}`;
}

/**
 * Format a relative time (e.g. "2 hours ago", "in 3 days").
 */
export function formatRelativeTime(
  date: Date,
  locale: SupportedLocale,
  now?: Date,
  translations?: Partial<Record<SupportedLocale, Record<string, Partial<Record<PluralCategory, string>>>>>
): string {
  const ts = now ?? new Date();
  const diffMs = date.getTime() - ts.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);

  const past = diffSec < 0;

  let unit: string;
  let count: number;

  if (absSec < 60) { unit = "second"; count = absSec; }
  else if (absSec < 3600) { unit = "minute"; count = Math.round(absSec / 60); }
  else if (absSec < 86400) { unit = "hour"; count = Math.round(absSec / 3600); }
  else if (absSec < 604800) { unit = "day"; count = Math.round(absSec / 86400); }
  else if (absSec < 2592000) { unit = "week"; count = Math.round(absSec / 604800); }
  else if (absSec < 31536000) { unit = "month"; count = Math.round(absSec / 2592000); }
  else { unit = "year"; count = Math.round(absSec / 31536000); }

  // Use simple English fallback
  const category = getPluralCategory(count, locale);
  const forms: Record<string, Partial<Record<PluralCategory, string>>> = {
    second: { one: "second", other: "seconds" },
    minute: { one: "minute", other: "minutes" },
    hour: { one: "hour", other: "hours" },
    day: { one: "day", other: "days" },
    week: { one: "week", other: "weeks" },
    month: { one: "month", other: "months" },
    year: { one: "year", other: "years" },
  };

  const unitStr = forms[unit]?.[category] ?? forms[unit]?.other ?? unit;
  return past ? `${count} ${unitStr} ago` : `in ${count} ${unitStr}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Locale Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse an Accept-Language header and return the best matching locale.
 */
export function parseAcceptLanguage(
  acceptLanguage: string,
  defaultLocale: SupportedLocale = "en"
): SupportedLocale {
  if (!acceptLanguage) return defaultLocale;

  const parts = acceptLanguage.split(",").map((part) => {
    const [lang, q] = part.trim().split(";q=");
    return { lang: lang.trim().toLowerCase(), q: q ? parseFloat(q) : 1.0 };
  });

  parts.sort((a, b) => b.q - a.q);

  for (const { lang } of parts) {
    const base = lang.split("-")[0] as SupportedLocale;
    if (isSupported(lang)) return lang as SupportedLocale;
    if (isSupported(base)) return base;
  }

  return defaultLocale;
}

/**
 * Build an Accept-Language string from locale preferences.
 */
export function buildAcceptLanguage(preferences: Array<{ locale: SupportedLocale; q?: number }>): string {
  return preferences
    .map(({ locale, q }) => q !== undefined && q < 1 ? `${locale};q=${q.toFixed(1)}` : locale)
    .join(", ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Translation Catalog
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a translation lookup map from a list of messages.
 */
export function buildCatalog(
  messages: TranslationMessage[]
): Map<SupportedLocale, Map<string, TranslationMessage>> {
  const catalog = new Map<SupportedLocale, Map<string, TranslationMessage>>();
  for (const msg of messages) {
    if (!catalog.has(msg.locale)) catalog.set(msg.locale, new Map());
    catalog.get(msg.locale)!.set(msg.key, msg);
  }
  return catalog;
}

/**
 * Look up a translated message, falling back to English.
 */
export function translate(
  catalog: Map<SupportedLocale, Map<string, TranslationMessage>>,
  key: string,
  locale: SupportedLocale,
  variables?: Record<string, string | number>
): string {
  const msg =
    catalog.get(locale)?.get(key) ??
    catalog.get("en")?.get(key);

  if (!msg) return key;
  const value = variables ? interpolate(msg.value, variables) : msg.value;
  return value;
}

/**
 * Find missing translations: keys in the source locale that don't exist in the target.
 */
export function findMissingTranslations(
  catalog: Map<SupportedLocale, Map<string, TranslationMessage>>,
  sourceLocale: SupportedLocale,
  targetLocale: SupportedLocale
): string[] {
  const source = catalog.get(sourceLocale) ?? new Map();
  const target = catalog.get(targetLocale) ?? new Map();
  const missing: string[] = [];
  for (const key of source.keys()) {
    if (!target.has(key)) missing.push(key);
  }
  return missing;
}
