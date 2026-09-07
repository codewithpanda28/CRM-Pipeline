'use client';

import { useParams } from 'next/navigation';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { OpsShell } from '@/modules/ops/components/OpsShell';
import { useOpsDprDetail, useDprMutation } from '@/modules/ops/lib/hooks';
import { useState } from 'react';

export default function OpsDprDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : undefined;
  const { data, isLoading } = useOpsDprDetail(id);
  const mut = useDprMutation();
  const [comment, setComment] = useState('');
  const entry = data?.data;
  const lines = (entry?.system_snapshot?.lines ?? []) as Array<{
    key: string;
    label: string;
    value: number;
  }>;

  return (
    <ModuleGuard moduleId="ops">
      <OpsShell title="DPR detail" subtitle={entry ? String(entry.report_date).slice(0, 10) : undefined}>
        {isLoading ? <p style={{ color: 'var(--text2)' }}>Loading…</p> : null}
        {entry ? (
          <>
            <p style={{ fontSize: 13 }}>
              Status: <strong>{entry.status}</strong>
              {entry.review_comment ? ` · ${entry.review_comment}` : ''}
            </p>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {lines.map((l) => (
                <li
                  key={l.key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
                    fontSize: 14,
                  }}
                >
                  <span>{l.label}</span>
                  <strong>{l.value}</strong>
                </li>
              ))}
            </ul>
            {entry.status === 'submitted' ? (
              <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Review comment"
                  style={{
                    flex: 1,
                    minWidth: 160,
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    fontSize: 13,
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    id && mut.review.mutate({ id, decision: 'approve', comment: comment || undefined })
                  }
                  style={btnPrimary}
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() =>
                    id && mut.review.mutate({ id, decision: 'return', comment: comment || undefined })
                  }
                  style={btn}
                >
                  Return
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </OpsShell>
    </ModuleGuard>
  );
}

const btn: React.CSSProperties = {
  fontSize: 12,
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'transparent',
  cursor: 'pointer',
};
const btnPrimary: React.CSSProperties = {
  ...btn,
  border: 'none',
  background: 'var(--nav-fg)',
  color: 'var(--nav-bg)',
};
