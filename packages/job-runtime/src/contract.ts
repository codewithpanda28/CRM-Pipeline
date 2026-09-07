import type { JobDefinition } from './types';
import { DEFAULT_TIMEOUT_MS, MAX_RETRY_ATTEMPTS, MAX_TIMEOUT_MS } from './types';
import { resolveRetryPolicy } from './retries';

export interface JobContractIssue {
  code: string;
  message: string;
}

/**
 * Contract checks for production job adapters (Phase 2B Task 5).
 * Does not enqueue — pure validation of JobDefinition shape/policy.
 */
export function assertJobDefinitionContract(
  def: JobDefinition,
  opts?: { requireIdempotency?: boolean },
): JobContractIssue[] {
  const issues: JobContractIssue[] = [];

  if (!def.name || !def.name.trim()) {
    issues.push({ code: 'MISSING_NAME', message: 'job name required' });
  }
  if (def.scope !== 'tenant' && def.scope !== 'platform') {
    issues.push({ code: 'INVALID_SCOPE', message: 'scope must be tenant|platform' });
  }
  if (def.scope === 'tenant' && !def.tenantId) {
    issues.push({ code: 'TENANT_REQUIRED', message: 'tenant-scoped jobs require tenantId' });
  }
  if (def.scope === 'platform' && def.tenantId === undefined) {
    // platform must be explicit null or omit — undefined ok; empty string not
    // Prefer explicit null for clarity
  }
  if (def.tenantId === '') {
    issues.push({ code: 'EMPTY_TENANT', message: 'tenantId must not be empty string' });
  }

  if (opts?.requireIdempotency && !def.idempotencyKey) {
    issues.push({ code: 'IDEMPOTENCY_REQUIRED', message: 'idempotencyKey required for this job class' });
  }

  if (!def.trace?.correlationId) {
    issues.push({ code: 'TRACE_REQUIRED', message: 'trace.correlationId required' });
  }

  const retry = resolveRetryPolicy(def.retryPolicy);
  if (retry.maxAttempts < 1 || retry.maxAttempts > MAX_RETRY_ATTEMPTS) {
    issues.push({ code: 'RETRY_UNBOUNDED', message: `maxAttempts must be 1..${MAX_RETRY_ATTEMPTS}` });
  }

  const timeout = def.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (timeout < 1_000 || timeout > MAX_TIMEOUT_MS) {
    issues.push({ code: 'TIMEOUT_INVALID', message: `timeoutMs must be 1000..${MAX_TIMEOUT_MS}` });
  }

  if (!def.queue) {
    issues.push({ code: 'QUEUE_REQUIRED', message: 'queue required' });
  }

  return issues;
}

export function assertJobDefinitionContractOrThrow(
  def: JobDefinition,
  opts?: { requireIdempotency?: boolean },
): void {
  const issues = assertJobDefinitionContract(def, opts);
  if (issues.length > 0) {
    throw new Error(`Job contract violated: ${issues.map((i) => i.code).join(',')}`);
  }
}
