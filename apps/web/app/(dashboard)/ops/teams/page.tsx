'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { OpsShell } from '@/modules/ops/components/OpsShell';
import { useOpsTeams, useOpsDepartments } from '@/modules/ops/lib/hooks';
import { apiFetch } from '@/modules/shared/lib/api';
import { useApiToken } from '@/modules/shared/lib/useApiToken';

export default function OpsTeamsPage() {
  const { data, isLoading } = useOpsTeams();
  const depts = useOpsDepartments();
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const create = useMutation({
    mutationFn: async () =>
      apiFetch('/api/ops/teams', {
        method: 'POST',
        token: await getToken(),
        body: JSON.stringify({ name, department_id: departmentId }),
      }),
    onSuccess: () => {
      setName('');
      void qc.invalidateQueries({ queryKey: ['ops', 'teams'] });
    },
  });
  const rows = data?.data ?? [];
  const deptList = depts.data?.data ?? [];

  return (
    <ModuleGuard moduleId="ops">
      <OpsShell
        title="Teams"
        subtitle="Each team belongs to exactly one department."
        actions={
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && departmentId) create.mutate();
            }}
            style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
          >
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              style={{ fontSize: 13, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)' }}
            >
              <option value="">Department…</option>
              {deptList.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Team name"
              style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <button type="submit" style={{ fontSize: 13, padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--nav-fg)', color: 'var(--nav-bg)', cursor: 'pointer' }}>
              Add
            </button>
          </form>
        }
      >
        {isLoading ? <p style={{ color: 'var(--muted)' }}>Loading…</p> : null}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.map((t: any) => (
            <li key={t.id} style={{ padding: '10px 0', borderBottom: '1px solid color-mix(in srgb, var(--border) 80%, transparent)' }}>
              <strong>{t.name}</strong>
              <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 8 }}>{t.status}</span>
            </li>
          ))}
        </ul>
      </OpsShell>
    </ModuleGuard>
  );
}
