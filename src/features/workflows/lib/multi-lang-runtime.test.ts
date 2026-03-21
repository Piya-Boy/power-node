import { describe, it, expect } from "vitest";
import {
  detectLanguage,
  getLanguageConfig,
  validateCode,
  validatePackages,
  wrapWithBoilerplate,
  buildRuntimeSpec,
  buildDockerCommand,
  parsePackageSpec,
  buildInstallCommand,
  getLanguageSummary,
  isSupportedLanguage,
  LANGUAGE_CONFIGS,
  type CodeSnippet,
} from "./multi-lang-runtime";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const makeSnippet = (overrides: Partial<CodeSnippet> = {}): CodeSnippet => ({
  id: "snip-1",
  language: "javascript",
  code: "return { result: input.value * 2 };",
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE_CONFIGS
// ─────────────────────────────────────────────────────────────────────────────

describe("LANGUAGE_CONFIGS", () => {
  it("defines all 6 languages", () => {
    const langs = Object.keys(LANGUAGE_CONFIGS);
    expect(langs).toContain("javascript");
    expect(langs).toContain("python");
    expect(langs).toContain("go");
    expect(langs).toContain("ruby");
    expect(langs).toContain("php");
    expect(langs).toContain("shell");
  });

  it("each config has required fields", () => {
    for (const config of Object.values(LANGUAGE_CONFIGS)) {
      expect(config.dockerImage).toBeTruthy();
      expect(config.runtimeCommand).toBeTruthy();
      expect(config.fileExtension).toBeTruthy();
      expect(config.boilerplate).toContain("{{USER_CODE}}");
      expect(config.timeout).toBeGreaterThan(0);
      expect(config.memoryLimitMb).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectLanguage
// ─────────────────────────────────────────────────────────────────────────────

describe("detectLanguage", () => {
  it("detects PHP from opening tag", () => {
    expect(detectLanguage("<?php echo 'hello';")).toBe("php");
  });

  it("detects shell from shebang", () => {
    expect(detectLanguage("#!/bin/sh\necho hello")).toBe("shell");
  });

  it("detects Go from package main", () => {
    expect(detectLanguage("package main\nfunc main() {}")).toBe("go");
  });

  it("detects Python from def/import", () => {
    expect(detectLanguage("def greet():\n    print('hello')")).toBe("python");
  });

  it("detects JavaScript from const/let", () => {
    expect(detectLanguage("const x = 5;\nreturn x;")).toBe("javascript");
  });

  it("returns null for unrecognized code", () => {
    expect(detectLanguage("hello world")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getLanguageConfig
// ─────────────────────────────────────────────────────────────────────────────

describe("getLanguageConfig", () => {
  it("returns config for javascript", () => {
    const config = getLanguageConfig("javascript");
    expect(config.language).toBe("javascript");
    expect(config.fileExtension).toBe(".js");
  });

  it("returns config for python", () => {
    const config = getLanguageConfig("python");
    expect(config.dockerImage).toContain("python");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateCode
// ─────────────────────────────────────────────────────────────────────────────

describe("validateCode", () => {
  it("passes valid JavaScript code", () => {
    const result = validateCode("return { result: input.value };", "javascript");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects empty code", () => {
    const result = validateCode("", "javascript");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("empty");
  });

  it("rejects eval() in JavaScript", () => {
    const result = validateCode("eval('bad code');", "javascript");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("eval"))).toBe(true);
  });

  it("rejects new Function() in JavaScript", () => {
    const result = validateCode("const fn = new Function('return 1');", "javascript");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("new Function()"))).toBe(true);
  });

  it("rejects subprocess in Python", () => {
    const result = validateCode("import subprocess\nsubprocess.run(['ls'])", "python");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("subprocess"))).toBe(true);
  });

  it("rejects eval() in Python", () => {
    const result = validateCode("eval(input['code'])", "python");
    expect(result.valid).toBe(false);
  });

  it("warns about fs in JavaScript", () => {
    const result = validateCode("const fs = require('fs');", "javascript");
    expect(result.warnings.some((w) => w.includes("File system"))).toBe(true);
  });

  it("rejects rm -rf / in shell", () => {
    const result = validateCode("rm -rf /etc/passwd", "shell");
    expect(result.valid).toBe(false);
  });

  it("estimates complexity", () => {
    const simple = validateCode("return { value: 1 };", "javascript");
    expect(simple.estimatedComplexity).toBe("simple");

    const complex = validateCode(
      Array(30).fill("if (x) { for (let i=0;i<10;i++) {} }").join("\n"),
      "javascript"
    );
    expect(["moderate", "complex"]).toContain(complex.estimatedComplexity);
  });

  it("Go requires return statement", () => {
    const result = validateCode("x := 42\nfmt.Println(x)", "go");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("return"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validatePackages
// ─────────────────────────────────────────────────────────────────────────────

describe("validatePackages", () => {
  it("passes valid packages", () => {
    const result = validatePackages(["lodash", "axios@1.6.0", "@types/node"], "javascript");
    expect(result.valid).toBe(true);
    expect(result.sanitized).toHaveLength(3);
  });

  it("rejects invalid package names", () => {
    const result = validatePackages(["../../evil"], "javascript");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid"))).toBe(true);
  });

  it("rejects suspicious packages", () => {
    const result = validatePackages(["os-command"], "javascript");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("not allowed"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// wrapWithBoilerplate
// ─────────────────────────────────────────────────────────────────────────────

describe("wrapWithBoilerplate", () => {
  it("wraps JavaScript code with boilerplate", () => {
    const snippet = makeSnippet({ code: "return { x: 1 };" });
    const wrapped = wrapWithBoilerplate(snippet);
    expect(wrapped).toContain("process.env.POWERNODE_INPUT");
    expect(wrapped).toContain("async function main");
    expect(wrapped).toContain("x: 1");
    expect(wrapped).not.toContain("{{USER_CODE}}");
    expect(wrapped).not.toContain("{{INPUT_VAR}}");
  });

  it("wraps Python code with boilerplate", () => {
    const snippet = makeSnippet({ language: "python", code: "return {'result': 42}" });
    const wrapped = wrapWithBoilerplate(snippet);
    expect(wrapped).toContain("json.loads");
    expect(wrapped).toContain("def main");
    expect(wrapped).not.toContain("{{USER_CODE}}");
  });

  it("wraps Go code with boilerplate", () => {
    const snippet = makeSnippet({ language: "go", code: "return input" });
    const wrapped = wrapWithBoilerplate(snippet);
    expect(wrapped).toContain("package main");
    expect(wrapped).toContain("func run");
  });

  it("wraps PHP code with boilerplate", () => {
    const snippet = makeSnippet({ language: "php", code: "return ['x' => 1];" });
    const wrapped = wrapWithBoilerplate(snippet);
    expect(wrapped).toContain("<?php");
    expect(wrapped).toContain("json_decode");
  });

  it("wraps Ruby code with boilerplate", () => {
    const snippet = makeSnippet({ language: "ruby", code: "{ result: 1 }" });
    const wrapped = wrapWithBoilerplate(snippet);
    expect(wrapped).toContain("require 'json'");
    expect(wrapped).toContain("def main");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildRuntimeSpec
// ─────────────────────────────────────────────────────────────────────────────

describe("buildRuntimeSpec", () => {
  it("builds a complete runtime spec", () => {
    const snippet = makeSnippet();
    const spec = buildRuntimeSpec(snippet);
    expect(spec.config.language).toBe("javascript");
    expect(spec.wrappedCode).toContain("async function main");
    expect(spec.dockerCommand).toContain("docker run");
    expect(spec.effectiveTimeout).toBe(30_000);
    expect(spec.environmentVariables["POWERNODE_LANG"]).toBe("javascript");
  });

  it("uses custom timeout override", () => {
    const snippet = makeSnippet({ timeout: 5_000 });
    const spec = buildRuntimeSpec(snippet);
    expect(spec.effectiveTimeout).toBe(5_000);
  });

  it("merges environment variables", () => {
    const snippet = makeSnippet({ environment: { MY_VAR: "hello" } });
    const spec = buildRuntimeSpec(snippet, { EXTRA: "world" });
    expect(spec.environmentVariables["MY_VAR"]).toBe("hello");
    expect(spec.environmentVariables["EXTRA"]).toBe("world");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildDockerCommand
// ─────────────────────────────────────────────────────────────────────────────

describe("buildDockerCommand", () => {
  it("includes docker security flags", () => {
    const snippet = makeSnippet();
    const config = getLanguageConfig("javascript");
    const cmd = buildDockerCommand(snippet, config);
    expect(cmd).toContain("--network=none");
    expect(cmd).toContain("--memory=");
    expect(cmd).toContain("--cpus=0.5");
    expect(cmd).toContain("--rm");
  });

  it("uses correct docker image", () => {
    const snippet = makeSnippet({ language: "python" });
    const config = getLanguageConfig("python");
    const cmd = buildDockerCommand(snippet, config);
    expect(cmd).toContain("python:");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parsePackageSpec
// ─────────────────────────────────────────────────────────────────────────────

describe("parsePackageSpec", () => {
  it("parses package with version", () => {
    const spec = parsePackageSpec("axios@1.6.0", "javascript");
    expect(spec.name).toBe("axios");
    expect(spec.version).toBe("1.6.0");
    expect(spec.manager).toBe("npm");
  });

  it("parses package without version", () => {
    const spec = parsePackageSpec("lodash", "javascript");
    expect(spec.name).toBe("lodash");
    expect(spec.version).toBeUndefined();
  });

  it("uses correct package manager for language", () => {
    expect(parsePackageSpec("requests", "python").manager).toBe("pip");
    expect(parsePackageSpec("nokogiri", "ruby").manager).toBe("gem");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildInstallCommand
// ─────────────────────────────────────────────────────────────────────────────

describe("buildInstallCommand", () => {
  it("returns null for empty packages", () => {
    expect(buildInstallCommand([], "javascript")).toBeNull();
  });

  it("builds npm install command", () => {
    const cmd = buildInstallCommand(["lodash", "axios"], "javascript");
    expect(cmd).toContain("npm install");
    expect(cmd).toContain("lodash");
  });

  it("builds pip install command", () => {
    const cmd = buildInstallCommand(["requests"], "python");
    expect(cmd).toContain("pip install");
    expect(cmd).toContain("requests");
  });

  it("builds gem install command", () => {
    const cmd = buildInstallCommand(["nokogiri"], "ruby");
    expect(cmd).toContain("gem install");
  });

  it("builds composer require command", () => {
    const cmd = buildInstallCommand(["guzzlehttp/guzzle"], "php");
    expect(cmd).toContain("composer require");
  });

  it("returns null for shell (no package manager)", () => {
    expect(buildInstallCommand(["curl"], "shell")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getLanguageSummary
// ─────────────────────────────────────────────────────────────────────────────

describe("getLanguageSummary", () => {
  it("returns summary for all languages", () => {
    const summary = getLanguageSummary();
    expect(summary).toHaveLength(6);
    expect(summary.every((s) => s.dockerImage)).toBe(true);
    expect(summary.every((s) => s.defaultTimeoutSeconds > 0)).toBe(true);
  });

  it("shell has no package manager", () => {
    const shell = getLanguageSummary().find((s) => s.language === "shell");
    expect(shell?.hasPackageManager).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isSupportedLanguage
// ─────────────────────────────────────────────────────────────────────────────

describe("isSupportedLanguage", () => {
  it("returns true for supported languages", () => {
    expect(isSupportedLanguage("javascript")).toBe(true);
    expect(isSupportedLanguage("python")).toBe(true);
    expect(isSupportedLanguage("go")).toBe(true);
  });

  it("returns false for unsupported languages", () => {
    expect(isSupportedLanguage("java")).toBe(false);
    expect(isSupportedLanguage("rust")).toBe(false);
    expect(isSupportedLanguage("")).toBe(false);
  });
});
