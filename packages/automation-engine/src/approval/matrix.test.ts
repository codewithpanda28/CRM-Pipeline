import { describe, it, expect } from 'vitest';
import { sha256Canonical } from '../hash';

/** Pure ADR-027 validation matrix (mirrors service rules without DB). */
function validateMatrix(input: {
  status: string;
  revoked_at: Date | null;
  expires_at: Date;
  tenant_id: string;
  expectedTenant: string;
  workflow_run_id: string;
  expectedRun: string;
  workflow_run_step_id: string | null;
  expectedStep: string;
  workflow_version_id: string;
  expectedVersion: string;
  snapshot: Record<string, unknown>;
  payload_hash: string;
  approver_id: string | null;
}): string | null {
  if (input.tenant_id !== input.expectedTenant) return 'tenant_mismatch';
  if (input.status === 'pending') return 'pending';
  if (input.status === 'rejected') return 'rejected';
  if (input.status === 'expired') return 'expired';
  if (input.status === 'revoked' || input.revoked_at) return 'revoked';
  if (input.status !== 'authorized') return `status:${input.status}`;
  if (input.expires_at.getTime() <= Date.now()) return 'expired';
  if (input.workflow_run_id !== input.expectedRun) return 'run_mismatch';
  if (input.workflow_run_step_id !== input.expectedStep) return 'step_mismatch';
  if (input.workflow_version_id !== input.expectedVersion) return 'version_mismatch';
  if (!input.approver_id) return 'approver_missing';
  if (sha256Canonical(input.snapshot) !== input.payload_hash) return 'payload_hash_mismatch';
  return null;
}

describe('ADR-027 validation matrix', () => {
  const base = {
    status: 'authorized',
    revoked_at: null as Date | null,
    expires_at: new Date(Date.now() + 60_000),
    tenant_id: 't1',
    expectedTenant: 't1',
    workflow_run_id: 'r1',
    expectedRun: 'r1',
    workflow_run_step_id: 's1',
    expectedStep: 's1',
    workflow_version_id: 'v1',
    expectedVersion: 'v1',
    snapshot: { action_type: 'critical.stub', params: {} },
    payload_hash: '',
    approver_id: 'u1' as string | null,
  };
  base.payload_hash = sha256Canonical(base.snapshot);

  it('allows valid authorized', () => {
    expect(validateMatrix(base)).toBeNull();
  });

  it.each([
    ['pending', { status: 'pending' }],
    ['rejected', { status: 'rejected' }],
    ['expired status', { status: 'expired' }],
    ['revoked', { status: 'revoked' }],
    ['revoked_at', { revoked_at: new Date() }],
    ['time expired', { expires_at: new Date(Date.now() - 1000) }],
    ['tenant', { expectedTenant: 't2' }],
    ['run', { expectedRun: 'r2' }],
    ['step', { expectedStep: 's2' }],
    ['version', { expectedVersion: 'v2' }],
    ['approver', { approver_id: null }],
    ['hash', { payload_hash: 'deadbeef' }],
  ] as const)('blocks %s', (_name, patch) => {
    expect(validateMatrix({ ...base, ...patch })).not.toBeNull();
  });
});
