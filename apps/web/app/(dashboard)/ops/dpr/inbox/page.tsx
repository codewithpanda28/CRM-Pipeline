'use client';

import Link from 'next/link';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { OpsShell } from '@/modules/ops/components/OpsShell';
import { useOpsDprInbox } from '@/modules/ops/lib/hooks';

export default function OpsDprInboxPage() {
  const { data, isLoading, error } = useOpsDprInbox();
  const rows = data?.data ?? [];

  return (
    <ModuleGuard moduleId="ops">
      <OpsShell title="DPR inbox" subtitle="Team submitted reports awaiting review.">
        {isLoading ? <p style={{ color: 'var(--text2)' }}>Loading…</p> : null}
        {error ? (
          <p style={{ color: 'var(--text2)' }}>
            Inbox requires team DPR permission. <Link href="/ops/dpr">Back to my DPR</Link>
          </p>
        ) : null}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {rows.map((r: any) => (
            <li
              key={r.id}
              style={{
                padding: '12px 0',
                borderBottom: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 560 }}>{r.display_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {String(r.report_date).slice(0, 10)} · {r.status}
                </div>
              </div>
              <Link href={`/ops/dpr/${r.id}`} style={{ fontSize: 13 }}>
                Open
              </Link>
            </li>
          ))}
        </ul>
        {!isLoading && rows.length === 0 && !error ? (
          <p style={{ color: 'var(--text2)' }}>No submitted team DPRs in range.</p>
        ) : null}
      </OpsShell>
    </ModuleGuard>
  );
}
