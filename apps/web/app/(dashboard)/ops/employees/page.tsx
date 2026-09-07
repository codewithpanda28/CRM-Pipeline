'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { OpsShell } from '@/modules/ops/components/OpsShell';
import { useOpsEmployees, useOpsDepartments, useOpsTeams } from '@/modules/ops/lib/hooks';
import { apiFetch } from '@/modules/shared/lib/api';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';

type WorkspaceUser = { id: string; name: string; email?: string };

const field: React.CSSProperties = {
  fontSize: 13,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontFamily: 'var(--font-sans)',
  width: '100%',
  boxSizing: 'border-box',
};

const btn: React.CSSProperties = {
  fontSize: 13,
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  cursor: 'pointer',
  color: 'var(--text)',
  fontFamily: 'var(--font-sans)',
};

const btnPrimary: React.CSSProperties = {
  ...btn,
  background: 'var(--nav-fg, var(--text))',
  color: 'var(--nav-bg, var(--bg))',
  borderColor: 'transparent',
  fontWeight: 600,
};

export default function OpsEmployeesPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('ops.employees.manage');
  const { data, isLoading } = useOpsEmployees();
  const { data: depts } = useOpsDepartments();
  const { data: teams } = useOpsTeams();
  const getToken = useApiToken();
  const qc = useQueryClient();
  const rows = data?.data ?? [];
  const existingUserIds = useMemo(
    () => new Set(rows.map((e: { user_id?: string }) => e.user_id).filter(Boolean)),
    [rows],
  );

  const { data: usersData } = useQuery({
    queryKey: ['workspace-users', 'ops-employees'],
    queryFn: async () =>
      apiFetch<{ data: WorkspaceUser[] }>('/api/users', { token: await getToken() }),
    enabled: canManage,
  });
  const users = (usersData?.data ?? []).filter((u) => !existingUserIds.has(u.id));

  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    user_id: '',
    display_name: '',
    designation: '',
    employee_code: '',
    primary_department_id: '',
    primary_team_id: '',
    manager_employee_id: '',
    work_email: '',
    work_phone: '',
    status: 'active' as 'active' | 'inactive',
    commission_eligible: false,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.user_id) throw new Error('Select a user login to link');
      const body: Record<string, unknown> = {
        user_id: form.user_id,
        status: form.status,
        commission_eligible: form.commission_eligible,
      };
      if (form.display_name.trim()) body.display_name = form.display_name.trim();
      if (form.designation.trim()) body.designation = form.designation.trim();
      if (form.employee_code.trim()) body.employee_code = form.employee_code.trim();
      if (form.primary_department_id) body.primary_department_id = form.primary_department_id;
      if (form.primary_team_id) body.primary_team_id = form.primary_team_id;
      if (form.manager_employee_id) body.manager_employee_id = form.manager_employee_id;
      if (form.work_email.trim()) body.work_email = form.work_email.trim();
      if (form.work_phone.trim()) body.work_phone = form.work_phone.trim();
      return apiFetch('/api/ops/employees', {
        method: 'POST',
        token: await getToken(),
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      setFormError(null);
      setShowCreate(false);
      setForm({
        user_id: '',
        display_name: '',
        designation: '',
        employee_code: '',
        primary_department_id: '',
        primary_team_id: '',
        manager_employee_id: '',
        work_email: '',
        work_phone: '',
        status: 'active',
        commission_eligible: false,
      });
      void qc.invalidateQueries({ queryKey: ['ops', 'employees'] });
    },
    onError: (e: Error) => setFormError(e.message),
  });

  return (
    <ModuleGuard moduleId="ops">
      <OpsShell
        title="Employees"
        subtitle="Org profiles linked to existing user logins — not separate accounts."
        actions={
          canManage ? (
            <button type="button" style={btnPrimary} onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? 'Close' : '+ Create employee'}
            </button>
          ) : null
        }
      >
        {showCreate && canManage ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setFormError(null);
              create.mutate();
            }}
            style={{
              display: 'grid',
              gap: 10,
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              padding: 14,
              marginBottom: 20,
              border: '1px solid var(--border)',
              borderRadius: 12,
              background: 'var(--surface)',
              alignItems: 'end',
            }}
          >
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
              User login *
              <select
                required
                value={form.user_id}
                onChange={(e) => {
                  const u = users.find((x) => x.id === e.target.value);
                  setForm((f) => ({
                    ...f,
                    user_id: e.target.value,
                    display_name: f.display_name || u?.name || '',
                    work_email: f.work_email || u?.email || '',
                  }));
                }}
                style={field}
              >
                <option value="">Select user…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.email ? ` · ${u.email}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
              Display name
              <input
                value={form.display_name}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                style={field}
                placeholder="Defaults to user name"
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
              Designation
              <input
                value={form.designation}
                onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
                style={field}
                placeholder="e.g. Sales Executive"
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
              Employee code
              <input
                value={form.employee_code}
                onChange={(e) => setForm((f) => ({ ...f, employee_code: e.target.value }))}
                style={field}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
              Department
              <select
                value={form.primary_department_id}
                onChange={(e) => setForm((f) => ({ ...f, primary_department_id: e.target.value }))}
                style={field}
              >
                <option value="">—</option>
                {(depts?.data ?? []).map((d: { id: string; name: string }) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
              Team
              <select
                value={form.primary_team_id}
                onChange={(e) => setForm((f) => ({ ...f, primary_team_id: e.target.value }))}
                style={field}
              >
                <option value="">—</option>
                {(teams?.data ?? []).map((t: { id: string; name: string }) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
              Manager
              <select
                value={form.manager_employee_id}
                onChange={(e) => setForm((f) => ({ ...f, manager_employee_id: e.target.value }))}
                style={field}
              >
                <option value="">—</option>
                {rows.map((e: { id: string; display_name: string }) => (
                  <option key={e.id} value={e.id}>
                    {e.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
              Work email
              <input
                value={form.work_email}
                onChange={(e) => setForm((f) => ({ ...f, work_email: e.target.value }))}
                style={field}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
              Work phone
              <input
                value={form.work_phone}
                onChange={(e) => setForm((f) => ({ ...f, work_phone: e.target.value }))}
                style={field}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
              Status
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as 'active' | 'inactive' }))
                }
                style={field}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: 'var(--text2)',
                paddingBottom: 8,
              }}
            >
              <input
                type="checkbox"
                checked={form.commission_eligible}
                onChange={(e) => setForm((f) => ({ ...f, commission_eligible: e.target.checked }))}
              />
              Commission eligible
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', gridColumn: '1 / -1' }}>
              <button type="submit" style={btnPrimary} disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create employee'}
              </button>
              <button
                type="button"
                style={btn}
                onClick={() => {
                  setShowCreate(false);
                  setFormError(null);
                }}
              >
                Cancel
              </button>
            </div>
            {formError ? (
              <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--red)', gridColumn: '1 / -1' }}>
                {formError}
              </p>
            ) : null}
            {users.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)', gridColumn: '1 / -1' }}>
                Every workspace user already has an employee profile, or no users are available.
              </p>
            ) : null}
          </form>
        ) : null}

        {isLoading ? <p style={{ color: 'var(--muted)' }}>Loading…</p> : null}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={{ padding: '8px 4px' }}>Name</th>
                <th style={{ padding: '8px 4px' }}>Designation</th>
                <th style={{ padding: '8px 4px' }}>Status</th>
                <th style={{ padding: '8px 4px' }}>Commission</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e: {
                id: string;
                display_name: string;
                designation?: string | null;
                status: string;
                commission_eligible?: boolean;
              }) => (
                <tr key={e.id} style={{ borderTop: '1px solid color-mix(in srgb, var(--border) 80%, transparent)' }}>
                  <td style={{ padding: '10px 4px', fontWeight: 500 }}>{e.display_name}</td>
                  <td style={{ padding: '10px 4px' }}>{e.designation ?? '—'}</td>
                  <td style={{ padding: '10px 4px' }}>{e.status}</td>
                  <td style={{ padding: '10px 4px' }}>{e.commission_eligible ? 'Eligible' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isLoading && rows.length === 0 ? <p style={{ color: 'var(--muted)' }}>No employee profiles yet.</p> : null}
      </OpsShell>
    </ModuleGuard>
  );
}
