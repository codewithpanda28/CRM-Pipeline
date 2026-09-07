'use client';

import { useState } from 'react';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { OpsShell, TaskBucket } from '@/modules/ops/components/OpsShell';
import { ReassignTaskDialog } from '@/modules/ops/components/ReassignTaskDialog';
import {
  useOpsMyWork,
  useCompleteOpsTask,
  useRescheduleOpsTask,
  useReassignOpsTask,
  useOpsAssignableEmployees,
} from '@/modules/ops/lib/hooks';

export default function OpsMyWorkPage() {
  const [type, setType] = useState('');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('');
  const { data, isLoading } = useOpsMyWork({
    type: type || undefined,
    priority: priority || undefined,
    status: status || undefined,
  });
  const complete = useCompleteOpsTask();
  const reschedule = useRescheduleOpsTask();
  const reassign = useReassignOpsTask();
  const assignable = useOpsAssignableEmployees();
  const [reassignTaskId, setReassignTaskId] = useState<string | null>(null);
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const buckets = data?.data?.buckets;

  const empOptions = assignable.data?.data ?? [];
  const canReassign = empOptions.length > 0;
  const reassignHandler = canReassign
    ? (id: string) => {
        setReassignTaskId(id);
        setAssigneeUserId('');
      }
    : undefined;

  function onReschedule(id: string) {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(10, 0, 0, 0);
    reschedule.mutate({ id, due_at: next.toISOString() });
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

  return (
    <ModuleGuard moduleId="ops">
      <OpsShell
        title="My Work"
        subtitle="Your assigned business tasks with filters."
        actions={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select value={type} onChange={(e) => setType(e.target.value)} style={sel}>
              <option value="">All types</option>
              <option value="follow_up">Follow-up</option>
              <option value="call">Call</option>
              <option value="demo">Demo</option>
              <option value="payment_follow_up">Payment follow-up</option>
            </select>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} style={sel}>
              <option value="">All priorities</option>
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={sel}>
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
          </div>
        }
      >
        {isLoading ? <p style={{ color: 'var(--text2)' }}>Loading…</p> : null}
        {buckets ? (
          <>
            <TaskBucket
              label="Overdue"
              tasks={buckets.overdue}
              onComplete={(id) => complete.mutate(id)}
              onReschedule={onReschedule}
              onReassign={reassignHandler}
            />
            <TaskBucket
              label="Due today"
              tasks={buckets.today}
              onComplete={(id) => complete.mutate(id)}
              onReschedule={onReschedule}
              onReassign={reassignHandler}
            />
            <TaskBucket
              label="Upcoming"
              tasks={buckets.upcoming}
              onComplete={(id) => complete.mutate(id)}
              onReschedule={onReschedule}
              onReassign={reassignHandler}
            />
          </>
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

const sel: React.CSSProperties = {
  fontSize: 12,
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
};
