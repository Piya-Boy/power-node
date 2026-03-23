
$out = 'src/features/workflows/lib/retry-policy.ts'
$content = @'
export type BackoffStrategy = 'fixed' | 'linear' | 'exponential' | 'jitter';
export type RetryCondition = 'always' | 'on_error' | 'on_timeout' | 'on_rate_limit' | 'never';
export interface RetryPolicy {
  maxAttempts: number;
  backoff: BackoffStrategy;
  baseDelayMs: number;
  maxDelayMs: number;
  conditions: RetryCondition[];
  retryOn?: number[];
  noRetryOn?: number[];
  timeout?: number;
  jitterFactor?: number;
}
export interface AttemptRecord {
  attempt: number;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  success: boolean;
  error?: string;
  errorCode?: string;
  httpStatus?: number;
  nextDelayMs?: number;
}
'@
Set-Content -Path $out -Value $content -Encoding UTF8
Write-Host done
$