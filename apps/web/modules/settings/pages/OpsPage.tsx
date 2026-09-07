'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import {
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
  pageShellStyle,
  panelStyle,
  sectionTitleStyle,
} from '@/modules/crm/shared/ui';
import {
  listFailedJobs,
  listTenantExports,
  replayFailedJob,
  requestTenantExport,
} from '@/modules/finance/lib/api';

export default function OpsPage() {
  const { user, hasPermission } = useAuth();
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const canExport = hasPermission('ops:export');
  const canJobs = hasPermission('ops:jobs');
  const allowed = canExport || canJobs || Boolean(user?.isAdmin);

  const exportsQ = useQuery({
    queryKey: ['ops-exports'],
    queryFn: async () => listTenantExports(await getToken()),
    enabled: Boolean(user) && (canExport || Boolean(user?.isAdmin)),
    retry: false,
  });

  const jobsQ = useQuery({
    queryKey: ['ops-failed-jobs'],
    queryFn: async () => listFailedJobs(await getToken()),
    enabled: Boolean(user) && (canJobs || Boolean(user?.isAdmin)),
    retry: false,
  });

  const exportMut = useMutation({
    mutationFn: async () => requestTenantExport(await getToken()),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['ops-exports'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const replayMut = useMutation({
    mutationFn: async (id: string) => replayFailedJob(await getToken(), id),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['ops-failed-jobs'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!allowed) {
    return (
      <div style={pageShellStyle}>
        <PageHeader title="Operations" subtitle="Admin-only tenant export and failed jobs." />
        <div style={panelStyle}>
          <p style={{ margin: 0, color: 'var(--text2)', fontSize: 13 }}>
            You need ops:export or ops:jobs permission.
          </p>
        </div>
      </div>
    );
  }

  const exports = exportsQ.data?.data ?? [];
  const jobs = jobsQ.data?.data ?? [];

  return (
    <div style={pageShellStyle}>
      <PageHeader
        title="Operations"
        subtitle="Tenant data export and failed job visibility for admins."
        actions={
          <SecondaryButton
            type="button"
            onClick={() => {
              void exportsQ.refetch();
              void jobsQ.refetch();
            }}
          >
            Refresh
          </SecondaryButton>
        }
      />

      {error ? (
        <p role="alert" style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>
          {error}
        </p>
      ) : null}

      {(canExport || user?.isAdmin) ? (
        <section style={{ ...panelStyle, marginBottom: 12 }}>
          <h2 style={sectionTitleStyle}>Tenant export</h2>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text2)' }}>
            Package core CRM, Finance, and document metadata for backup / migration.
          </p>
          <PrimaryButton
            type="button"
            disabled={exportMut.isPending}
            onClick={() => exportMut.mutate()}
          >
            Request export
          </PrimaryButton>
          {exportsQ.isError ? (
            <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text2)' }}>
              Export API not available yet ({(exportsQ.error as Error).message}).
            </p>
          ) : exports.length > 0 ? (
            <ul style={{ margin: '14px 0 0', paddingLeft: 18, fontSize: 13 }}>
              {exports.slice(0, 10).map((job) => (
                <li key={job.id} style={{ marginBottom: 6 }}>
                  <code>{job.id.slice(0, 8)}</code> · <StatusPill status={job.status} />
                  {job.created_at ? ` · ${String(job.created_at).slice(0, 19)}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {(canJobs || user?.isAdmin) ? (
        <section style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Failed jobs</h2>
          </div>
          {jobsQ.isError ? (
            <p style={{ margin: 0, padding: 16, fontSize: 13, color: 'var(--text2)' }}>
              Failed-jobs API not available yet ({(jobsQ.error as Error).message}).
            </p>
          ) : jobs.length === 0 ? (
            <p style={{ margin: 0, padding: 16, fontSize: 13, color: 'var(--text2)' }}>
              No failed jobs (or queue empty).
            </p>
          ) : (
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                    {['Job', 'Reason', 'When', ''].map((h) => (
                      <th
                        key={h || 'a'}
                        style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text2)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                        {job.job || job.what || job.name || job.id.slice(0, 8)}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text2)', maxWidth: 280 }}>
                        {job.error || job.failed_reason || '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {job.when || job.timestamp
                          ? String(job.when || job.timestamp).slice(0, 19)
                          : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <SecondaryButton
                          type="button"
                          disabled={replayMut.isPending}
                          onClick={() => replayMut.mutate(job.id)}
                        >
                          Replay
                        </SecondaryButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
