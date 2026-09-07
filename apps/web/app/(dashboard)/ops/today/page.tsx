'use client';

import { useState } from 'react';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { OpsShell, TaskBucket } from '@/modules/ops/components/OpsShell';
import { ReassignTaskDialog } from '@/modules/ops/components/ReassignTaskDialog';
import {
  useOpsToday,
  useCompleteOpsTask,
  useRescheduleOpsTask,
  useCreateOpsTask,
  useReassignOpsTask,
  useOpsAssignableEmployees,
} from '@/modules/ops/lib/hooks';

export default function OpsTodayPage() {
  const [scope, setScope] = useState<'mine' | 'team' | 'all'>('mine');
  const { data, isLoading, error } = useOpsToday(scope);
  const complete = useCompleteOpsTask();
  const reschedule = useRescheduleOpsTask();
  const reassign = useReassignOpsTask();
  const create = useCreateOpsTask();
  const assignable = useOpsAssignableEmployees();
  const [title, setTitle] = useState('');
  const [outcomeId, setOutcomeId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState('');
  const [reassignTaskId, setReassignTaskId] = useState<string | null>(null);
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const buckets = data?.data;

  const empOptions = assignable.data?.data ?? [];
  const canReassign = empOptions.length > 0;

  function onReschedule(id: string) {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(10, 0, 0, 0);
    reschedule.mutate({ id, due_at: next.toISOString() });
  }

  function onComplete(id: string) {
    setOutcomeId(id);
    setOutcome('');
  }

  function submitOutcome() {
    if (!outcomeId) return;
    complete.mutate({ id: outcomeId, completion_outcome: outcome || undefined });
    setOutcomeId(null);
    setOutcome('');
  }

  function openReassign(id: string) {
    setReassignTaskId(id);
    setAssigneeUserId('');
  }

  function confirmReassign() {
    if (!reassignTaskId || !assigneeUserId) return;
    reassign.mutate(
      { id: reassignTaskId, assignee_id: assigneeUserId },
      {
        onSuccess: () => {
          setReassignTaskId(null);
          setAssigneeUserId('');
        },
      },
    );
  }

  const reassignHandler = canReassign ? openReassign : undefined;

  return (
    <ModuleGuard moduleId="ops">
      <OpsShell
        title="Today"
        subtitle="Overdue, due today, upcoming, and high priority follow-ups."
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as 'mine' | 'team' | 'all')}
              style={{
                fontSize: 13,
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
              }}
            >
              <option value="mine">Mine</option>
              <option value="team">Team</option>
              <option value="all">All</option>
            </select>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!title.trim()) return;
                const due = new Date();
                due.setHours(due.getHours() + 1);
                create.mutate({ title: title.trim(), task_type: 'follow_up', due_at: due.toISOString() });
                setTitle('');
              }}
              style={{ display: 'flex', gap: 6 }}
            >
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Quick follow-up…"
                style={{
                  fontSize: 13,
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  minWidth: 160,
                }}
              />
              <button
                type="submit"
                style={{
                  fontSize: 13,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--nav-fg)',
                  color: 'var(--nav-bg)',
                  cursor: 'pointer',
                }}
              >
                Add
              </button>
            </form>
          </div>
        }
      >
        {isLoading ? <p style={{ color: 'var(--text2)' }}>Loading…</p> : null}
        {error ? <p style={{ color: 'var(--red)' }}>Could not load Today.</p> : null}
        {buckets &&
        buckets.overdue.length === 0 &&
        buckets.today.length === 0 &&
        buckets.upcoming.length === 0 ? (
          <p style={{ color: 'var(--text2)' }}>Nothing due — you&apos;re clear for now.</p>
        ) : null}
        {buckets ? (
          <>
            <TaskBucket
              label="Overdue"
              tasks={buckets.overdue}
              onComplete={onComplete}
              onReschedule={onReschedule}
              onReassign={reassignHandler}
            />
            <TaskBucket
              label="Due today"
              tasks={buckets.today}
              onComplete={onComplete}
              onReschedule={onReschedule}
              onReassign={reassignHandler}
            />
            <TaskBucket
              label="High priority"
              tasks={buckets.high_priority}
              onComplete={onComplete}
              onReschedule={onReschedule}
              onReassign={reassignHandler}
            />
            <TaskBucket
              label="Upcoming"
              tasks={buckets.upcoming}
              onComplete={onComplete}
              onReschedule={onReschedule}
              onReassign={reassignHandler}
            />
          </>
        ) : null}

        {outcomeId ? (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
            }}
          >
            <div
              style={{
                background: 'var(--surface)',
                padding: 20,
                borderRadius: 12,
                width: 'min(420px, 92vw)',
                border: '1px solid var(--border)',
              }}
            >
              <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Complete with outcome</h3>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text2)' }}>
                Optional note for what happened (call result, next step, etc.).
              </p>
              <textarea
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  fontSize: 13,
                  padding: 8,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setOutcomeId(null)} style={btnGhost}>
                  Cancel
                </button>
                <button type="button" onClick={submitOutcome} style={btnPrimary}>
                  Mark done
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <ReassignTaskDialog
          open={!!reassignTaskId}
          employees={empOptions}
          selectedUserId={assigneeUserId}
          onSelect={setAssigneeUserId}
          onCancel={() => {
            setReassignTaskId(null);
            setAssigneeUserId('');
          }}
          onConfirm={confirmReassign}
          busy={reassign.isPending}
        />
      </OpsShell>
    </ModuleGuard>
  );
}

const btnGhost: React.CSSProperties = {
  fontSize: 13,
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--text)',
};
const btnPrimary: React.CSSProperties = {
  fontSize: 13,
  padding: '6px 12px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--nav-fg)',
  color: 'var(--nav-bg)',
  cursor: 'pointer',
};
