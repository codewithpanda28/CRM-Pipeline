'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listItems, moveItem, deleteItem, updateItem, type PipelineItem } from '@/modules/crm/pipeline/lib/items';
import { KanbanColumn } from './KanbanColumn';
import { CompactKanbanColumn } from './CompactKanbanColumn';
import { DealCreateModal } from '@/modules/crm/pipeline/components/shared/DealCreateModal';
import type { Pipeline } from '@/modules/crm/pipeline/lib/pipelines';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import {
  useContextMenu, ContextMenu, type ContextMenuItem,
} from '@/modules/shared/components/ui/ContextMenu';
import {
  CARDS_COLUMN_LAYOUT,
  COMPACT_COLUMN_LAYOUT,
  resolveColumnLayout,
} from '@/modules/crm/pipeline/lib/column-layout';
import { defaultOpenStageId } from '@/modules/crm/pipeline/lib/deal-create-form';
import { apiFetch } from '@/modules/shared/lib/api';

interface Props {
  pipeline: Pipeline;
  search: string;
  addTrigger: number;
  /** comfortable = existing Cards; compact = Compact Board. Default comfortable. */
  density?: 'comfortable' | 'compact';
}

function computeDropPosition(destItemIds: string[], draggingId: string, targetIndex: number): number {
  const without = destItemIds.filter((id) => id !== draggingId);
  return Math.max(0, Math.min(targetIndex, without.length));
}

export function KanbanBoard({ pipeline, search, addTrigger, density = 'comfortable' }: Props) {
  const compact = density === 'compact';
  const getToken = useApiToken();
  const qc = useQueryClient();
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const canEdit = hasPermission('pipelines:edit');
  const canDelete = hasPermission('pipelines:delete');
  const canCreateDeal = hasPermission('deals:create');

  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const [formStageId, setFormStageId] = useState<string | null>(null);
  const [lastTrigger, setLastTrigger] = useState(addTrigger);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState<{ dealId: string; dealName: string } | null>(null);
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(0);

  useEffect(() => {
    if (addTrigger !== lastTrigger) {
      setLastTrigger(addTrigger);
      if (canCreateDeal) {
        setFormStageId(defaultOpenStageId(pipeline.stages));
      }
    }
  }, [addTrigger, lastTrigger, pipeline.stages, canCreateDeal]);

  const queryKey = ['items', pipeline.id] as const;

  const { data: items = [] } = useQuery({
    queryKey,
    queryFn: async () => listItems(await getToken(), pipeline.id),
  });

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => {
      const style = getComputedStyle(el);
      const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      setBoardWidth(Math.max(0, el.clientWidth - padX));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length, pipeline.stages.length, compact, search]);

  const moveMut = useMutation({
    mutationFn: async ({ id, stage_id, position }: { id: string; stage_id: string; position: number }) =>
      moveItem(await getToken(), id, { stage_id, position }),
    onMutate: async ({ id, stage_id, position }) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<PipelineItem[]>(queryKey);
      const fromStage = previous?.find((i) => i.id === id)?.stage_id;
      const dealName =
        previous?.find((i) => i.id === id)?.display?.name ??
        String(previous?.find((i) => i.id === id)?.field_values?.['name'] ?? 'Deal');
      if (previous) {
        const next = previous.map((item) => ({ ...item }));
        const moving = next.find((i) => i.id === id);
        if (moving) {
          moving.stage_id = stage_id;
          moving.position = position;
          const siblings = next
            .filter((i) => i.stage_id === stage_id && i.id !== id)
            .sort((a, b) => a.position - b.position);
          siblings.splice(Math.max(0, Math.min(position, siblings.length)), 0, moving);
          siblings.forEach((s, i) => {
            s.position = i;
          });
          qc.setQueryData(
            queryKey,
            next.map((item) => {
              const updated = siblings.find((s) => s.id === item.id);
              return updated ?? item;
            }),
          );
        }
      }
      return { previous, fromStage, dealName };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous);
      setMoveError(err instanceof Error ? err.message : 'Move failed');
    },
    onSuccess: (_data, vars, ctx) => {
      setMoveError(null);
      if (ctx?.fromStage && ctx.fromStage !== vars.stage_id) {
        setFollowUp({ dealId: vars.id, dealName: ctx.dealName ?? 'Deal' });
      }
      // Reconcile from server response without forcing a full board refetch.
      if (_data) {
        qc.setQueryData<PipelineItem[]>(queryKey, (prev) => {
          if (!prev) return prev;
          return prev.map((item) =>
            item.id === _data.id
              ? { ...item, stage_id: _data.stage_id, position: _data.position }
              : item,
          );
        });
      }
    },
    onSettled: () => {
      // Soft background reconcile — do not block UI; narrow to this pipeline only.
      void qc.invalidateQueries({ queryKey, refetchType: 'none' });
      void qc.refetchQueries({ queryKey, type: 'active' });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteItem(await getToken(), id),
    onSuccess: () => void qc.invalidateQueries({ queryKey }),
  });

  const filteredItems = search
    ? items.filter((item) => {
        const q = search.toLowerCase();
        const d = item.display;
        const haystack = [
          d?.name,
          d?.company_name,
          d?.customer_name,
          d?.owner_name,
          d?.amount,
          ...Object.values(item.field_values ?? {}),
        ]
          .map((v) => String(v ?? '').toLowerCase())
          .join(' ');
        return haystack.includes(q);
      })
    : items;

  const boardEmpty = !search && items.length === 0 && pipeline.stages.length > 0;

  const layoutOpts = compact ? COMPACT_COLUMN_LAYOUT : CARDS_COLUMN_LAYOUT;
  const columnLayout = useMemo(
    () => resolveColumnLayout(pipeline.stages.length, boardWidth, layoutOpts),
    [pipeline.stages.length, boardWidth, layoutOpts],
  );

  const itemsByStage = (stageId: string) =>
    filteredItems
      .filter((i) => i.stage_id === stageId)
      .slice()
      .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));

  const wonStage  = pipeline.stages.find(s => s.is_won);
  const lostStage = pipeline.stages.find(s => s.is_lost);
  const activeStages = pipeline.stages.filter(s => !s.is_won && !s.is_lost);

  function openCreate(stageId?: string) {
    if (!canCreateDeal) return;
    setFormStageId(defaultOpenStageId(pipeline.stages, stageId));
  }

  function dropOnStage(stageId: string, rawIndex: number) {
    if (!draggingId || !canEdit) return;
    const destItems = itemsByStage(stageId);
    const position = computeDropPosition(
      destItems.map((i) => i.id),
      draggingId,
      rawIndex,
    );
    moveMut.mutate({ id: draggingId, stage_id: stageId, position });
    setDraggingId(null);
    setDragOverStage(null);
    setInsertIndex(null);
  }

  function openCardContextMenu(itemId: string, e: React.MouseEvent) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const isOwner = user?.id === String(item.field_values['owner_id'] ?? item.display?.owner_id ?? '');
    const inWon  = item.stage_id === wonStage?.id;
    const inLost = item.stage_id === lostStage?.id;

    const menuItems = [
      { label: 'Open', icon: 'external-link', onClick: () => router.push(`/crm/records/deal:${itemId}`) },
      canEdit && activeStages.length > 0 && {
        type: 'submenu' as const,
        label: 'Move to Stage',
        icon: 'arrow-right',
        items: activeStages
          .filter(s => s.id !== item.stage_id)
          .map(s => ({
            label: s.name,
            swatch: s.color ?? '#6366f1',
            onClick: () => moveMut.mutate({ id: itemId, stage_id: s.id, position: itemsByStage(s.id).length }),
          })),
      },
      canEdit && !isOwner && user && {
        label: 'Assign to Me',
        icon: 'user',
        onClick: () => void (async () => {
          const token = await getToken();
          await updateItem(token, itemId, { field_values: { ...item.field_values, owner_id: user!.id } });
          void qc.invalidateQueries({ queryKey });
        })(),
      },
      (canEdit || canDelete) && { type: 'separator' as const },
      canEdit && wonStage && !inWon && {
        label: 'Mark as Won',
        icon: 'check-circle',
        onClick: () => moveMut.mutate({ id: itemId, stage_id: wonStage.id, position: itemsByStage(wonStage.id).length }),
      },
      canEdit && lostStage && !inLost && {
        label: 'Mark as Lost',
        icon: 'x-circle',
        onClick: () => moveMut.mutate({ id: itemId, stage_id: lostStage.id, position: itemsByStage(lostStage.id).length }),
      },
      canDelete && { type: 'separator' as const },
      canDelete && {
        label: 'Delete',
        icon: 'trash-2',
        danger: true,
        onClick: () => {
          if (confirm('Delete this deal? This cannot be undone.'))
            deleteMut.mutate(itemId);
        },
      },
    ].filter(Boolean) as ContextMenuItem[];

    openMenu(e, menuItems);
  }

  return (
    <>
      {moveError && (
        <div
          role="alert"
          style={{
            margin: '8px 24px 0',
            padding: '8px 12px',
            borderRadius: 8,
            background: 'color-mix(in srgb, var(--red) 12%, transparent)',
            color: 'var(--red)',
            fontSize: 13,
            fontFamily: 'var(--font-sans)',
          }}
        >
          {moveError}
          <button
            type="button"
            onClick={() => setMoveError(null)}
            style={{
              marginLeft: 12,
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      {boardEmpty ? (
        <div
          style={{
            margin: '24px',
            padding: '36px 28px',
            borderRadius: 16,
            border: '1px dashed var(--border)',
            background: 'var(--surface)',
            maxWidth: 560,
            fontFamily: 'var(--font-sans)',
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 650, color: 'var(--text)', marginBottom: 8 }}>
            No deals in this pipeline yet
          </div>
          <p style={{ margin: '0 0 18px', fontSize: 14, color: 'var(--text2)', lineHeight: 1.5 }}>
            A deal is a sales opportunity — something you are trying to win. Track it through stages
            from first contact to closed-won or closed-lost.
          </p>
          <button
            type="button"
            onClick={() => openCreate()}
            disabled={!canCreateDeal}
            title={canCreateDeal ? 'Add deal' : 'Requires deals:create permission'}
            style={{
              padding: '10px 16px',
              background: canCreateDeal ? 'var(--text)' : 'var(--text3)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              cursor: canCreateDeal ? 'pointer' : 'not-allowed',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
            }}
          >
            + Add deal
          </button>
        </div>
      ) : (
        <div
          ref={boardRef}
          style={{
            display: 'flex',
            gap: layoutOpts.gap,
            padding: compact ? '16px 20px' : '20px 24px',
            overflowX: 'auto',
            height: '100%',
            alignItems: compact ? 'stretch' : 'flex-start',
            boxSizing: 'border-box',
            WebkitOverflowScrolling: 'touch',
            scrollSnapType: compact ? 'x mandatory' : undefined,
          }}
        >
          {pipeline.stages.map(stage =>
            compact ? (
              <CompactKanbanColumn
                key={stage.id}
                stage={stage}
                items={itemsByStage(stage.id)}
                draggingId={draggingId}
                isDragOver={dragOverStage === stage.id}
                insertIndex={dragOverStage === stage.id ? insertIndex : null}
                onDragOverIndex={(idx) => {
                  setDragOverStage(stage.id);
                  setInsertIndex(idx);
                }}
                onDragLeave={() => {
                  setDragOverStage((prev) => (prev === stage.id ? null : prev));
                  setInsertIndex(null);
                }}
                onDropAt={(pos) => dropOnStage(stage.id, pos)}
                onCardClick={id => router.push(`/crm/records/deal:${id}`)}
                onCardDragStart={id => setDraggingId(id)}
                onCardDragEnd={() => {
                  setDraggingId(null);
                  setDragOverStage(null);
                  setInsertIndex(null);
                }}
                onAddClick={() => openCreate(stage.id)}
                onCardContextMenu={openCardContextMenu}
                columnWidth={columnLayout.width}
              />
            ) : (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                items={itemsByStage(stage.id)}
                fields={pipeline.fields}
                draggingId={draggingId}
                isDragOver={dragOverStage === stage.id}
                insertIndex={dragOverStage === stage.id ? insertIndex : null}
                onDragOverIndex={(idx) => {
                  setDragOverStage(stage.id);
                  setInsertIndex(idx);
                }}
                onDragLeave={() => {
                  setDragOverStage((prev) => (prev === stage.id ? null : prev));
                  setInsertIndex(null);
                }}
                onDropAt={(pos) => dropOnStage(stage.id, pos)}
                onCardClick={id => router.push(`/crm/records/deal:${id}`)}
                onCardDragStart={id => setDraggingId(id)}
                onCardDragEnd={() => {
                  setDraggingId(null);
                  setDragOverStage(null);
                  setInsertIndex(null);
                }}
                onAddClick={() => openCreate(stage.id)}
                onCardContextMenu={openCardContextMenu}
                columnWidth={columnLayout.width}
              />
            ),
          )}
        </div>
      )}

      {formStageId !== null && (
        <DealCreateModal
          pipelineId={pipeline.id}
          pipelineName={pipeline.name}
          stages={pipeline.stages}
          fields={pipeline.fields}
          defaultStageId={formStageId}
          onClose={() => setFormStageId(null)}
        />
      )}

      {followUp && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="stage-followup-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 90,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => !followUpBusy && setFollowUp(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 360,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 18,
              fontFamily: 'var(--font-sans)',
            }}
          >
            <h2
              id="stage-followup-title"
              style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 650, color: 'var(--text)' }}
            >
              Add a next task?
            </h2>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.45 }}>
              Stage changed for {followUp.dealName}. Create a follow-up assigned to you, or skip.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                disabled={followUpBusy || !user}
                onClick={() => {
                  void (async () => {
                    if (!user) return;
                    setFollowUpBusy(true);
                    try {
                      await apiFetch('/api/ops/tasks', {
                        method: 'POST',
                        token: await getToken(),
                        body: JSON.stringify({
                          title: `Follow up — ${followUp.dealName}`,
                          task_type: 'follow_up',
                          priority: 'MEDIUM',
                          assignee_id: user.id,
                          related_deal_id: followUp.dealId,
                          scheduling_mode: 'unbounded',
                        }),
                      });
                      setFollowUp(null);
                    } catch (err) {
                      setMoveError(err instanceof Error ? err.message : 'Could not create task');
                      setFollowUp(null);
                    } finally {
                      setFollowUpBusy(false);
                    }
                  })();
                }}
                style={{
                  fontSize: 13,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--text)',
                  background: 'var(--text)',
                  color: 'var(--bg)',
                  cursor: followUpBusy ? 'wait' : 'pointer',
                  fontWeight: 600,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                Assign to me
              </button>
              <button
                type="button"
                disabled={followUpBusy}
                onClick={() => setFollowUp(null)}
                style={{
                  fontSize: 13,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      <ContextMenu menu={menu} onClose={closeMenu} />
    </>
  );
}
