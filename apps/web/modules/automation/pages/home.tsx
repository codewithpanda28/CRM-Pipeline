'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { automationApi } from '../lib/api';
import { AUTOMATION_TEMPLATES } from '../lib/templates';
import { EngineOffBanner, useEngineFlags } from '../components/engine-status';
import {
  AutomationShell,
  Button,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  StatCard,
  panelStyle,
  helperStyle,
} from '../components/ui';

export default function AutomationHomePage() {
  return (
    <ModuleGuard moduleId="automation">
      <Topbar />
      <HomeInner />
    </ModuleGuard>
  );
}

function HomeInner() {
  const getToken = useApiToken();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('automation:workflows:edit');
  const canAdmin = hasPermission('automation:admin');
  const canViewApprovals = hasPermission('automation:approvals:view');
  const canViewRuns = hasPermission('automation:runs:view');

  const workflows = useQuery({
    queryKey: ['automation', 'workflows'],
    queryFn: async () => automationApi.listWorkflows(await getToken()),
    enabled: hasPermission('automation:workflows:view'),
  });
  const approvals = useQuery({
    queryKey: ['automation', 'approvals'],
    queryFn: async () => automationApi.listApprovals(await getToken()),
    enabled: canViewApprovals,
  });
  const runs = useQuery({
    queryKey: ['automation', 'runs'],
    queryFn: async () => automationApi.listRuns(await getToken()),
    enabled: canViewRuns,
  });
  const flags = useEngineFlags();

  const workflowCount = (workflows.data ?? []).length;
  const active = (workflows.data ?? []).filter((w) => w.status === 'published').length;
  const pending = (approvals.data ?? []).filter((a) => a.status === 'pending').length;
  const recent = (runs.data ?? []).slice(0, 5);
  const failed = (runs.data ?? []).filter((r) => r.status === 'failed').length;
  const running = (runs.data ?? []).filter((r) => r.status === 'running' || r.status === 'waiting').length;
  const engineOn = Boolean(flags.data?.['enabled']);

  const loading = workflows.isLoading || (canViewApprovals && approvals.isLoading) || (canViewRuns && runs.isLoading);
  const err = workflows.error || approvals.error || runs.error;
  const emptyWorkspace = !loading && !err && workflowCount === 0;

  return (
    <AutomationShell
      title="Automation"
      subtitle="Set up what happens when something important occurs — without learning the engine."
      actions={
        <>
          {canEdit ? (
            <Link href="/automation/workflows/new">
              <Button variant="primary">Create Automation</Button>
            </Link>
          ) : null}
          <Link href="/automation/templates">
            <Button variant="secondary">Browse Templates</Button>
          </Link>
        </>
      }
    >
      {!flags.isLoading && flags.data && !engineOn ? <EngineOffBanner canAdmin={canAdmin} /> : null}

      {loading ? <LoadingBlock /> : null}
      {err ? <ErrorBlock message={(err as Error).message} /> : null}

      {!loading && !err && emptyWorkspace ? (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
              marginBottom: 18,
            }}
          >
            <StatCard label="Active automations" value={0} />
            <StatCard label="Pending approvals" value={0} />
            <StatCard label="Running now" value={0} />
            <StatCard label="Failed recently" value={0} />
          </div>

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
            <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 650 }}>Popular templates</h2>
            <p style={{ ...helperStyle, margin: '0 0 12px' }}>
              Installing creates a draft only — nothing runs until you publish, and never without the engine ON.
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
                    }}
                  >
                    <div style={{ fontWeight: 650, fontSize: 14 }}>{t.name}</div>
                    <div style={{ ...helperStyle, margin: '4px 0 0' }}>{t.outcome}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div style={{ ...panelStyle, marginTop: 14 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 650 }}>Recent activity</h2>
            <p style={{ ...helperStyle, margin: 0 }}>No activity yet — publish an automation to see runs here.</p>
          </div>
        </>
      ) : null}

      {!loading && !err && !emptyWorkspace ? (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
              marginBottom: 18,
            }}
          >
            <StatCard label="Active automations" value={active} />
            <StatCard label="Pending approvals" value={pending} hint={pending ? 'Needs your decision' : undefined} />
            <StatCard label="Running now" value={running} />
            <StatCard label="Failed recently" value={failed} />
          </div>

          <div style={panelStyle}>
            <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 650 }}>Recent activity</h2>
            {!canViewRuns ? (
              <p style={helperStyle}>You don’t have permission to view activity.</p>
            ) : recent.length === 0 ? (
              <p style={{ ...helperStyle, margin: 0 }}>No runs yet. Publish an automation to see activity here.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {recent.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/automation/runs/${r.id}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '10px 12px',
                        borderRadius: 10,
                        background: 'var(--surface2)',
                        textDecoration: 'none',
                        color: 'var(--text)',
                        fontSize: 13,
                      }}
                    >
                      <span>{humanEvent(r.trigger_event_name) || 'Automation run'}</span>
                      <span style={{ color: 'var(--text2)', textTransform: 'capitalize' }}>{r.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </AutomationShell>
  );
}

function humanEvent(name: string | null): string {
  if (!name) return '';
  const map: Record<string, string> = {
    'crm.lead.created': 'New lead',
    'finance.invoice.overdue': 'Invoice overdue',
    'crm.quote.accepted': 'Quote accepted',
    'crm.deal.stage_changed': 'Deal updated',
    'crm.deal.won': 'Deal won',
  };
  return map[name] ?? name;
}
