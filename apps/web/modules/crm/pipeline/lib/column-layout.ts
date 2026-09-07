/** Responsive pipeline column width: fill when few stages, scroll when many. */

export type ColumnLayoutMode = 'fill' | 'scroll';

export interface ColumnLayoutOpts {
  minWidth: number;
  maxWidth: number;
  gap: number;
}

export interface ColumnLayoutResult {
  mode: ColumnLayoutMode;
  /** Pixel width applied to each column */
  width: number;
}

/**
 * When stage min-widths fit the board, grow columns equally up to maxWidth.
 * Otherwise keep minWidth and let the board scroll horizontally.
 */
export function resolveColumnLayout(
  stageCount: number,
  boardWidth: number,
  opts: ColumnLayoutOpts,
): ColumnLayoutResult {
  const { minWidth, maxWidth, gap } = opts;
  if (stageCount <= 0 || boardWidth <= 0) {
    return { mode: 'scroll', width: minWidth };
  }
  const totalGaps = Math.max(0, stageCount - 1) * gap;
  const totalMin = stageCount * minWidth + totalGaps;
  if (totalMin <= boardWidth) {
    const available = boardWidth - totalGaps;
    const grown = Math.floor(available / stageCount);
    const width = Math.min(maxWidth, Math.max(minWidth, grown));
    return { mode: 'fill', width };
  }
  return { mode: 'scroll', width: minWidth };
}

export const CARDS_COLUMN_LAYOUT: ColumnLayoutOpts = {
  minWidth: 260,
  maxWidth: 360,
  gap: 20,
};

export const COMPACT_COLUMN_LAYOUT: ColumnLayoutOpts = {
  minWidth: 200,
  maxWidth: 280,
  gap: 12,
};
