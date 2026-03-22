/**
 * Phase 66 — Workflow Health Monitor
 * Pure utilities for computing workflow health scores, diagnosing
 * issues, generating recommendations, and producing health reports.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type HealthStatus = "healthy" | "degraded" | "critical" | "unknown";

export type IssueSeverity = "info" | "warning" | "critical";

export type IssueCategory =
  | "performance"
  | "reliability"
  | "configuration"
  | "security"
  | "cost"
  | "compliance";

export interface WorkflowHealthSnapshot {
  workflowId: string;
  collectedAt: Date;
  // Performance
  avgDurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  // Reliability
  successRate: number;          // 0-100
  failureRate: number;          // 0-100
  consecutiveFailures: number;
  // Activity
  totalRunsLast24h: number;
  totalRunsLast7d: number;
  lastRunAt?: Date;
  // Resources
  estimatedMonthlyCostUsd: number;
  nodeCount: number;
  // Security
  hasUnencryptedCredentials: boolean;
  exposedSecrets: number;
  // Configuration
  hasMissingRequiredInputs: boolean;
  hasOrphanedNodes: boolean;
  lastUpdatedAt?: Date;
}

export interface HealthIssue {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  recommendation: string;
  affectedField?: string;
}

export interface HealthScore {
  workflowId: string;
  overallScore: number;         // 0-100
  status: HealthStatus;
  categoryScores: Record<IssueCategory, number>;
  issues: HealthIssue[];
  grade: "A" | "B" | "C" | "D" | "F";
  computedAt: Date;
}

export interface HealthThresholds {
  minSuccessRate: number;       // default: 95
  maxAvgDurationMs: number;     // default: 30_000
  maxP95DurationMs: number;     // default: 60_000
  maxConsecutiveFailures: number; // default: 3
  maxMonthlyCostUsd: number;    // default: 100
  minRunsPerDay: number;        // default: 0 (no minimum)
  maxExposedSecrets: number;    // default: 0
}

const DEFAULT_THRESHOLDS: HealthThresholds = {
  minSuccessRate: 95,
  maxAvgDurationMs: 30_000,
  maxP95DurationMs: 60_000,
  maxConsecutiveFailures: 3,
  maxMonthlyCostUsd: 100,
  minRunsPerDay: 0,
  maxExposedSecrets: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Issue Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect health issues from a snapshot.
 */
export function detectIssues(
  snapshot: WorkflowHealthSnapshot,
  thresholds: Partial<HealthThresholds> = {}
): HealthIssue[] {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const issues: HealthIssue[] = [];
  let issueIndex = 0;

  function addIssue(issue: Omit<HealthIssue, "id">): void {
    issues.push({ ...issue, id: `issue_${++issueIndex}` });
  }

  // Performance issues
  if (snapshot.avgDurationMs > t.maxAvgDurationMs) {
    addIssue({
      category: "performance",
      severity: snapshot.avgDurationMs > t.maxAvgDurationMs * 2 ? "critical" : "warning",
      title: "High average execution time",
      description: `Average execution time is ${(snapshot.avgDurationMs / 1000).toFixed(1)}s (threshold: ${t.maxAvgDurationMs / 1000}s)`,
      recommendation: "Optimize slow nodes, add caching, or increase parallelism",
      affectedField: "avgDurationMs",
    });
  }

  if (snapshot.p95DurationMs > t.maxP95DurationMs) {
    addIssue({
      category: "performance",
      severity: "warning",
      title: "High p95 execution time",
      description: `p95 execution time is ${(snapshot.p95DurationMs / 1000).toFixed(1)}s (threshold: ${t.maxP95DurationMs / 1000}s)`,
      recommendation: "Investigate outlier executions and optimize bottleneck nodes",
      affectedField: "p95DurationMs",
    });
  }

  // Reliability issues
  if (snapshot.successRate < t.minSuccessRate) {
    const severity: IssueSeverity = snapshot.successRate < 80 ? "critical" : "warning";
    addIssue({
      category: "reliability",
      severity,
      title: "Low success rate",
      description: `Success rate is ${snapshot.successRate.toFixed(1)}% (minimum: ${t.minSuccessRate}%)`,
      recommendation: "Review error logs, add retry logic, and fix failing nodes",
      affectedField: "successRate",
    });
  }

  if (snapshot.consecutiveFailures >= t.maxConsecutiveFailures) {
    addIssue({
      category: "reliability",
      severity: "critical",
      title: "Consecutive failures detected",
      description: `${snapshot.consecutiveFailures} consecutive failures — workflow may be broken`,
      recommendation: "Investigate the last execution error and fix the root cause immediately",
      affectedField: "consecutiveFailures",
    });
  }

  // Activity issues
  if (snapshot.totalRunsLast24h === 0 && snapshot.lastRunAt) {
    const daysSinceLast = (Date.now() - snapshot.lastRunAt.getTime()) / 86_400_000;
    if (daysSinceLast > 1) {
      addIssue({
        category: "reliability",
        severity: "info",
        title: "No recent activity",
        description: `No runs in the last 24 hours (last run was ${daysSinceLast.toFixed(0)} days ago)`,
        recommendation: "Check if the workflow trigger is active",
        affectedField: "totalRunsLast24h",
      });
    }
  }

  // Security issues
  if (snapshot.hasUnencryptedCredentials) {
    addIssue({
      category: "security",
      severity: "critical",
      title: "Unencrypted credentials detected",
      description: "This workflow contains credentials that are not encrypted",
      recommendation: "Encrypt all credentials using the credential store",
      affectedField: "hasUnencryptedCredentials",
    });
  }

  if (snapshot.exposedSecrets > t.maxExposedSecrets) {
    addIssue({
      category: "security",
      severity: "critical",
      title: "Exposed secrets detected",
      description: `${snapshot.exposedSecrets} secret(s) may be exposed in workflow configuration`,
      recommendation: "Move secrets to the credential store and use references",
      affectedField: "exposedSecrets",
    });
  }

  // Configuration issues
  if (snapshot.hasMissingRequiredInputs) {
    addIssue({
      category: "configuration",
      severity: "warning",
      title: "Missing required inputs",
      description: "Some nodes have required inputs that are not connected",
      recommendation: "Connect all required input ports before enabling this workflow",
      affectedField: "hasMissingRequiredInputs",
    });
  }

  if (snapshot.hasOrphanedNodes) {
    addIssue({
      category: "configuration",
      severity: "info",
      title: "Orphaned nodes detected",
      description: "Some nodes are not connected to the main workflow path",
      recommendation: "Remove or connect orphaned nodes to reduce confusion",
      affectedField: "hasOrphanedNodes",
    });
  }

  // Cost issues
  if (snapshot.estimatedMonthlyCostUsd > t.maxMonthlyCostUsd) {
    addIssue({
      category: "cost",
      severity: snapshot.estimatedMonthlyCostUsd > t.maxMonthlyCostUsd * 2 ? "critical" : "warning",
      title: "High estimated cost",
      description: `Estimated monthly cost is $${snapshot.estimatedMonthlyCostUsd.toFixed(2)} (threshold: $${t.maxMonthlyCostUsd})`,
      recommendation: "Reduce execution frequency, optimize AI model usage, or use cheaper alternatives",
      affectedField: "estimatedMonthlyCostUsd",
    });
  }

  return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// Score Computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a health score from a snapshot.
 */
export function computeHealthScore(
  snapshot: WorkflowHealthSnapshot,
  thresholds: Partial<HealthThresholds> = {},
  now?: Date
): HealthScore {
  const issues = detectIssues(snapshot, thresholds);
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };

  // Category scores: start at 100, deduct for issues
  const categoryScores: Record<IssueCategory, number> = {
    performance: 100,
    reliability: 100,
    configuration: 100,
    security: 100,
    cost: 100,
    compliance: 100,
  };

  const deductions: Record<IssueSeverity, number> = { info: 5, warning: 15, critical: 35 };

  for (const issue of issues) {
    categoryScores[issue.category] = Math.max(0, categoryScores[issue.category] - deductions[issue.severity]);
  }

  const overallScore = Math.round(
    Object.values(categoryScores).reduce((a, b) => a + b, 0) / Object.keys(categoryScores).length
  );

  const status: HealthStatus =
    overallScore >= 85 ? "healthy" :
    overallScore >= 60 ? "degraded" :
    overallScore > 0 ? "critical" : "unknown";

  const grade: HealthScore["grade"] =
    overallScore >= 90 ? "A" :
    overallScore >= 80 ? "B" :
    overallScore >= 70 ? "C" :
    overallScore >= 60 ? "D" : "F";

  return {
    workflowId: snapshot.workflowId,
    overallScore,
    status,
    categoryScores,
    issues,
    grade,
    computedAt: now ?? new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparison & Trending
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compare two health scores and describe the change.
 */
export function compareHealthScores(
  previous: HealthScore,
  current: HealthScore
): {
  scoreDelta: number;
  trend: "improving" | "stable" | "degrading";
  newIssues: HealthIssue[];
  resolvedIssues: HealthIssue[];
} {
  const scoreDelta = current.overallScore - previous.overallScore;
  const trend: "improving" | "stable" | "degrading" =
    scoreDelta > 5 ? "improving" : scoreDelta < -5 ? "degrading" : "stable";

  const prevIssueFields = new Set(previous.issues.map((i) => i.affectedField));
  const currIssueFields = new Set(current.issues.map((i) => i.affectedField));

  const newIssues = current.issues.filter((i) => !prevIssueFields.has(i.affectedField));
  const resolvedIssues = previous.issues.filter((i) => !currIssueFields.has(i.affectedField));

  return { scoreDelta, trend, newIssues, resolvedIssues };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fleet Health
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute fleet-level health summary across multiple workflows.
 */
export function computeFleetHealth(scores: HealthScore[]): {
  totalWorkflows: number;
  healthy: number;
  degraded: number;
  critical: number;
  avgScore: number;
  topIssues: Array<{ title: string; count: number; severity: IssueSeverity }>;
} {
  if (scores.length === 0) {
    return { totalWorkflows: 0, healthy: 0, degraded: 0, critical: 0, avgScore: 0, topIssues: [] };
  }

  let healthy = 0, degraded = 0, critical = 0;
  const issueMap = new Map<string, { count: number; severity: IssueSeverity }>();

  for (const score of scores) {
    if (score.status === "healthy") healthy++;
    else if (score.status === "degraded") degraded++;
    else critical++;

    for (const issue of score.issues) {
      const existing = issueMap.get(issue.title);
      if (existing) existing.count++;
      else issueMap.set(issue.title, { count: 1, severity: issue.severity });
    }
  }

  const avgScore = Math.round(scores.reduce((s, h) => s + h.overallScore, 0) / scores.length);

  const topIssues = [...issueMap.entries()]
    .map(([title, info]) => ({ title, ...info }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return { totalWorkflows: scores.length, healthy, degraded, critical, avgScore, topIssues };
}

/**
 * Filter workflows by health status.
 */
export function filterByStatus(scores: HealthScore[], status: HealthStatus): HealthScore[] {
  return scores.filter((s) => s.status === status);
}

/**
 * Sort health scores by overall score (worst first by default).
 */
export function sortByHealthScore(
  scores: HealthScore[],
  order: "asc" | "desc" = "asc"
): HealthScore[] {
  return [...scores].sort((a, b) =>
    order === "asc" ? a.overallScore - b.overallScore : b.overallScore - a.overallScore
  );
}
