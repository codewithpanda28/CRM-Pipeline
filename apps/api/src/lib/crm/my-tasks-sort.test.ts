import { describe, it, expect } from 'vitest';
import { sortMyTasks } from './my-tasks-sort';

describe('sortMyTasks', () => {
  const now = new Date('2026-09-07T12:00:00.000Z');

  it('orders overdue before upcoming time-bound and high priority', () => {
    const sorted = sortMyTasks(
      [
        {
          id: 'low',
          status: 'open',
          priority: 'LOW',
          scheduling_mode: 'unbounded',
        },
        {
          id: 'high',
          status: 'open',
          priority: 'HIGH',
          scheduling_mode: 'unbounded',
        },
        {
          id: 'soon',
          status: 'open',
          scheduling_mode: 'time_bound',
          start_at: '2026-09-07T13:00:00.000Z',
        },
        {
          id: 'over',
          status: 'open',
          due_at: '2026-09-06T10:00:00.000Z',
          scheduling_mode: 'unbounded',
        },
        {
          id: 'done',
          status: 'done',
          priority: 'URGENT',
        },
      ],
      now,
    );
    expect(sorted.map((t) => t.id)).toEqual(['over', 'soon', 'high', 'low', 'done']);
  });
});
