'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { OpsShell } from '@/modules/ops/components/OpsShell';
import { useOpsDepartments } from '@/modules/ops/lib/hooks';
import { apiFetch } from '@/modules/shared/lib/api';
import { useApiToken } from '@/modules/shared/lib/useApiToken';

export default function OpsDepartmentsPage() {
  const { data, isLoading } = useOpsDepartments();
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: async () =>
      apiFetch('/api/ops/departments', {
        method: 'POST',
        token: await getToken(),
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      setName('');
      void qc.invalidateQueries({ queryKey: ['ops', 'departments'] });
    },
  });
  const rows = data?.data ?? [];

  return (
    <ModuleGuard moduleId="ops">
      <OpsShell
        title="Departments"
        subtitle="Sales, Accounts, Support — org units for reporting and targets."
        actions={
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate();
            }}
            style={{ display: 'flex', gap: 6 }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New department"
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
          {rows.map((d: any) => (
            <li key={d.id} style={{ padding: '10px 0', borderBottom: '1px solid color-mix(in srgb, var(--border) 80%, transparent)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 500 }}>{d.name}</span>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>{d.status}</span>
            </li>
          ))}
        </ul>
      </OpsShell>
    </ModuleGuard>
  );
}
