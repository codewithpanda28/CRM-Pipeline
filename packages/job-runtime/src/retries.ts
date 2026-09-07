import {
  DEFAULT_RETRY_POLICY,
  MAX_RETRY_ATTEMPTS,
  type JobRetryPolicy,
} from './types';

export class RetryableJobError extends Error {
  readonly retryable = true as const;
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'RetryableJobError';
  }
}

export class PermanentJobError extends Error {
  readonly retryable = false as const;
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

export function isRetryableError(err: unknown): boolean {
  if (err instanceof PermanentJobError) return false;
  if (err instanceof RetryableJobError) return true;
  if (err && typeof err === 'object' && 'retryable' in err) {
    return Boolean((err as { retryable: boolean }).retryable);
  }
  // Unknown errors are retryable by default (transient infra).
  return true;
}

/** Clamp arbitrary input so jobs cannot abuse retries. */
export function resolveRetryPolicy(partial?: Partial<JobRetryPolicy>): JobRetryPolicy {
  const base = { ...DEFAULT_RETRY_POLICY, ...partial };
  return {
    maxAttempts: Math.min(Math.max(1, Math.floor(base.maxAttempts)), MAX_RETRY_ATTEMPTS),
    backoff: base.backoff === 'fixed' ? 'fixed' : 'exponential',
    baseDelayMs: Math.min(Math.max(100, base.baseDelayMs), base.maxDelayMs),
    maxDelayMs: Math.min(Math.max(1_000, base.maxDelayMs), 60 * 60_000),
    jitterRatio: Math.min(Math.max(0, base.jitterRatio), 0.5),
  };
}

export function computeBackoffDelayMs(policy: JobRetryPolicy, attempt: number): number {
  const n = Math.max(1, attempt);
  let delay =
    policy.backoff === 'fixed'
      ? policy.baseDelayMs
      : policy.baseDelayMs * Math.pow(2, n - 1);
  delay = Math.min(delay, policy.maxDelayMs);
  const jitter = delay * policy.jitterRatio * Math.random();
  return Math.floor(delay + jitter);
}
