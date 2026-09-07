import { describe, it, expect } from 'vitest';
import { classifyMyTaskGroup, groupMyTasks } from './my-tasks-groups';

describe('groupMyTasks', () => {
  const now = new Date('2026-09-07T12:00:00');

  it('buckets open tasks without reordering within groups', () => {
    const tasks = [
      { id: 'a', status: 'open', priority: 'HIGH', due_at: '2026-09-06T10:00:00' },
      { id: 'b', status: 'open', priority: 'MEDIUM', due_at: '2026-09-07T15:00:00' },
      { id: 'c', status: 'open', priority: 'URGENT', scheduling_mode: 'unbounded' },
      { id: 'd', status: 'open', priority: 'LOW', due_at: '2026-09-10T10:00:00' },
      { id: 'e', status: 'open', priority: 'MEDIUM' },
      { id: 'f', status: 'done', priority: 'HIGH', due_at: '2026-09-06T10:00:00' },
    ];
    const groups = groupMyTasks(tasks, now);
    expect(groups.map((g) => g.key)).toEqual(['overdue', 'today', 'high', 'upcoming', 'no_deadline']);
    expect(groups.find((g) => g.key === 'overdue')!.tasks.map((t) => t.id)).toEqual(['a']);
    expect(groups.find((g) => g.key === 'today')!.tasks.map((t) => t.id)).toEqual(['b']);
    expect(groups.find((g) => g.key === 'high')!.tasks.map((t) => t.id)).toEqual(['c']);
    expect(groups.find((g) => g.key === 'upcoming')!.tasks.map((t) => t.id)).toEqual(['d']);
    expect(groups.find((g) => g.key === 'no_deadline')!.tasks.map((t) => t.id)).toEqual(['e']);
  });

  it('classifies time-bound today separately from high unbounded', () => {
    expect(
      classifyMyTaskGroup(
        {
          id: 'm',
          status: 'open',
          priority: 'URGENT',
          scheduling_mode: 'time_bound',
          start_at: '2026-09-07T14:00:00',
        },
        now,
      ),
    ).toBe('today');
  });
});
