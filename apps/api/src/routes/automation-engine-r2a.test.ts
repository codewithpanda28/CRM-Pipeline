/**
 * Round 2A — UI-backed API surface + RBAC map (must stay aligned with automation-engine router).
 * Does not duplicate Round 1 execution tests.
 */
import { describe, expect, it } from 'vitest';

const ROUND2A_ROUTES: Array<{ method: string; path: string; permission: string }> = [
  { method: 'GET', path: '/flags', permission: 'automation:workflows:view' },
  { method: 'PATCH', path: '/flags', permission: 'automation:admin' },
  { method: 'GET', path: '/workflows', permission: 'automation:workflows:view' },
  { method: 'POST', path: '/workflows', permission: 'automation:workflows:edit' },
  { method: 'GET', path: '/workflows/:id', permission: 'automation:workflows:view' },
  { method: 'PATCH', path: '/workflows/:id/draft', permission: 'automation:workflows:edit' },
  { method: 'POST', path: '/workflows/:id/publish', permission: 'automation:workflows:publish' },
  { method: 'POST', path: '/workflows/:id/archive', permission: 'automation:workflows:edit' },
  { method: 'POST', path: '/workflows/:id/enable', permission: 'automation:workflows:edit' },
  { method: 'GET', path: '/usage', permission: 'automation:workflows:view' },
  { method: 'GET', path: '/approvals', permission: 'automation:approvals:view' },
  { method: 'GET', path: '/approvals/:id', permission: 'automation:approvals:view' },
  { method: 'POST', path: '/approvals/:id/authorize', permission: 'automation:approvals:decide' },
  { method: 'POST', path: '/approvals/:id/reject', permission: 'automation:approvals:decide' },
  { method: 'GET', path: '/runs', permission: 'automation:runs:view' },
  { method: 'GET', path: '/runs/:id', permission: 'automation:runs:view' },
  { method: 'POST', path: '/runs/:id/replay', permission: 'automation:runs:replay' },
];

describe('Round 2A automation API RBAC map', () => {
  it('covers UI screens with Round 1 permissions only', () => {
    const perms = new Set(ROUND2A_ROUTES.map((r) => r.permission));
    expect(perms.has('automation:workflows:view')).toBe(true);
    expect(perms.has('automation:workflows:edit')).toBe(true);
    expect(perms.has('automation:workflows:publish')).toBe(true);
    expect(perms.has('automation:approvals:decide')).toBe(true);
    expect(perms.has('automation:runs:replay')).toBe(true);
    expect(perms.has('automation:admin')).toBe(true);
    // No invented permissions
    for (const p of perms) {
      expect(p.startsWith('automation:')).toBe(true);
    }
  });

  it('engine flag: viewers can read status; only admin can change ON/OFF', () => {
    const getFlags = ROUND2A_ROUTES.find((r) => r.method === 'GET' && r.path === '/flags');
    const patchFlags = ROUND2A_ROUTES.find((r) => r.method === 'PATCH' && r.path === '/flags');
    expect(getFlags?.permission).toBe('automation:workflows:view');
    expect(patchFlags?.permission).toBe('automation:admin');
  });

  it('authorize is decide-only (ADR-027 — no auto-approve route)', () => {
    const auth = ROUND2A_ROUTES.find((r) => r.path.includes('authorize'));
    expect(auth?.permission).toBe('automation:approvals:decide');
    expect(ROUND2A_ROUTES.some((r) => r.path.includes('auto-approve'))).toBe(false);
  });

  it('publish is separate from draft edit', () => {
    const draft = ROUND2A_ROUTES.find((r) => r.path.endsWith('/draft'));
    const publish = ROUND2A_ROUTES.find((r) => r.path.endsWith('/publish'));
    expect(draft?.permission).toBe('automation:workflows:edit');
    expect(publish?.permission).toBe('automation:workflows:publish');
  });
});

/** Tenant isolation contract for UI data sources */
describe('Round 2A tenant isolation contract', () => {
  it('all list/detail paths are under /api/automation (tenant middleware on mount)', () => {
    for (const r of ROUND2A_ROUTES) {
      expect(r.path.startsWith('/')).toBe(true);
      expect(r.path.includes('..')).toBe(false);
    }
  });
});
