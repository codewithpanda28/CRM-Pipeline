import { describe, expect, it } from 'vitest';
import {
  CARDS_COLUMN_LAYOUT,
  COMPACT_COLUMN_LAYOUT,
  resolveColumnLayout,
} from './column-layout';

describe('resolveColumnLayout', () => {
  it('fills available width when few stages fit', () => {
    const r = resolveColumnLayout(3, 1200, CARDS_COLUMN_LAYOUT);
    expect(r.mode).toBe('fill');
    expect(r.width).toBeGreaterThanOrEqual(CARDS_COLUMN_LAYOUT.minWidth);
    expect(r.width).toBeLessThanOrEqual(CARDS_COLUMN_LAYOUT.maxWidth);
    // 1200 - 2*20 = 1160 / 3 ≈ 386 → capped at max 360
    expect(r.width).toBe(360);
  });

  it('scrolls with min width when many stages exceed board', () => {
    const r = resolveColumnLayout(8, 900, CARDS_COLUMN_LAYOUT);
    expect(r.mode).toBe('scroll');
    expect(r.width).toBe(CARDS_COLUMN_LAYOUT.minWidth);
  });

  it('uses compact mins/maxes', () => {
    const fill = resolveColumnLayout(2, 800, COMPACT_COLUMN_LAYOUT);
    expect(fill.mode).toBe('fill');
    expect(fill.width).toBe(COMPACT_COLUMN_LAYOUT.maxWidth);

    const scroll = resolveColumnLayout(10, 500, COMPACT_COLUMN_LAYOUT);
    expect(scroll.mode).toBe('scroll');
    expect(scroll.width).toBe(COMPACT_COLUMN_LAYOUT.minWidth);
  });

  it('handles empty / zero board width safely', () => {
    expect(resolveColumnLayout(0, 1000, CARDS_COLUMN_LAYOUT).width).toBe(260);
    expect(resolveColumnLayout(3, 0, CARDS_COLUMN_LAYOUT).mode).toBe('scroll');
  });
});
