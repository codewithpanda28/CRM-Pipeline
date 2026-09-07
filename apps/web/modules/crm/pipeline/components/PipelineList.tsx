'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { listItems, type PipelineItem } from '@/modules/crm/pipeline/lib/items';
import type { Pipeline } from '@/modules/crm/pipeline/lib/pipelines';
import { DealCreateModal } from '@/modules/crm/pipeline/components/shared/DealCreateModal';
import { defaultOpenStageId } from '@/modules/crm/pipeline/lib/deal-create-form';

function money(amount: string | number | undefined, currency: string) {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return `${currency} ${amount ?? '—'}`;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function displayOf(item: PipelineItem) {
  if (item.display) return item.display;
  const fv = item.field_values ?? {};
  return {
    name:
      (typeof fv['name'] === 'string' && fv['name'].trim()) ||
      (typeof fv['title'] === 'string' && fv['title'].trim()) ||
      'Untitled deal',
    amount: String(fv['amount'] ?? fv['value'] ?? '0.00'),
    currency: String(fv['currency'] ?? 'INR'),
    owner_name: null as string | null,
    company_name: null as string | null,
    customer_name: null as string | null,
    expected_close_at: (fv['expected_close_at'] ?? fv['close_date'] ?? null) as string | null,
    status: null as string | null,
  };
}

export function PipelineList({
  pipeline,
  search,
  addTrigger = 0,
}: {
  pipeline: Pipeline;
  search: string;
  addTrigger?: number;
}) {
  const getToken = useApiToken();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canCreateDeal = hasPermission('deals:create');
  const [showForm, setShowForm] = useState(false);
  const [lastTrigger, setLastTrigger] = useState(addTrigger);

  useEffect(() => {
    if (addTrigger !== lastTrigger) {
      setLastTrigger(addTrigger);
      if (canCreateDeal && pipeline.stages.length > 0) setShowForm(true);
    }
  }, [addTrigger, lastTrigger, canCreateDeal, pipeline.stages.length]);

  const stageName = useMemo(
    () => new Map(pipeline.stages.map((s) => [s.id, s.name])),
    [pipeline.stages],
  );

  const { data: items = [] } = useQuery({
    queryKey: ['items', pipeline.id],
    queryFn: async () => listItems(await getToken(), pipeline.id),
  });

  const filtered = search
    ? items.filter((item) => {
        const q = search.toLowerCase();
        const d = displayOf(item);
        return [d.name, d.company_name, d.customer_name, d.owner_name, stageName.get(item.stage_id)]
          .map((v) => String(v ?? '').toLowerCase())
          .some((v) => v.includes(q));
      })
    : items;

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      {filtered.length === 0 ? (
        <div style={{ color: 'var(--text3)', fontSize: 14, fontFamily: 'var(--font-sans)' }}>
          {search ? 'No deals match your search.' : 'No deals yet — use + Add Deal to create one.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: '100%' }}>
          {filtered.map((item) => {
            const d = displayOf(item);
            const party = d.customer_name || d.company_name;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => router.push(`/crm/deals/${item.id}`)}
                style={{
                  textAlign: 'left',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  minWidth: 0,
                  minHeight: 56,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{d.name}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text2)' }}>
                      {stageName.get(item.stage_id) ?? 'Stage'}
                      {party ? ` · ${party}` : ''}
                      {d.owner_name ? ` · ${d.owner_name}` : ''}
                    </div>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    {money(d.amount, d.currency)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showForm && (
        <DealCreateModal
          pipelineId={pipeline.id}
          pipelineName={pipeline.name}
          stages={pipeline.stages}
          fields={pipeline.fields}
          defaultStageId={defaultOpenStageId(pipeline.stages)}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
