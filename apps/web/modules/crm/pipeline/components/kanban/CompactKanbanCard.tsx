'use client';

import { useState } from 'react';
import type { PipelineItem, PipelineItemDisplay } from '@/modules/crm/pipeline/lib/items';

interface Props {
  item: PipelineItem;
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
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(0)}`;
  }
}

function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function ownerInitials(name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || null;
}

/** Build compact card rows — omit empties (pure helper for tests). */
export function compactCardLines(d: PipelineItemDisplay): {
  name: string;
  party: string | null;
  amount: string;
  probability: string | null;
  owner: string | null;
  nextAction: string | null;
  due: string | null;
  product: string | null;
  status: string | null;
} {
  const party = d.customer_name || d.company_name || null;
  const prob =
    d.probability != null && Number.isFinite(d.probability) ? `${Math.round(d.probability)}%` : null;
  const owner =
    ownerInitials(d.owner_name) ||
    (d.owner_name ? d.owner_name.slice(0, 12) : d.owner_id ? 'Assigned' : null);
  const nextAction = d.next_action?.title?.trim()
    ? d.next_action.title.trim().slice(0, 24)
    : null;
  const due =
    shortDate(d.next_action?.due_at) ||
    (d.expected_close_at ? `Close ${shortDate(d.expected_close_at) ?? ''}`.trim() : null);
  const status = d.status && d.status !== 'open' ? d.status : null;
  const product = d.product_label?.trim() || null;
  return {
    name: d.name,
    party,
    amount: money(d.amount, d.currency),
    probability: prob,
    owner,
    nextAction,
    due,
    product,
    status,
  };
}

function resolveDisplay(item: PipelineItem): PipelineItemDisplay {
  if (item.display) {
    return {
      ...item.display,
      probability: item.display.probability ?? null,
      next_action: item.display.next_action ?? null,
      product_label: item.display.product_label ?? null,
    };
  }
  const fv = item.field_values ?? {};
  const name =
    (typeof fv['name'] === 'string' && fv['name'].trim()) ||
    (typeof fv['title'] === 'string' && fv['title'].trim()) ||
    'Untitled deal';
  return {
    name,
    amount: String(fv['amount'] ?? fv['value'] ?? '0.00'),
    currency: String(fv['currency'] ?? 'INR'),
    owner_id: typeof fv['owner_id'] === 'string' ? fv['owner_id'] : null,
    owner_name: null,
    company_id: typeof fv['company_id'] === 'string' ? fv['company_id'] : null,
    company_name: null,
    customer_party_id: null,
    customer_name: null,
    expected_close_at: fv['expected_close_at'] || fv['close_date'] ? String(fv['expected_close_at'] ?? fv['close_date']) : null,
    status: null,
    probability: fv['probability'] != null ? Number(fv['probability']) : null,
    next_action: null,
    product_label:
      typeof fv['product_name'] === 'string'
        ? fv['product_name']
        : typeof fv['product'] === 'string'
          ? fv['product']
          : null,
  };
}

export function CompactKanbanCard({
  item,
  isDragging,
  onClick,
  onDragStart,
  onDragEnd,
  onContextMenu,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const lines = compactCardLines(resolveDisplay(item));

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
        borderRadius: 8,
        padding: '8px 10px',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        opacity: isDragging ? 0.4 : 1,
        boxShadow: hovered && !isDragging ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
        transition: 'box-shadow .15s ease, opacity .15s ease',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          fontFamily: 'var(--font-sans)',
          color: 'var(--text)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {lines.name}
      </div>

      {lines.party && (
        <div
          style={{
            marginTop: 2,
            fontSize: 11,
            color: 'var(--text2)',
            fontFamily: 'var(--font-sans)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {lines.party}
        </div>
      )}

      <div
        style={{
          marginTop: 6,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 6,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--text)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {lines.amount}
        </span>
        {lines.probability && (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
            {lines.probability}
          </span>
        )}
      </div>

      {(lines.owner || lines.nextAction || lines.due) && (
        <div
          style={{
            marginTop: 6,
            fontSize: 10,
            color: 'var(--text3)',
            fontFamily: 'var(--font-sans)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {[lines.owner, lines.nextAction, lines.due].filter(Boolean).join(' · ')}
        </div>
      )}

      {(lines.product || lines.status) && (
        <div
          style={{
            marginTop: 6,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {lines.product ? (
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                padding: '1px 5px',
                borderRadius: 4,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--text2)',
                maxWidth: '70%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {lines.product}
            </span>
          ) : (
            <span />
          )}
          {lines.status && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.3,
                color:
                  lines.status === 'won' ? '#16a34a' : lines.status === 'lost' ? '#dc2626' : 'var(--text3)',
              }}
            >
              {lines.status}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
