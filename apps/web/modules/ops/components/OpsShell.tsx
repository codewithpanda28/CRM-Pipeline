'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Topbar } from '@/modules/shared/components/Topbar';
import { PageHeader } from '@/modules/crm/shared/ui';
import { OPS_SUB_NAV_ITEMS, isOpsSubNavActive } from '@/modules/ops/lib/ops-sub-nav';
import type { OpsTask, TaskContextChip } from '@/modules/ops/lib/hooks';

/**
 * Horizontal sub-nav — matches Automation `SubNav` / `SubNavLink` visual language
 * (content tokens + accent active chip + bottom rule). Not sidebar chrome.
 */
function OpsSubNav() {
  const pathname = usePathname() ?? '';
  return (
    <nav
      aria-label="Operations"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        marginBottom: 18,
        paddingBottom: 12,
        borderBottom: '1px solid var(--border)',
      }}
    >
      {OPS_SUB_NAV_ITEMS.map((item) => {
        const active = isOpsSubNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: active ? 650 : 500,
              color: active ? 'var(--text)' : 'var(--text2)',
              background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
              textDecoration: 'none',
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function OpsShell({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <Topbar />
      <div
        style={{
          padding: 24,
          minWidth: 0,
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <OpsSubNav />
        <PageHeader title={title} subtitle={subtitle} actions={actions} />
        {children}
      </div>
    </div>
  );
}

function ContextChips({ chips }: { chips?: TaskContextChip[] }) {
  if (!chips || chips.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
      {chips.map((c) => (
        <Link
          key={`${c.type}-${c.id}`}
          href={c.href}
          style={{
            fontSize: 11,
            padding: '2px 6px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            color: 'var(--text2)',
            textDecoration: 'none',
          }}
        >
          {c.type}: {c.label}
        </Link>
      ))}
    </div>
  );
}

export function TaskBucket({
  label,
  tasks,
  onComplete,
  onReschedule,
  onReassign,
}: {
  label: string;
  tasks: OpsTask[];
  onComplete: (id: string) => void;
  onReschedule: (id: string) => void;
  onReassign?: (id: string) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <section style={{ marginBottom: 24 }}>
      <h2
        style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--text2)',
          margin: '0 0 10px',
        }}
      >
        {label} · {tasks.length}
      </h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {tasks.map((t) => {
          const due = t.due ? new Date(t.due) : null;
          const time = due
            ? due.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '—';
          return (
            <li
              key={t.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '56px 1fr auto',
                gap: 10,
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
              }}
            >
              <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text2)' }}>
                {time}
              </span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{t.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                  {(t.task_type ?? 'task').replace(/_/g, ' ')}
                  {t.priority && t.priority !== 'NONE' && t.priority !== 'MEDIUM' ? ` · ${t.priority}` : ''}
                </div>
                <ContextChips chips={t.context} />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => onComplete(t.id)} style={actionBtn}>
                  Done
                </button>
                <button type="button" onClick={() => onReschedule(t.id)} style={actionBtnGhost}>
                  Reschedule
                </button>
                {onReassign ? (
                  <button type="button" onClick={() => onReassign(t.id)} style={actionBtnGhost}>
                    Reassign
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const actionBtn: React.CSSProperties = {
  fontSize: 12,
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  cursor: 'pointer',
  color: 'var(--text)',
};
const actionBtnGhost: React.CSSProperties = {
  ...actionBtn,
  background: 'transparent',
};
