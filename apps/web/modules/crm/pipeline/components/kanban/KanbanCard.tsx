'use client';

import { useState } from 'react';
import type { PipelineItem, PipelineItemDisplay } from '@/modules/crm/pipeline/lib/items';
import type { PipelineField } from '@/modules/crm/pipeline/lib/pipelines';

interface Props {
  item: PipelineItem;
  fields: PipelineField[];
  isDragging: boolean;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

function money(amount: string | number | undefined, currency: string) {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return `${currency} ${amount ?? '—'}`;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function resolveDisplay(item: PipelineItem): PipelineItemDisplay {
  if (item.display) {
    return {
      ...item.display,
      next_action: item.display.next_action ?? null,
      probability: item.display.probability ?? null,
    };
  }
  const fv = item.field_values ?? {};
  const name =
    (typeof fv['name'] === 'string' && fv['name'].trim()) ||
    (typeof fv['title'] === 'string' && fv['title'].trim()) ||
    'Untitled deal';
  const amount = String(fv['amount'] ?? fv['value'] ?? '0.00');
  const currency = String(fv['currency'] ?? 'INR');
  const close = fv['expected_close_at'] ?? fv['close_date'];
  return {
    name,
    amount,
    currency,
    owner_id: typeof fv['owner_id'] === 'string' ? fv['owner_id'] : null,
    owner_name: null,
    company_id: typeof fv['company_id'] === 'string' ? fv['company_id'] : null,
    company_name: null,
    customer_party_id: null,
    customer_name: null,
    expected_close_at: close ? String(close) : null,
    status: null,
    next_action: null,
  };
}

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

export function KanbanCard({ item, fields: _fields, isDragging, onClick, onDragStart, onDragEnd, onContextMenu }: Props) {
  const [hovered, setHovered] = useState(false);
  const d = resolveDisplay(item);
  const partyLabel = d.customer_name || d.company_name || null;
  const ownerLabel =
    d.owner_name ||
    (d.owner_id && !looksLikeUuid(d.owner_id) ? d.owner_id : d.owner_id ? 'Assigned' : 'Unassigned');
  const closeLabel = d.expected_close_at
    ? new Date(d.expected_close_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  const nextAction = d.next_action?.title?.trim()
    ? d.next_action.title.trim().slice(0, 36)
    : null;
  const nextDue = d.next_action?.due_at
    ? new Date(d.next_action.due_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '12px 14px',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        opacity: isDragging ? 0.4 : 1,
        boxShadow: hovered && !isDragging ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
        transform: hovered && !isDragging ? 'translateY(-1px)' : 'none',
        transition: 'box-shadow .15s ease, opacity .15s ease, transform .15s ease',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          fontFamily: 'var(--font-sans)',
          color: 'var(--text)',
          lineHeight: 1.35,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {d.name}
      </div>

      {partyLabel && (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: 'var(--text2)',
            fontFamily: 'var(--font-sans)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {partyLabel}
        </div>
      )}

      <div
        style={{
          marginTop: 10,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
          {money(d.amount, d.currency)}
        </span>
        {d.status && d.status !== 'open' && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              color: d.status === 'won' ? '#16a34a' : d.status === 'lost' ? '#dc2626' : 'var(--text3)',
            }}
          >
            {d.status}
          </span>
        )}
      </div>

      <div
        style={{
          marginTop: 10,
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 10px',
          fontSize: 11,
          color: 'var(--text3)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
          {ownerLabel}
        </span>
        {closeLabel && <span>· Close {closeLabel}</span>}
      </div>

      {nextAction && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: 'var(--text2)',
            fontFamily: 'var(--font-sans)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={d.next_action?.title ?? undefined}
        >
          Next: {nextAction}
          {nextDue ? ` · ${nextDue}` : ''}
        </div>
      )}
    </div>
  );
}
