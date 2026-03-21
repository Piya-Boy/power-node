/**
 * Phase 40 — Multi-language Code Node Runtime Utilities
 * Pure utilities for validating, sandboxing, and managing code snippets
 * in multiple languages: JavaScript, Python, Go, Ruby, PHP, Shell.
 * No actual execution — all logic is static analysis and configuration.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CodeLanguage = "javascript" | "python" | "go" | "ruby" | "php" | "shell";

export type RuntimeEnvironment = "sandboxed" | "docker" | "subprocess";

export interface LanguageConfig {
  language: CodeLanguage;
  fileExtension: string;
  runtimeCommand: string;
  dockerImage: string;
  timeout: number;            // default timeout ms
  memoryLimitMb: number;
  inputVariable: string;      // how to access input data
  outputVariable: string;     // how to set output data
  boilerplate: string;        // template code wrapping user code
  supportedPackageManager?: string;
}

export interface CodeSnippet {
  id: string;
  language: CodeLanguage;
  code: string;
  packages?: string[];        // additional packages to install
  timeout?: number;           // override default timeout
  memoryLimitMb?: number;
  environment?: Record<string, string>;
}

export interface CodeValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  estimatedComplexity?: "simple" | "moderate" | "complex";
}

export interface RuntimeSpec {
  snippet: CodeSnippet;
  config: LanguageConfig;
  wrappedCode: string;        // snippet.code wrapped in boilerplate
  dockerCommand?: string;
  environmentVariables: Record<string, string>;
  effectiveTimeout: number;
  effectiveMemoryLimitMb: number;
}

export interface PackageSpec {
  name: string;
  version?: string;
  manager: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Language Configurations
// ─────────────────────────────────────────────────────────────────────────────

export const LANGUAGE_CONFIGS: Record<CodeLanguage, LanguageConfig> = {
  javascript: {
    language: "javascript",
    fileExtension: ".js",
    runtimeCommand: "node",
    dockerImage: "node:20-alpine",
    timeout: 30_000,
    memoryLimitMb: 128,
    inputVariable: "const input = JSON.parse(process.env.POWERNODE_INPUT || '{}');",
    outputVariable: "process.stdout.write(JSON.stringify(output));",
    boilerplate: `{{INPUT_VAR}}
async function main(input) {
{{USER_CODE}}
}
main(input).then(output => {
  {{OUTPUT_VAR}}
}).catch(err => {
  process.stderr.write(JSON.stringify({ error: err.message }));
  process.exit(1);
});`,
    supportedPackageManager: "npm",
  },
  python: {
    language: "python",
    fileExtension: ".py",
    runtimeCommand: "python3",
    dockerImage: "python:3.11-alpine",
    timeout: 30_000,
    memoryLimitMb: 128,
    inputVariable: "import json, os; input = json.loads(os.environ.get('POWERNODE_INPUT', '{}'))",
    outputVariable: "import sys; sys.stdout.write(json.dumps(output))",
    boilerplate: `{{INPUT_VAR}}

def main(input):
{{USER_CODE}}

output = main(input)
{{OUTPUT_VAR}}`,
    supportedPackageManager: "pip",
  },
  go: {
    language: "go",
    fileExtension: ".go",
    runtimeCommand: "go run",
    dockerImage: "golang:1.21-alpine",
    timeout: 60_000,
    memoryLimitMb: 256,
    inputVariable: 'inputJSON := os.Getenv("POWERNODE_INPUT")',
    outputVariable: "fmt.Print(string(outputJSON))",
    boilerplate: `package main

import (
  "encoding/json"
  "fmt"
  "os"
)

func main() {
  {{INPUT_VAR}}
  var input map[string]interface{}
  json.Unmarshal([]byte(inputJSON), &input)

  output := run(input)

  outputJSON, _ := json.Marshal(output)
  {{OUTPUT_VAR}}
}

func run(input map[string]interface{}) interface{} {
{{USER_CODE}}
}`,
    supportedPackageManager: "go mod",
  },
  ruby: {
    language: "ruby",
    fileExtension: ".rb",
    runtimeCommand: "ruby",
    dockerImage: "ruby:3.2-alpine",
    timeout: 30_000,
    memoryLimitMb: 128,
    inputVariable: "require 'json'; input = JSON.parse(ENV['POWERNODE_INPUT'] || '{}')",
    outputVariable: "$stdout.write(output.to_json)",
    boilerplate: `{{INPUT_VAR}}

def main(input)
{{USER_CODE}}
end

output = main(input)
{{OUTPUT_VAR}}`,
    supportedPackageManager: "gem",
  },
  php: {
    language: "php",
    fileExtension: ".php",
    runtimeCommand: "php",
    dockerImage: "php:8.2-cli-alpine",
    timeout: 30_000,
    memoryLimitMb: 128,
    inputVariable: "$input = json_decode(getenv('POWERNODE_INPUT') ?: '{}', true);",
    outputVariable: "echo json_encode($output);",
    boilerplate: `<?php
{{INPUT_VAR}}

function main($input) {
{{USER_CODE}}
}

$output = main($input);
{{OUTPUT_VAR}}`,
    supportedPackageManager: "composer",
  },
  shell: {
    language: "shell",
    fileExtension: ".sh",
    runtimeCommand: "sh",
    dockerImage: "alpine:3.18",
    timeout: 15_000,
    memoryLimitMb: 64,
    inputVariable: 'INPUT="$POWERNODE_INPUT"',
    outputVariable: "echo \"$OUTPUT\"",
    boilerplate: `#!/bin/sh
{{INPUT_VAR}}

{{USER_CODE}}

{{OUTPUT_VAR}}`,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Language Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect the language of a code snippet using heuristics.
 */
export function detectLanguage(code: string): CodeLanguage | null {
  const trimmed = code.trim();

  if (trimmed.startsWith("<?php")) return "php";
  if (trimmed.startsWith("#!/bin/sh") || trimmed.startsWith("#!/bin/bash")) return "shell";

  if (trimmed.includes("package main") && trimmed.includes("func main")) return "go";
  if (trimmed.includes("import json") || trimmed.includes("def ") || trimmed.includes("print(")) return "python";
  if (trimmed.includes("require ") && trimmed.includes("def ")) return "ruby";

  // JS patterns
  if (
    trimmed.includes("const ") ||
    trimmed.includes("let ") ||
    trimmed.includes("async function") ||
    trimmed.includes("=>")
  ) return "javascript";

  return null;
}

/**
 * Get the language config for a given language.
 */
export function getLanguageConfig(language: CodeLanguage): LanguageConfig {
  return LANGUAGE_CONFIGS[language];
}

// ─────────────────────────────────────────────────────────────────────────────
// Code Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate code for a specific language.
 * Checks for dangerous patterns and basic syntax issues.
 */
export function validateCode(
  code: string,
  language: CodeLanguage
): CodeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!code || code.trim().length === 0) {
    return { valid: false, errors: ["Code cannot be empty"], warnings: [] };
  }

  // Universal security checks
  const securityChecks = getSecurityChecks(language);
  for (const check of securityChecks) {
    if (check.pattern.test(code)) {
      if (check.severity === "error") {
        errors.push(check.message);
      } else {
        warnings.push(check.message);
      }
    }
  }

  // Language-specific checks
  const langErrors = getLanguageSpecificErrors(code, language);
  errors.push(...langErrors);

  const complexity = estimateComplexity(code);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    estimatedComplexity: complexity,
  };
}

/**
 * Check if a list of package names are safe (no malicious pattern).
 */
export function validatePackages(packages: string[], language: CodeLanguage): {
  valid: boolean;
  errors: string[];
  sanitized: string[];
} {
  const errors: string[] = [];
  const sanitized: string[] = [];

  const allowedPackagePattern = /^[@a-zA-Z0-9_][a-zA-Z0-9_\-./]*(@[\w\-.*]+)?$/;
  const suspiciousPackages = ["exec", "shell", "os-command", "child-process-promise"];

  for (const pkg of packages) {
    if (!allowedPackagePattern.test(pkg)) {
      errors.push(`Invalid package name: "${pkg}"`);
      continue;
    }
    const pkgName = pkg.split("@")[0].toLowerCase();
    if (suspiciousPackages.some((s) => pkgName.includes(s))) {
      errors.push(`Package "${pkg}" is not allowed for security reasons`);
      continue;
    }
    sanitized.push(pkg);
  }

  return { valid: errors.length === 0, errors, sanitized };
}

// ─────────────────────────────────────────────────────────────────────────────
// Boilerplate Wrapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wrap user code in the language's boilerplate template.
 */
export function wrapWithBoilerplate(snippet: CodeSnippet): string {
  const config = LANGUAGE_CONFIGS[snippet.language];
  const indented = indentCode(snippet.code, snippet.language);

  return config.boilerplate
    .replace("{{INPUT_VAR}}", config.inputVariable)
    .replace("{{OUTPUT_VAR}}", config.outputVariable)
    .replace("{{USER_CODE}}", indented);
}

/**
 * Build a complete RuntimeSpec for a code snippet.
 */
export function buildRuntimeSpec(
  snippet: CodeSnippet,
  environment?: Record<string, string>
): RuntimeSpec {
  const config = LANGUAGE_CONFIGS[snippet.language];
  const wrappedCode = wrapWithBoilerplate(snippet);

  const envVars: Record<string, string> = {
    ...environment,
    ...snippet.environment,
    POWERNODE_LANG: snippet.language,
  };

  const dockerCommand = buildDockerCommand(snippet, config);

  return {
    snippet,
    config,
    wrappedCode,
    dockerCommand,
    environmentVariables: envVars,
    effectiveTimeout: snippet.timeout ?? config.timeout,
    effectiveMemoryLimitMb: snippet.memoryLimitMb ?? config.memoryLimitMb,
  };
}

/**
 * Build the Docker command to run the code.
 */
export function buildDockerCommand(
  snippet: CodeSnippet,
  config: LanguageConfig
): string {
  const memLimit = snippet.memoryLimitMb ?? config.memoryLimitMb;
  const timeout = snippet.timeout ?? config.timeout;
  const timeoutSec = Math.ceil(timeout / 1000);

  return [
    "docker run",
    "--rm",
    `--memory=${memLimit}m`,
    `--memory-swap=${memLimit}m`,
    "--cpus=0.5",
    "--network=none",
    `--ulimit nproc=64:64`,
    `--stop-timeout=${timeoutSec}`,
    config.dockerImage,
    "sh -c",
    `"timeout ${timeoutSec}s ${config.runtimeCommand} /code/main${config.fileExtension}"`,
  ].join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Package Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a package specification from a string.
 * Supports "package@version" format.
 */
export function parsePackageSpec(raw: string, language: CodeLanguage): PackageSpec {
  const config = LANGUAGE_CONFIGS[language];
  const atIdx = raw.lastIndexOf("@");
  if (atIdx > 0) {
    return {
      name: raw.slice(0, atIdx),
      version: raw.slice(atIdx + 1),
      manager: config.supportedPackageManager ?? "unknown",
    };
  }
  return {
    name: raw,
    manager: config.supportedPackageManager ?? "unknown",
  };
}

/**
 * Build the install command for a list of packages.
 */
export function buildInstallCommand(packages: string[], language: CodeLanguage): string | null {
  if (packages.length === 0) return null;
  const config = LANGUAGE_CONFIGS[language];
  const manager = config.supportedPackageManager;

  switch (manager) {
    case "npm":
      return `npm install --no-save ${packages.join(" ")}`;
    case "pip":
      return `pip install --quiet ${packages.join(" ")}`;
    case "gem":
      return `gem install ${packages.join(" ")}`;
    case "composer":
      return `composer require --no-interaction ${packages.join(" ")}`;
    case "go mod":
      return `go get ${packages.join(" ")}`;
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a summary of supported languages and their configurations.
 */
export function getLanguageSummary(): Array<{
  language: CodeLanguage;
  dockerImage: string;
  defaultTimeoutSeconds: number;
  memoryLimitMb: number;
  hasPackageManager: boolean;
}> {
  return Object.values(LANGUAGE_CONFIGS).map((config) => ({
    language: config.language,
    dockerImage: config.dockerImage,
    defaultTimeoutSeconds: config.timeout / 1000,
    memoryLimitMb: config.memoryLimitMb,
    hasPackageManager: !!config.supportedPackageManager,
  }));
}

/**
 * Check if a language is supported.
 */
export function isSupportedLanguage(lang: string): lang is CodeLanguage {
  return lang in LANGUAGE_CONFIGS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface SecurityCheck {
  pattern: RegExp;
  severity: "error" | "warning";
  message: string;
}

function getSecurityChecks(language: CodeLanguage): SecurityCheck[] {
  const universal: SecurityCheck[] = [];

  if (language === "javascript") {
    return [
      ...universal,
      { pattern: /\beval\s*\(/, severity: "error", message: "Use of eval() is not allowed" },
      { pattern: /new\s+Function\s*\(/, severity: "error", message: "Use of new Function() is not allowed" },
      { pattern: /process\.exit\s*\(/, severity: "warning", message: "Avoid calling process.exit(); return data instead" },
      { pattern: /require\s*\(\s*['"]child_process['"]/, severity: "error", message: "child_process module is not allowed" },
      { pattern: /require\s*\(\s*['"]fs['"]/, severity: "warning", message: "File system access may be restricted in sandbox" },
    ];
  }
  if (language === "python") {
    return [
      ...universal,
      { pattern: /\bexec\s*\(/, severity: "error", message: "Use of exec() is not allowed" },
      { pattern: /\beval\s*\(/, severity: "error", message: "Use of eval() is not allowed" },
      { pattern: /import\s+os\b/, severity: "warning", message: "os module access may be restricted in sandbox" },
      { pattern: /import\s+subprocess\b/, severity: "error", message: "subprocess module is not allowed" },
      { pattern: /__import__\s*\(/, severity: "error", message: "Dynamic imports via __import__ are not allowed" },
    ];
  }
  if (language === "shell") {
    return [
      ...universal,
      { pattern: /\bcurl\b/, severity: "warning", message: "Network access (curl) may be restricted in sandbox" },
      { pattern: /\bwget\b/, severity: "warning", message: "Network access (wget) may be restricted in sandbox" },
      { pattern: /rm\s+-rf\s+\//, severity: "error", message: "Destructive filesystem commands are not allowed" },
    ];
  }

  return universal;
}

function getLanguageSpecificErrors(code: string, language: CodeLanguage): string[] {
  const errors: string[] = [];

  if (language === "go") {
    if (!code.includes("return")) {
      errors.push("Go function must have a return statement");
    }
  }
  if (language === "python") {
    // Check for syntax-like issues (very basic)
    const lines = code.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("\t") && lines[i].includes("    ")) {
        errors.push(`Line ${i + 1}: Mixed tabs and spaces detected`);
        break;
      }
    }
  }

  return errors;
}

function estimateComplexity(code: string): "simple" | "moderate" | "complex" {
  const lines = code.split("\n").filter((l) => l.trim().length > 0);
  const loops = (code.match(/\b(for|while|forEach|map|reduce|filter)\b/g) ?? []).length;
  const conditions = (code.match(/\b(if|else|switch|case|ternary|\?)\b/g) ?? []).length;

  const score = lines.length + loops * 5 + conditions * 3;
  if (score < 20) return "simple";
  if (score < 60) return "moderate";
  return "complex";
}

function indentCode(code: string, language: CodeLanguage): string {
  const indentStr = language === "python" || language === "ruby" ? "    " : "  ";
  return code
    .split("\n")
    .map((line) => (line.trim() ? `${indentStr}${line}` : line))
    .join("\n");
}
