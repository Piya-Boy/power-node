/**
 * Phase 26 — Enterprise & Security: Workflow Security Scanner
 * Scans workflows for potential misconfigurations and security issues.
 */

export type SecuritySeverity = "critical" | "high" | "medium" | "low" | "info";

export interface SecurityFinding {
  id: string;
  severity: SecuritySeverity;
  title: string;
  description: string;
  nodeId?: string;
  nodeName?: string;
  recommendation: string;
}

export interface ScanResult {
  workflowId: string;
  workflowName: string;
  findings: SecurityFinding[];
  scannedAt: Date;
  score: number; // 0-100, higher is safer
}

export interface ScanNode {
  id: string;
  name: string;
  type: string;
  data: Record<string, unknown>;
}

export interface ScanWorkflow {
  id: string;
  name: string;
  nodes: ScanNode[];
  isActive: boolean;
  webhookSecret?: string | null;
}

const SEVERITY_WEIGHT: Record<SecuritySeverity, number> = {
  critical: 30,
  high: 20,
  medium: 10,
  low: 5,
  info: 0,
};

/**
 * Scan a workflow for security issues.
 */
export function scanWorkflow(workflow: ScanWorkflow): ScanResult {
  const findings: SecurityFinding[] = [];
  let findingId = 0;

  const addFinding = (f: Omit<SecurityFinding, "id">) => {
    findings.push({ id: `finding-${++findingId}`, ...f });
  };

  // 1. Webhook without secret
  const hasWebhookNode = workflow.nodes.some((n) =>
    n.type === "WEBHOOK_TRIGGER"
  );
  if (hasWebhookNode && !workflow.webhookSecret) {
    addFinding({
      severity: "high",
      title: "Webhook trigger without secret",
      description: "This workflow uses a webhook trigger but has no webhook secret configured.",
      recommendation: "Generate a webhook secret to authenticate incoming requests.",
    });
  }

  // 2. HTTP requests with credentials in data (plain text URLs with tokens)
  for (const node of workflow.nodes) {
    if (node.type === "HTTP_REQUEST") {
      const url = String(node.data?.url ?? "");
      const hasTokenInUrl = /[?&](token|api_key|apikey|key|secret)=/i.test(url);
      if (hasTokenInUrl) {
        addFinding({
          severity: "high",
          title: "API token in URL query parameter",
          description: `Node "${node.name}" has an API token embedded in the URL query string.`,
          nodeId: node.id,
          nodeName: node.name,
          recommendation: "Move sensitive tokens to Authorization headers or use the Credentials system.",
        });
      }

      // Plain HTTP (non-HTTPS)
      if (url.startsWith("http://") && !url.startsWith("http://localhost") && !url.startsWith("http://127.")) {
        addFinding({
          severity: "medium",
          title: "Insecure HTTP endpoint",
          description: `Node "${node.name}" calls a non-HTTPS URL: ${url}`,
          nodeId: node.id,
          nodeName: node.name,
          recommendation: "Use HTTPS endpoints to protect data in transit.",
        });
      }
    }

    // 3. CODE node with dangerous patterns
    if (node.type === "CODE") {
      const code = String(node.data?.code ?? "");
      if (/process\.env/i.test(code)) {
        addFinding({
          severity: "medium",
          title: "Code node reads environment variables",
          description: `Node "${node.name}" accesses process.env which may expose server secrets.`,
          nodeId: node.id,
          nodeName: node.name,
          recommendation: "Use the Credentials system or workflow variables instead of process.env.",
        });
      }
      if (/eval\s*\(/i.test(code) || /new\s+Function\s*\(/i.test(code)) {
        addFinding({
          severity: "critical",
          title: "Dynamic code execution detected",
          description: `Node "${node.name}" uses eval() or new Function() which can execute arbitrary code.`,
          nodeId: node.id,
          nodeName: node.name,
          recommendation: "Remove dynamic code execution. Refactor to use static logic.",
        });
      }
    }

    // 4. Hardcoded credentials in node data (simple heuristic)
    const dataStr = JSON.stringify(node.data);
    const hasHardcodedKey = /(password|secret|apikey|api_key|token)\s*["']?\s*:\s*["'][^{}\s]{8,}/i.test(dataStr);
    if (hasHardcodedKey && node.type !== "CODE") {
      addFinding({
        severity: "high",
        title: "Possible hardcoded credential",
        description: `Node "${node.name}" may contain a hardcoded secret or API key.`,
        nodeId: node.id,
        nodeName: node.name,
        recommendation: "Use the Credentials system to store secrets securely.",
      });
    }
  }

  // 5. Active workflow with no nodes
  if (workflow.isActive && workflow.nodes.length === 0) {
    addFinding({
      severity: "low",
      title: "Active workflow with no nodes",
      description: "This workflow is active but has no nodes configured.",
      recommendation: "Add nodes to the workflow or deactivate it.",
    });
  }

  // 6. Excessive number of HTTP request nodes (potential DDoS risk)
  const httpNodes = workflow.nodes.filter((n) => n.type === "HTTP_REQUEST");
  if (httpNodes.length > 20) {
    addFinding({
      severity: "medium",
      title: "Excessive HTTP request nodes",
      description: `Workflow has ${httpNodes.length} HTTP request nodes which could cause excessive external API calls.`,
      recommendation: "Review the workflow design and consider rate limiting.",
    });
  }

  // Calculate score (100 - penalty per finding)
  const penalty = findings.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);
  const score = Math.max(0, 100 - penalty);

  return {
    workflowId: workflow.id,
    workflowName: workflow.name,
    findings,
    scannedAt: new Date(),
    score,
  };
}

/**
 * Summarise scan results from multiple workflows.
 */
export function summarizeScanResults(results: ScanResult[]): {
  totalWorkflows: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  averageScore: number;
  mostVulnerable: ScanResult | null;
} {
  let totalFindings = 0;
  let criticalCount = 0;
  let highCount = 0;
  let lowestScore = 101;
  let mostVulnerable: ScanResult | null = null;

  for (const r of results) {
    totalFindings += r.findings.length;
    criticalCount += r.findings.filter((f) => f.severity === "critical").length;
    highCount += r.findings.filter((f) => f.severity === "high").length;
    if (r.score < lowestScore) {
      lowestScore = r.score;
      mostVulnerable = r;
    }
  }

  const averageScore =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.score, 0) / results.length
      : 100;

  return {
    totalWorkflows: results.length,
    totalFindings,
    criticalCount,
    highCount,
    averageScore: Math.round(averageScore),
    mostVulnerable,
  };
}

/**
 * Filter findings by severity.
 */
export function filterFindingsBySeverity(
  findings: SecurityFinding[],
  minSeverity: SecuritySeverity
): SecurityFinding[] {
  const order: SecuritySeverity[] = ["info", "low", "medium", "high", "critical"];
  const minIndex = order.indexOf(minSeverity);
  return findings.filter((f) => order.indexOf(f.severity) >= minIndex);
}
