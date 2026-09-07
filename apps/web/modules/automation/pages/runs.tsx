'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { automationApi, type RunRow } from '../lib/api';
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

export default function RunsPage() {
  return (
    <ModuleGuard moduleId="automation">
      <Topbar />
      <RunsInner />
    </ModuleGuard>
  );
}

function RunsInner() {
  const getToken = useApiToken();
  const { hasPermission } = useAuth();
  const sp = useSearchParams();
  const workflowFilter = sp.get('workflow');

  const list = useQuery({
    queryKey: ['automation', 'runs'],
    queryFn: async () => automationApi.listRuns(await getToken()),
    enabled: hasPermission('automation:runs:view'),
  });

  const rows = useMemo(() => {
    let items = list.data ?? [];
    if (workflowFilter) items = items.filter((r) => r.workflow_id === workflowFilter);
    return items;
  }, [list.data, workflowFilter]);

  return (
    <AutomationShell title="Activity" subtitle="What your automations did — in plain language.">
      {list.isLoading ? <LoadingBlock /> : null}
      {list.error ? <ErrorBlock message={(list.error as Error).message} /> : null}
      {!list.isLoading && rows.length === 0 ? (
        <EmptyState title="No activity yet" description="Published automations will show runs here." />
      ) : null}
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`/automation/runs/${r.id}`}
            style={{
              ...panelStyle,
              padding: '12px 14px',
              textDecoration: 'none',
              color: 'inherit',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontWeight: 650 }}>{humanEvent(r.trigger_event_name)}</div>
              <div style={{ ...helperStyle, margin: '4px 0 0' }}>{new Date(r.created_at).toLocaleString()}</div>
            </div>
            <StatusLabel status={r.status} />
          </Link>
        ))}
      </div>
    </AutomationShell>
  );
}

export function RunDetailPage({ runId }: { runId: string }) {
  return (
    <ModuleGuard moduleId="automation">
      <Topbar />
      <RunDetailInner runId={runId} />
    </ModuleGuard>
  );
}

function RunDetailInner({ runId }: { runId: string }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const [advanced, setAdvanced] = useState(false);

  const detail = useQuery({
    queryKey: ['automation', 'run', runId],
    queryFn: async () => automationApi.getRun(await getToken(), runId),
    enabled: hasPermission('automation:runs:view'),
  });

  const replay = useMutation({
    mutationFn: async () => automationApi.replayRun(await getToken(), runId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'run', runId] }),
  });

  if (detail.isLoading) {
    return (
      <AutomationShell title="Run">
        <LoadingBlock />
      </AutomationShell>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <AutomationShell title="Run">
        <ErrorBlock message={(detail.error as Error)?.message ?? 'Not found'} />
      </AutomationShell>
    );
  }

  const run = detail.data;
  const steps = run.steps ?? [];

  return (
    <AutomationShell
      title="Activity detail"
      subtitle={humanEvent(run.trigger_event_name)}
      actions={<StatusLabel status={run.status} />}
    >
      <div style={panelStyle}>
        <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 650 }}>Timeline</h2>
        {steps.length === 0 ? (
          <p style={helperStyle}>No steps recorded yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            {steps.map((s) => (
              <li
                key={s.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'var(--surface2)',
                }}
              >
                <span style={{ fontSize: 16, lineHeight: 1.2 }}>{stepIcon(s.status)}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 650 }}>{stepTitle(s)}</div>
                  {s.status === 'failed' ? (
                    <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 4 }}>
                      Action failed
                      {s.attempt > 1 ? ` · Retrying… Attempt ${s.attempt} of 5` : ''}
                    </div>
                  ) : s.status === 'waiting' || s.step_type === 'delay' ? (
                    <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>Waiting…</div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => setAdvanced((x) => !x)}
        style={{
          marginTop: 12,
          background: 'none',
          border: 'none',
          color: 'var(--text2)',
          fontSize: 13,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {advanced ? 'Hide execution details' : 'Execution details'}
      </button>
      {advanced ? (
        <div style={{ ...panelStyle, marginTop: 8, fontSize: 12, color: 'var(--text2)' }}>
          {steps.map((s) => (
            <div key={s.id} style={{ marginBottom: 10, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              <div>Step: {s.node_id}</div>
              <div>Type: {s.step_type}</div>
              <div>Status: {s.status}</div>
              <div>Attempt: {s.attempt}</div>
              <div>Started: {s.started_at ? new Date(s.started_at).toLocaleString() : '—'}</div>
              <div>Finished: {s.finished_at ? new Date(s.finished_at).toLocaleString() : '—'}</div>
              {s.error ? <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(s.error, null, 2)}</pre> : null}
            </div>
          ))}
          {hasPermission('automation:runs:replay') ? (
            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" disabled={replay.isPending} onClick={() => replay.mutate()}>
                Retry this run
              </Button>
              <p style={{ ...helperStyle, marginTop: 8 }}>
                This does not approve money or critical actions.
              </p>
              {replay.data ? <p style={helperStyle}>{replay.data.note}</p> : null}
              {replay.error ? <ErrorBlock message={(replay.error as Error).message} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </AutomationShell>
  );
}

function humanEvent(name: string | null): string {
  if (!name) return 'Automation run';
  const map: Record<string, string> = {
    'crm.lead.created': 'Lead received',
    'finance.invoice.overdue': 'Invoice overdue',
    'crm.quote.accepted': 'Quote accepted',
    'crm.deal.stage_changed': 'Deal updated',
    'crm.deal.won': 'Deal won',
  };
  return map[name] ?? name;
}

function stepIcon(status: string): string {
  if (status === 'completed' || status === 'succeeded') return '✓';
  if (status === 'failed') return '⚠';
  if (status === 'waiting' || status === 'running') return '⏳';
  return '•';
}

function stepTitle(s: RunRow['steps'] extends (infer U)[] | undefined ? U : never): string {
  const out = s.output_snapshot as Record<string, unknown> | null;
  if (out?.['title']) return String(out['title']);
  if (s.step_type === 'trigger') return 'Started';
  if (s.step_type === 'delay') return 'Waiting';
  if (s.step_type === 'approval') return 'Waiting for approval';
  if (s.step_type === 'action') return 'Action completed';
  if (s.step_type === 'condition') return 'Condition checked';
  return s.node_id;
}
