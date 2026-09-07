'use client';

import { useState } from 'react';
import { KanbanCard } from './KanbanCard';
import type { PipelineItem } from '@/modules/crm/pipeline/lib/items';
import type { PipelineField, PipelineStage } from '@/modules/crm/pipeline/lib/pipelines';

interface Props {
  stage: PipelineStage;
  items: PipelineItem[];
  fields: PipelineField[];
  draggingId: string | null;
  isDragOver: boolean;
  /** Insertion index within this column (0..items.length). */
  insertIndex: number | null;
  onDragOverIndex: (index: number) => void;
  onDragLeave: () => void;
  onDropAt: (position: number) => void;
  onCardClick: (itemId: string) => void;
  onCardDragStart: (itemId: string) => void;
  onCardDragEnd: () => void;
  onAddClick: () => void;
  onCardContextMenu: (itemId: string, e: React.MouseEvent) => void;
  columnWidth?: number;
}

function stageColor(stage: PipelineStage): string {
  if (stage.is_won) return '#22c55e';
  if (stage.is_lost) return '#ef4444';
  return stage.color ?? '#6366f1';
}

function formatStageTotal(items: PipelineItem[]): string | null {
  if (!items.length) return null;
  const byCurrency = new Map<string, number>();
  for (const item of items) {
    const currency = item.display?.currency ?? String(item.field_values?.['currency'] ?? 'INR');
    const amount = Number(item.display?.amount ?? item.field_values?.['amount'] ?? item.field_values?.['value'] ?? 0);
    if (!Number.isFinite(amount)) continue;
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + amount);
  }
  if (byCurrency.size === 0) return null;
  const entries = [...byCurrency.entries()];
  if (entries.length === 1) {
    const [currency, total] = entries[0]!;
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(total);
    } catch {
      return `${currency} ${total.toFixed(0)}`;
    }
  }
  const [currency, total] = entries[0]!;
  try {
    return `${new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(total)}+`;
  } catch {
    return `${currency} ${total.toFixed(0)}+`;
  }
}

function InsertLine({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        height: visible ? 3 : 0,
        margin: visible ? '2px 0' : 0,
        borderRadius: 2,
        background: visible ? 'var(--accent, #3b82f6)' : 'transparent',
        transition: 'height .1s ease',
      }}
    />
  );
}

export function KanbanColumn({
  stage, items, fields, draggingId, isDragOver, insertIndex,
  onDragOverIndex, onDragLeave, onDropAt, onCardClick,
  onCardDragStart, onCardDragEnd, onAddClick, onCardContextMenu,
  columnWidth = 260,
}: Props) {
  const [addHovered, setAddHovered] = useState(false);
  const color = stageColor(stage);
  const stageTotal = formatStageTotal(items);
  const width = Math.max(240, columnWidth);

  return (
    <div
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
      onDragOver={e => {
        e.preventDefault();
        onDragOverIndex(items.length);
      }}
      onDragLeave={onDragLeave}
      onDrop={e => {
        e.preventDefault();
        onDropAt(insertIndex ?? items.length);
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        marginBottom: 10,
        padding: '0 2px',
        minWidth: 0,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              background: color + '1a',
              color: color,
              borderRadius: 6,
              padding: '3px 9px',
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              letterSpacing: '0.2px',
            }}>
              {stage.name}
            </span>
            <span style={{
              fontSize: 11,
              color: 'var(--text3)',
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
            }}>
              {items.length} {items.length === 1 ? 'deal' : 'deals'}
            </span>
          </div>
          {stageTotal && (
            <div style={{
              marginTop: 4,
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text2)',
              fontFamily: 'var(--font-sans)',
            }}>
              {stageTotal}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onAddClick}
          onMouseEnter={() => setAddHovered(true)}
          onMouseLeave={() => setAddHovered(false)}
          style={{
            width: 28,
            height: 28,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: addHovered ? 'var(--surface2)' : 'var(--surface)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            color: addHovered ? 'var(--text)' : 'var(--text3)',
            lineHeight: 1,
            transition: 'all .15s ease',
            padding: 0,
            flexShrink: 0,
          }}
          title={`Add deal to ${stage.name}`}
          aria-label={`Add deal to ${stage.name}`}
        >
          +
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          minHeight: 80,
          borderRadius: 14,
          padding: isDragOver ? 6 : 0,
          margin: isDragOver ? -6 : 0,
          background: isDragOver ? 'var(--surface2)' : 'transparent',
          transition: 'all .12s ease',
        }}
      >
        <InsertLine visible={isDragOver && insertIndex === 0} />
        {items.map((item, idx) => (
          <div key={item.id}>
            <div
              onDragOver={e => {
                e.preventDefault();
                e.stopPropagation();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const before = e.clientY < rect.top + rect.height / 2;
                onDragOverIndex(before ? idx : idx + 1);
              }}
              onDrop={e => {
                e.preventDefault();
                e.stopPropagation();
                onDropAt(insertIndex ?? idx);
              }}
            >
              <KanbanCard
                item={item}
                fields={fields}
                isDragging={draggingId === item.id}
                onClick={() => onCardClick(item.id)}
                onDragStart={() => onCardDragStart(item.id)}
                onDragEnd={onCardDragEnd}
                onContextMenu={e => onCardContextMenu(item.id, e)}
              />
            </div>
            <InsertLine visible={isDragOver && insertIndex === idx + 1} />
          </div>
        ))}
        {items.length === 0 && (
          <div style={{
            padding: '20px 12px',
            textAlign: 'center',
            color: 'var(--text3)',
            fontSize: 12,
            fontFamily: 'var(--font-sans)',
            border: '1px dashed var(--border)',
            borderRadius: 12,
            opacity: isDragOver ? 0.9 : 0.7,
            transition: 'opacity .15s',
          }}>
            {isDragOver ? 'Drop deal here' : 'No deals in this stage'}
          </div>
        )}
      </div>
    </div>
  );
}
