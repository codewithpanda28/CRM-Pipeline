'use client';
import { useState, useEffect, useMemo, ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { getPipeline } from '@/modules/crm/pipeline/lib/pipelines';
import { listItems } from '@/modules/crm/pipeline/lib/items';
import { ViewSwitcher } from '@/modules/crm/pipeline/components/ViewSwitcher';
import { PipelineSwitcher } from '@/modules/crm/pipeline/components/shared/PipelineSwitcher';
import type { Pipeline } from '@/modules/crm/pipeline/lib/pipelines';
import {
  DEFAULT_PIPELINE_VIEW,
  isPipelineViewMode,
  readPipelineViewPreference,
  writePipelineViewPreference,
  type PipelineViewMode,
} from '@/modules/crm/pipeline/lib/view-preference';

interface KanbanProps { pipeline: Pipeline; search: string; addTrigger: number }
interface TableProps  { pipeline: Pipeline; search: string; addTrigger: number }
interface ListProps   { pipeline: Pipeline; search: string; addTrigger: number }

const PipelineKanban = dynamic(
  () => import('@/modules/crm/pipeline/components/PipelineKanban').then(m => ({ default: m.PipelineKanban as ComponentType<KanbanProps> })),
  { ssr: false }
);

const PipelineCompactBoard = dynamic(
  () =>
    import('@/modules/crm/pipeline/components/PipelineCompactBoard').then((m) => ({
      default: m.PipelineCompactBoard as ComponentType<KanbanProps>,
    })),
  { ssr: false },
);

const PipelineTable = dynamic(
  () => import('@/modules/crm/pipeline/components/PipelineTable').then(m => ({ default: m.PipelineTable as unknown as ComponentType<TableProps> })),
  { ssr: false }
);

const PipelineList = dynamic(
  () => import('@/modules/crm/pipeline/components/PipelineList').then(m => ({ default: m.PipelineList as unknown as ComponentType<ListProps> })),
  { ssr: false }
);

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(0)}`;
  }
}

export default function PipelineViewPage() {
  const { pipelineId } = useParams<{ pipelineId: string }>();
  const getToken = useApiToken();
  const { user, hasPermission } = useAuth();
  const canCreateDeal = hasPermission('deals:create');
  const [view, setView] = useState<PipelineViewMode>(DEFAULT_PIPELINE_VIEW);
  const [prefHydrated, setPrefHydrated] = useState(false);
  const [addTrigger, setAddTrigger] = useState(0);
  const [search, setSearch] = useState('');

  const { data } = useQuery({
    queryKey: ['pipeline', pipelineId],
    queryFn: async () => getPipeline(await getToken(), pipelineId),
  });
  const pipeline = data;
  const noStages = !!pipeline && pipeline.stages.length === 0;

  const { data: items = [] } = useQuery({
    queryKey: ['items', pipelineId],
    queryFn: async () => listItems(await getToken(), pipelineId),
    enabled: Boolean(pipelineId),
  });

  const stats = useMemo(() => {
    const openStages = new Set(
      (pipeline?.stages ?? []).filter((s) => !s.is_won && !s.is_lost).map((s) => s.id),
    );
    let openValue = 0;
    let currency = 'INR';
    let openCount = 0;
    for (const item of items) {
      const isOpen = openStages.size === 0 || openStages.has(item.stage_id);
      if (!isOpen && item.display?.status && item.display.status !== 'open') continue;
      if (!isOpen) continue;
      openCount += 1;
      currency = item.display?.currency ?? String(item.field_values?.['currency'] ?? currency);
      openValue += Number(item.display?.amount ?? item.field_values?.['amount'] ?? item.field_values?.['value'] ?? 0) || 0;
    }
    return { dealCount: items.length, openCount, openValue, currency };
  }, [items, pipeline?.stages]);

  // Prefer per-user localStorage; fall back to pipeline.view; default Cards (kanban)
  useEffect(() => {
    if (!pipeline?.workspace_id || !user?.id) return;
    const stored = readPipelineViewPreference(pipeline.workspace_id, user.id);
    if (stored) {
      setView(stored);
    } else if (pipeline.view && isPipelineViewMode(pipeline.view)) {
      setView(pipeline.view);
    } else {
      setView(DEFAULT_PIPELINE_VIEW);
    }
    setPrefHydrated(true);
  }, [pipeline?.workspace_id, pipeline?.view, user?.id]);

  function handleViewChange(next: PipelineViewMode) {
    setView(next);
    writePipelineViewPreference(pipeline?.workspace_id, user?.id, next);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, overflow: 'hidden' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
        flexWrap: 'wrap',
        minWidth: 0,
      }}>
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text3)', fontFamily: 'var(--font-sans)' }}>
            Sales pipeline
          </div>
          <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
            <PipelineSwitcher currentId={pipelineId} />
          </div>
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: 13, color: 'var(--text2)', fontFamily: 'var(--font-sans)' }}>
            <span>
              <strong style={{ color: 'var(--text)' }}>{stats.dealCount}</strong> deals
            </span>
            <span>
              Open value{' '}
              <strong style={{ color: 'var(--text)' }}>{money(stats.openValue, stats.currency)}</strong>
            </span>
          </div>
        </div>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search deals…"
          aria-label="Search deals"
          style={{
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 13,
            fontFamily: 'var(--font-sans)',
            width: 'min(220px, 100%)',
            minWidth: 140,
            minHeight: 40,
            background: 'var(--bg)',
            color: 'var(--text)',
          }}
        />
        {pipeline && prefHydrated && (
          <ViewSwitcher current={view} onChange={handleViewChange} />
        )}
        <button
          type="button"
          onClick={() => { if (!noStages && canCreateDeal) setAddTrigger(n => n + 1); }}
          disabled={noStages || !canCreateDeal}
          title={
            noStages
              ? 'No stages configured. Create a stage in Settings → Pipelines first.'
              : !canCreateDeal
                ? 'Requires deals:create permission'
                : 'Add deal'
          }
          style={{
            padding: '8px 16px',
            minHeight: 40,
            background: noStages || !canCreateDeal ? 'var(--text3)' : 'var(--text)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: noStages || !canCreateDeal ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          + Add Deal
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
        {noStages && (
          <div style={{
            margin: '16px 24px', padding: '12px 16px', borderRadius: 12,
            background: 'var(--amber-bg, #fef3c7)', border: '1px solid var(--amber, #92400e)',
            fontSize: 13, color: 'var(--amber, #92400e)', fontFamily: 'var(--font-sans)',
          }}>
            <strong>No stages configured.</strong> Create at least one stage in{' '}
            <a href={`/settings/pipelines/${pipelineId}`} style={{ color: 'inherit', fontWeight: 600 }}>
              Settings → Pipelines
            </a>{' '}
            before adding deals.
          </div>
        )}
        {!pipeline && (
          <div style={{ padding: 40, color: 'var(--text2)', fontFamily: 'var(--font-sans)' }}>Loading…</div>
        )}
        {pipeline && view === 'kanban' && (
          <PipelineKanban pipeline={pipeline} search={search} addTrigger={addTrigger} />
        )}
        {pipeline && view === 'compact' && (
          <PipelineCompactBoard pipeline={pipeline} search={search} addTrigger={addTrigger} />
        )}
        {pipeline && view === 'table' && (
          <PipelineTable pipeline={pipeline} search={search} addTrigger={addTrigger} />
        )}
        {pipeline && view === 'list' && (
          <PipelineList pipeline={pipeline} search={search} addTrigger={addTrigger} />
        )}
      </div>
    </div>
  );
}
