import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('20260907_001_backfill_workspace_tenants', () => {
  const source = readFileSync(
    join(__dirname, '20260907_001_backfill_workspace_tenants.ts'),
    'utf-8',
  );

  it('only inserts with ON CONFLICT DO NOTHING (non-destructive)', () => {
    expect(source).toContain('ON CONFLICT (id) DO NOTHING');
    expect(source).toContain('ON CONFLICT (tenant_id, user_id) DO NOTHING');
    expect(source).not.toMatch(/\bTRUNCATE\s+/i);
    expect(source).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(source).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it('backfills tenants from workspaces preserving id', () => {
    expect(source).toContain('FROM workspaces w');
    expect(source).toContain('INSERT INTO tenants');
    expect(source).toContain('INSERT INTO tenant_memberships');
    expect(source).toContain('INSERT INTO tenant_job_controls');
  });
});
