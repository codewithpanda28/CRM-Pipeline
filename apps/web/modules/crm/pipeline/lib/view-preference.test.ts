import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_PIPELINE_VIEW,
  isPipelineViewMode,
  pipelineViewStorageKey,
  readPipelineViewPreference,
  writePipelineViewPreference,
} from './view-preference';
import { PIPELINE_VIEW_SWITCHER_OPTIONS } from './view-preference';
import { compactCardLines } from '../components/kanban/CompactKanbanCard';
import { formatCompactStageTotal } from '../components/kanban/CompactKanbanColumn';
import type { PipelineItem } from './items';

describe('pipeline view switcher options', () => {
  it('exposes Cards, Compact Board, Table, List with kanban default id', () => {
    expect(PIPELINE_VIEW_SWITCHER_OPTIONS.map((o) => o.id)).toEqual([
      'kanban',
      'compact',
      'table',
      'list',
    ]);
    expect(PIPELINE_VIEW_SWITCHER_OPTIONS[0]?.label).toBe('Cards');
    expect(PIPELINE_VIEW_SWITCHER_OPTIONS[1]?.label).toBe('Compact Board');
    expect(DEFAULT_PIPELINE_VIEW).toBe('kanban');
  });
});

describe('pipeline view preference', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds storage key and round-trips allowed views', () => {
    expect(pipelineViewStorageKey('ws1', 'u1')).toBe('thinkaiq.pipeline.view.ws1.u1');
    expect(isPipelineViewMode('compact')).toBe(true);
    expect(isPipelineViewMode('board')).toBe(false);

    writePipelineViewPreference('ws1', 'u1', 'compact');
    expect(readPipelineViewPreference('ws1', 'u1')).toBe('compact');
    expect(readPipelineViewPreference('ws1', 'u2')).toBeNull();
  });
});

describe('compact card lines', () => {
  it('omits empty optional fields', () => {
    const lines = compactCardLines({
      name: 'Deal A',
      amount: '1000',
      currency: 'INR',
      owner_id: null,
      owner_name: null,
      company_id: null,
      company_name: null,
      customer_party_id: null,
      customer_name: null,
      expected_close_at: null,
      status: 'open',
      probability: null,
      next_action: null,
      product_label: null,
    });
    expect(lines.party).toBeNull();
    expect(lines.probability).toBeNull();
    expect(lines.owner).toBeNull();
    expect(lines.nextAction).toBeNull();
    expect(lines.due).toBeNull();
    expect(lines.product).toBeNull();
    expect(lines.status).toBeNull();
  });

  it('shows probability and prefers customer party', () => {
    const lines = compactCardLines({
      name: 'Deal B',
      amount: '2500.5',
      currency: 'INR',
      owner_id: 'x',
      owner_name: 'User A',
      company_id: 'c',
      company_name: 'Co',
      customer_party_id: 'p',
      customer_name: 'Party P',
      expected_close_at: '2026-09-10T00:00:00.000Z',
      status: 'won',
      probability: 40,
      next_action: { title: 'Call prospect tomorrow morning', due_at: '2026-09-07T10:00:00.000Z' },
      product_label: 'Hosting',
    });
    expect(lines.party).toBe('Party P');
    expect(lines.probability).toBe('40%');
    expect(lines.nextAction).toBe('Call prospect tomorrow m');
    expect(lines.product).toBe('Hosting');
    expect(lines.status).toBe('won');
    expect(lines.owner).toBe('UA');
  });
});

describe('compact stage totals', () => {
  it('sums amounts for a stage', () => {
    const items = [
      {
        id: '1',
        display: { amount: '100', currency: 'INR' },
        field_values: {},
      },
      {
        id: '2',
        display: { amount: '50', currency: 'INR' },
        field_values: {},
      },
    ] as unknown as PipelineItem[];
    const total = formatCompactStageTotal(items);
    expect(total).toBeTruthy();
    expect(total).toMatch(/150|₹/);
  });
});
