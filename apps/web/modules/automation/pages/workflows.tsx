'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { Input, Select } from '@/modules/shared/components/ui/FormField';
import { automationApi, type WorkflowRow } from '../lib/api';
import { AUTOMATION_TEMPLATES } from '../lib/templates';
import { EngineOffBanner, useEngineFlags } from '../components/engine-status';
import {
  AutomationShell,
  Button,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  StatusLabel,
  helperStyle,
  panelStyle,
} from '../components/ui';

export default function WorkflowsPage() {
  return (
    <ModuleGuard moduleId="automation">
      <Topbar />
      <WorkflowsInner />
    </ModuleGuard>
  );
}

function WorkflowsInner() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('automation:workflows:edit');
  const canAdmin = hasPermission('automation:admin');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');

  const list = useQuery({
    queryKey: ['automation', 'workflows'],
    queryFn: async () => automationApi.listWorkflows(await getToken()),
    enabled: hasPermission('automation:workflows:view'),
  });
  const flags = useEngineFlags();

  const archive = useMutation({
    mutationFn: async (id: string) => automationApi.archive(await getToken(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'workflows'] }),
  });
  const enable = useMutation({
    mutationFn: async (id: string) => automationApi.enable(await getToken(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'workflows'] }),
  });
  const duplicate = useMutation({
    mutationFn: async (wf: WorkflowRow) => {
      const token = await getToken();
      const full = await automationApi.getWorkflow(token, wf.id);
      const graph = full.draft_graph ?? { trigger: { event_name: '' }, nodes: [], edges: [] };
      return automationApi.createWorkflow(token, {
        name: `${wf.name} (copy)`,
        description: wf.description ?? undefined,
        graph,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'workflows'] }),
  });

  const allCount = (list.data ?? []).length;
  const rows = useMemo(() => {
    let items = list.data ?? [];
    if (status !== 'all') items = items.filter((w) => w.status === status);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      items = items.filter((w) => w.name.toLowerCase().includes(needle));
    }
    return items;
  }, [list.data, q, status]);

  const zeroWorkflows = !list.isLoading && !list.error && allCount === 0;
  const filteredEmpty = !list.isLoading && !list.error && allCount > 0 && rows.length === 0;
  const engineOn = Boolean(flags.data?.['enabled']);

  return (
    <AutomationShell
      title="My Automations"
      subtitle="Turn on, edit, or duplicate the automations that run your follow-ups."
      actions={
        canEdit ? (
          <Link href="/automation/workflows/new">
            <Button variant="primary">Create Automation</Button>
          </Link>
        ) : null
      }
    >
      {!flags.isLoading && flags.data && !engineOn ? <EngineOffBanner canAdmin={canAdmin} /> : null}

      {!zeroWorkflows ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <Input placeholder="Search automations…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 160 }}>
            <option value="all">All statuses</option>
            <option value="published">On</option>
            <option value="draft">Draft</option>
            <option value="archived">Off</option>
          </Select>
        </div>
      ) : null}

      {list.isLoading ? <LoadingBlock /> : null}
      {list.error ? <ErrorBlock message={(list.error as Error).message} /> : null}

      {zeroWorkflows ? (
        <>
          <EmptyState
            title="No automations yet"
            description="Automate repetitive work in a few simple steps. Start with a ready-made automation or build your own."
            action={
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {canEdit ? (
                  <Link href="/automation/workflows/new">
                    <Button variant="primary">Create Automation</Button>
                  </Link>
                ) : null}
                <Link href="/automation/templates">
                  <Button variant="secondary">Browse Templates</Button>
                </Link>
              </div>
            }
          />
          <div style={{ ...panelStyle, marginTop: 14 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 650 }}>Try a template</h2>
            <p style={{ ...helperStyle, margin: '0 0 12px' }}>
              Each install creates a draft only — never auto-publishes.
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {AUTOMATION_TEMPLATES.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/automation/templates/${t.id}/install`}
                    style={{
                      display: 'block',
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'var(--surface2)',
                      textDecoration: 'none',
                      color: 'var(--text)',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    {t.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {filteredEmpty ? (
        <EmptyState
          title="No matching automations"
          description="Try another search or clear the status filter."
        />
      ) : null}

      {!list.isLoading && rows.length > 0 ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((wf) => (
            <div
              key={wf.id}
              style={{
                ...panelStyle,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
              }}
            >
              <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Link
                    href={`/automation/workflows/${wf.id}/edit`}
                    style={{
                      fontSize: 15,
                      fontWeight: 650,
                      color: 'var(--text)',
                      textDecoration: 'none',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {wf.name}
                  </Link>
                  <StatusLabel status={wf.status} />
                </div>
                <p style={{ ...helperStyle, margin: '4px 0 0' }}>
                  Updated {new Date(wf.updated_at).toLocaleString()}
                  {wf.created_by ? ` · Owner ${wf.created_by.slice(0, 8)}…` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Link href={`/automation/runs?workflow=${wf.id}`}>
                  <Button variant="ghost">View activity</Button>
                </Link>
                {canEdit ? (
                  <>
                    <Link href={`/automation/workflows/${wf.id}/edit`}>
                      <Button variant="secondary">Edit</Button>
                    </Link>
                    <Button variant="secondary" onClick={() => duplicate.mutate(wf)} disabled={duplicate.isPending}>
                      Duplicate
                    </Button>
                    {wf.status === 'published' ? (
                      <Button variant="secondary" onClick={() => archive.mutate(wf.id)}>
                        Turn off
                      </Button>
                    ) : wf.status === 'archived' ? (
                      <Button variant="secondary" onClick={() => enable.mutate(wf.id)}>
                        Turn on
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </AutomationShell>
  );
}
