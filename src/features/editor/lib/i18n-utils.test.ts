import { describe, it, expect } from "vitest";
import {
  getLocaleConfig,
  getSupportedLocales,
  isSupported,
  getTextDirection,
  isRtl,
  interpolate,
  extractInterpolationKeys,
  validateTemplate,
  getPluralCategory,
  pluralize,
  formatNumber,
  formatCurrency,
  formatDate,
  formatTime,
  formatRelativeTime,
  parseAcceptLanguage,
  buildAcceptLanguage,
  buildCatalog,
  translate,
  findMissingTranslations,
  type TranslationMessage,
} from "./i18n-utils";

// ─────────────────────────────────────────────────────────────────────────────
// getLocaleConfig / getSupportedLocales / isSupported
// ─────────────────────────────────────────────────────────────────────────────

describe("getLocaleConfig", () => {
  it("returns config for en", () => {
    const cfg = getLocaleConfig("en");
    expect(cfg.locale).toBe("en");
    expect(cfg.direction).toBe("ltr");
    expect(cfg.currencySymbol).toBe("$");
  });

  it("returns RTL config for ar", () => {
    const cfg = getLocaleConfig("ar");
    expect(cfg.direction).toBe("rtl");
  });
});

describe("getSupportedLocales", () => {
  it("includes all expected locales", () => {
    const locales = getSupportedLocales();
    expect(locales).toContain("en");
    expect(locales).toContain("th");
    expect(locales).toContain("ar");
    expect(locales.length).toBeGreaterThanOrEqual(10);
  });
});

describe("isSupported", () => {
  it("returns true for supported locales", () => {
    expect(isSupported("en")).toBe(true);
    expect(isSupported("ar")).toBe(true);
  });

  it("returns false for unsupported locales", () => {
    expect(isSupported("xx")).toBe(false);
    expect(isSupported("")).toBe(false);
  });
});

describe("getTextDirection / isRtl", () => {
  it("returns ltr for English", () => {
    expect(getTextDirection("en")).toBe("ltr");
    expect(isRtl("en")).toBe(false);
  });

  it("returns rtl for Arabic", () => {
    expect(getTextDirection("ar")).toBe("rtl");
    expect(isRtl("ar")).toBe(true);
  });

  it("returns rtl for Hebrew", () => {
    expect(isRtl("he")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// interpolate / extractInterpolationKeys / validateTemplate
// ─────────────────────────────────────────────────────────────────────────────

describe("interpolate", () => {
  it("replaces variables in template", () => {
    const result = interpolate("Hello, {{name}}! You have {{count}} messages.", { name: "Alice", count: 5 });
    expect(result).toBe("Hello, Alice! You have 5 messages.");
  });

  it("leaves unknown keys as-is", () => {
    expect(interpolate("Hello {{unknown}}", {})).toBe("Hello {{unknown}}");
  });

  it("handles numeric values", () => {
    expect(interpolate("{{n}} items", { n: 42 })).toBe("42 items");
  });
});

describe("extractInterpolationKeys", () => {
  it("extracts all unique keys", () => {
    const keys = extractInterpolationKeys("{{name}} has {{count}} items, {{name}} says hi");
    expect(keys).toHaveLength(2);
    expect(keys).toContain("name");
    expect(keys).toContain("count");
  });

  it("returns empty for no keys", () => {
    expect(extractInterpolationKeys("Hello world")).toHaveLength(0);
  });
});

describe("validateTemplate", () => {
  it("returns valid when all keys present", () => {
    const result = validateTemplate("{{a}} and {{b}}", ["a", "b"]);
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("returns missing keys", () => {
    const result = validateTemplate("{{a}}", ["a", "b"]);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("b");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getPluralCategory / pluralize
// ─────────────────────────────────────────────────────────────────────────────

describe("getPluralCategory", () => {
  describe("English (one/other)", () => {
    it("returns 'one' for count=1", () => expect(getPluralCategory(1, "en")).toBe("one"));
    it("returns 'other' for count=0", () => expect(getPluralCategory(0, "en")).toBe("other"));
    it("returns 'other' for count=2", () => expect(getPluralCategory(2, "en")).toBe("other"));
  });

  describe("Thai (other only)", () => {
    it("returns 'other' for any count", () => {
      expect(getPluralCategory(1, "th")).toBe("other");
      expect(getPluralCategory(5, "th")).toBe("other");
    });
  });

  describe("Arabic (complex)", () => {
    it("zero for 0", () => expect(getPluralCategory(0, "ar")).toBe("zero"));
    it("one for 1", () => expect(getPluralCategory(1, "ar")).toBe("one"));
    it("two for 2", () => expect(getPluralCategory(2, "ar")).toBe("two"));
    it("few for 3-10", () => expect(getPluralCategory(5, "ar")).toBe("few"));
    it("many for 11-99", () => expect(getPluralCategory(15, "ar")).toBe("many"));
    it("other for 100", () => expect(getPluralCategory(100, "ar")).toBe("other"));
  });
});

describe("pluralize", () => {
  it("pluralizes English correctly", () => {
    const forms = { one: "{{n}} item", other: "{{n}} items" };
    expect(pluralize(1, forms, "en")).toBe("{{n}} item");
    expect(pluralize(3, forms, "en")).toBe("{{n}} items");
  });

  it("falls back to other when category missing", () => {
    expect(pluralize(1, { other: "items" }, "en")).toBe("items");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatNumber
// ─────────────────────────────────────────────────────────────────────────────

describe("formatNumber", () => {
  it("formats English number with thousands separator", () => {
    expect(formatNumber(1234567, "en")).toBe("1,234,567");
  });

  it("formats German with . separator and , decimal", () => {
    expect(formatNumber(1234.56, "de", { minimumFractionDigits: 2 })).toBe("1.234,56");
  });

  it("formats with fraction digits", () => {
    expect(formatNumber(3.14159, "en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe("3.14");
  });

  it("formats negative numbers", () => {
    expect(formatNumber(-1000, "en")).toBe("-1,000");
  });

  it("formats compact notation", () => {
    expect(formatNumber(1_500_000, "en", { notation: "compact" })).toBe("1.5M");
    expect(formatNumber(2_500, "en", { notation: "compact" })).toBe("2.5K");
  });

  it("formats percentage", () => {
    expect(formatNumber(0.75, "en", { style: "percent", maximumFractionDigits: 0 })).toBe("75%");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatCurrency
// ─────────────────────────────────────────────────────────────────────────────

describe("formatCurrency", () => {
  it("formats USD with $ before number", () => {
    expect(formatCurrency(1234.50, "en")).toBe("$1,234.50");
  });

  it("formats Thai Baht", () => {
    expect(formatCurrency(1000, "th")).toBe("฿1,000.00");
  });

  it("supports after symbol position", () => {
    const result = formatCurrency(100, "en", { symbolPosition: "after" });
    expect(result).toBe("100.00$");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatDate / formatTime
// ─────────────────────────────────────────────────────────────────────────────

describe("formatDate", () => {
  const date = new Date("2025-03-15T00:00:00Z");

  it("formats MM/DD/YYYY for en", () => {
    expect(formatDate(date, "en")).toBe("03/15/2025");
  });

  it("formats DD/MM/YYYY for fr", () => {
    expect(formatDate(date, "fr")).toBe("15/03/2025");
  });

  it("formats YYYY/MM/DD for ja", () => {
    expect(formatDate(date, "ja")).toBe("2025/03/15");
  });

  it("formats DD.MM.YYYY for de", () => {
    expect(formatDate(date, "de")).toBe("15.03.2025");
  });
});

describe("formatTime", () => {
  const date = new Date("2025-01-01T14:30:00Z");

  it("formats 12h for en", () => {
    expect(formatTime(date, "en")).toBe("2:30 PM");
  });

  it("formats 24h for de", () => {
    expect(formatTime(date, "de")).toBe("14:30");
  });

  it("formats midnight (12h)", () => {
    const midnight = new Date("2025-01-01T00:00:00Z");
    expect(formatTime(midnight, "en")).toBe("12:00 AM");
  });

  it("formats noon (12h)", () => {
    const noon = new Date("2025-01-01T12:00:00Z");
    expect(formatTime(noon, "en")).toBe("12:00 PM");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatRelativeTime
// ─────────────────────────────────────────────────────────────────────────────

describe("formatRelativeTime", () => {
  it("formats seconds ago", () => {
    const now = new Date("2025-01-01T10:00:00Z");
    const past = new Date("2025-01-01T09:59:55Z");
    const result = formatRelativeTime(past, "en", now);
    expect(result).toContain("ago");
    expect(result).toContain("second");
  });

  it("formats minutes ago", () => {
    const now = new Date("2025-01-01T10:00:00Z");
    const past = new Date("2025-01-01T09:55:00Z");
    const result = formatRelativeTime(past, "en", now);
    expect(result).toContain("minutes ago");
  });

  it("formats in future", () => {
    const now = new Date("2025-01-01T10:00:00Z");
    const future = new Date("2025-01-01T11:00:00Z");
    const result = formatRelativeTime(future, "en", now);
    expect(result).toContain("in ");
    expect(result).toContain("hour");
  });

  it("formats days ago", () => {
    const now = new Date("2025-01-10T00:00:00Z");
    const past = new Date("2025-01-07T00:00:00Z");
    expect(formatRelativeTime(past, "en", now)).toContain("days ago");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseAcceptLanguage / buildAcceptLanguage
// ─────────────────────────────────────────────────────────────────────────────

describe("parseAcceptLanguage", () => {
  it("returns best matching supported locale", () => {
    expect(parseAcceptLanguage("en-US,en;q=0.9")).toBe("en");
    expect(parseAcceptLanguage("th-TH,th;q=0.9")).toBe("th");
    expect(parseAcceptLanguage("de-DE;q=0.9,de;q=0.8")).toBe("de");
  });

  it("returns default when no match", () => {
    expect(parseAcceptLanguage("xx-XX", "en")).toBe("en");
  });

  it("returns default for empty header", () => {
    expect(parseAcceptLanguage("")).toBe("en");
  });

  it("respects q values (higher q first)", () => {
    expect(parseAcceptLanguage("fr;q=0.5,de;q=0.9")).toBe("de");
  });
});

describe("buildAcceptLanguage", () => {
  it("builds Accept-Language header", () => {
    const result = buildAcceptLanguage([
      { locale: "en" },
      { locale: "fr", q: 0.9 },
      { locale: "de", q: 0.8 },
    ]);
    expect(result).toContain("en");
    expect(result).toContain("fr;q=0.9");
    expect(result).toContain("de;q=0.8");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildCatalog / translate / findMissingTranslations
// ─────────────────────────────────────────────────────────────────────────────

describe("buildCatalog", () => {
  it("builds a locale→key→message map", () => {
    const messages: TranslationMessage[] = [
      { key: "hello", locale: "en", value: "Hello" },
      { key: "hello", locale: "th", value: "สวัสดี" },
      { key: "bye", locale: "en", value: "Goodbye" },
    ];
    const catalog = buildCatalog(messages);
    expect(catalog.get("en")?.get("hello")?.value).toBe("Hello");
    expect(catalog.get("th")?.get("hello")?.value).toBe("สวัสดี");
    expect(catalog.get("en")?.size).toBe(2);
  });
});

describe("translate", () => {
  const messages: TranslationMessage[] = [
    { key: "greeting", locale: "en", value: "Hello, {{name}}!" },
    { key: "greeting", locale: "th", value: "สวัสดี, {{name}}!" },
    { key: "bye", locale: "en", value: "Goodbye" },
  ];
  const catalog = buildCatalog(messages);

  it("translates to target locale with interpolation", () => {
    expect(translate(catalog, "greeting", "th", { name: "Alice" })).toBe("สวัสดี, Alice!");
  });

  it("falls back to English when key missing in target locale", () => {
    expect(translate(catalog, "bye", "th")).toBe("Goodbye");
  });

  it("returns the key when completely missing", () => {
    expect(translate(catalog, "nonexistent", "en")).toBe("nonexistent");
  });
});

describe("findMissingTranslations", () => {
  it("finds keys missing in target locale", () => {
    const messages: TranslationMessage[] = [
      { key: "a", locale: "en", value: "A" },
      { key: "b", locale: "en", value: "B" },
      { key: "a", locale: "th", value: "ก" },
    ];
    const catalog = buildCatalog(messages);
    const missing = findMissingTranslations(catalog, "en", "th");
    expect(missing).toContain("b");
    expect(missing).not.toContain("a");
  });

  it("returns all keys when target locale is empty", () => {
    const messages: TranslationMessage[] = [
      { key: "a", locale: "en", value: "A" },
      { key: "b", locale: "en", value: "B" },
    ];
    const catalog = buildCatalog(messages);
    const missing = findMissingTranslations(catalog, "en", "de");
    expect(missing).toHaveLength(2);
  });
});
