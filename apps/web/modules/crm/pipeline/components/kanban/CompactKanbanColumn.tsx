'use client';

import { useState } from 'react';
import { CompactKanbanCard } from './CompactKanbanCard';
import type { PipelineItem } from '@/modules/crm/pipeline/lib/items';
import type { PipelineStage } from '@/modules/crm/pipeline/lib/pipelines';

interface Props {
  stage: PipelineStage;
  items: PipelineItem[];
  draggingId: string | null;
  isDragOver: boolean;
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

export function formatCompactStageTotal(items: PipelineItem[]): string | null {
  if (!items.length) return null;
  const byCurrency = new Map<string, number>();
  for (const item of items) {
    const currency = item.display?.currency ?? String(item.field_values?.['currency'] ?? 'INR');
    const amount = Number(
      item.display?.amount ?? item.field_values?.['amount'] ?? item.field_values?.['value'] ?? 0,
    );
    if (!Number.isFinite(amount)) continue;
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + amount);
  }
  if (byCurrency.size === 0) return null;
  const entries = [...byCurrency.entries()];
  const [currency, total] = entries[0]!;
  const suffix = entries.length > 1 ? '+' : '';
  try {
    return (
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(total) + suffix
    );
  } catch {
    return `${currency} ${total.toFixed(0)}${suffix}`;
  }
}

function InsertLine({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        height: visible ? 2 : 0,
        margin: visible ? '1px 0' : 0,
        borderRadius: 1,
        background: visible ? 'var(--accent, #3b82f6)' : 'transparent',
      }}
    />
  );
}

export function CompactKanbanColumn({
  stage,
  items,
  draggingId,
  isDragOver,
  insertIndex,
  onDragOverIndex,
  onDragLeave,
  onDropAt,
  onCardClick,
  onCardDragStart,
  onCardDragEnd,
  onAddClick,
  onCardContextMenu,
  columnWidth = 200,
}: Props) {
  const [addHovered, setAddHovered] = useState(false);
  const color = stageColor(stage);
  const stageTotal = formatCompactStageTotal(items);
  const width = Math.max(180, columnWidth);

  return (
    <div
      className="compact-pipeline-column"
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '100%',
        scrollSnapAlign: 'start',
        borderLeft: `3px solid ${color}`,
        paddingLeft: 8,
        boxSizing: 'border-box',
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverIndex(items.length);
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        onDropAt(insertIndex ?? items.length);
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 6,
          marginBottom: 8,
          padding: '0 2px',
          minWidth: 0,
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              fontFamily: 'var(--font-sans)',
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={stage.name}
          >
            {stage.name}
          </div>
          <div
            style={{
              marginTop: 2,
              display: 'flex',
              flexWrap: 'wrap',
              gap: '2px 8px',
              alignItems: 'baseline',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500 }}>
              {items.length}
            </span>
            {stageTotal && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--text)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {stageTotal}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onAddClick}
          onMouseEnter={() => setAddHovered(true)}
          onMouseLeave={() => setAddHovered(false)}
          style={{
            width: 24,
            height: 24,
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: addHovered ? 'var(--surface2)' : 'var(--surface)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            color: addHovered ? 'var(--text)' : 'var(--text3)',
            lineHeight: 1,
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
          minHeight: 64,
          overflowY: 'auto',
          flex: 1,
          borderRadius: 8,
          padding: isDragOver ? 4 : 0,
          margin: isDragOver ? -4 : 0,
          background: isDragOver ? 'var(--surface2)' : 'transparent',
          transition: 'all .12s ease',
        }}
      >
        <InsertLine visible={isDragOver && insertIndex === 0} />
        {items.map((item, idx) => (
          <div key={item.id}>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const before = e.clientY < rect.top + rect.height / 2;
                onDragOverIndex(before ? idx : idx + 1);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDropAt(insertIndex ?? idx);
              }}
            >
              <CompactKanbanCard
                item={item}
                isDragging={draggingId === item.id}
                onClick={() => onCardClick(item.id)}
                onDragStart={() => onCardDragStart(item.id)}
                onDragEnd={onCardDragEnd}
                onContextMenu={(e) => onCardContextMenu(item.id, e)}
              />
            </div>
            <InsertLine visible={isDragOver && insertIndex === idx + 1} />
          </div>
        ))}
        {items.length === 0 && (
          <div
            style={{
              padding: '14px 8px',
              textAlign: 'center',
              color: 'var(--text3)',
              fontSize: 11,
              fontFamily: 'var(--font-sans)',
              border: '1px dashed var(--border)',
              borderRadius: 8,
              opacity: isDragOver ? 0.9 : 0.7,
            }}
          >
            {isDragOver ? 'Drop here' : 'Empty'}
          </div>
        )}
      </div>
      <style>{`
        @media (max-width: 767px) {
          .compact-pipeline-column {
            min-width: calc(100vw - 48px) !important;
            max-width: calc(100vw - 48px) !important;
            width: calc(100vw - 48px) !important;
          }
        }
        @media (min-width: 768px) and (max-width: 1099px) {
          .compact-pipeline-column {
            min-width: 180px !important;
            max-width: 200px !important;
          }
        }
      `}</style>
    </div>
  );
}
