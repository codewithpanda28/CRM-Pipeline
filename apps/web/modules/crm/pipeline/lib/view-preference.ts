export type PipelineViewMode = 'kanban' | 'compact' | 'table' | 'list';

export const PIPELINE_VIEW_MODES: readonly PipelineViewMode[] = [
  'kanban',
  'compact',
  'table',
  'list',
] as const;

export const DEFAULT_PIPELINE_VIEW: PipelineViewMode = 'kanban';

export const PIPELINE_VIEW_SWITCHER_OPTIONS: {
  id: PipelineViewMode;
  label: string;
  icon: string;
}[] = [
  { id: 'kanban', label: 'Cards', icon: '⊞' },
  { id: 'compact', label: 'Compact Board', icon: '▦' },
  { id: 'table', label: 'Table', icon: '☰' },
  { id: 'list', label: 'List', icon: '≡' },
];

export function isPipelineViewMode(v: unknown): v is PipelineViewMode {
  return typeof v === 'string' && (PIPELINE_VIEW_MODES as readonly string[]).includes(v);
}

/** Per-user preference key — no new preference service. */
export function pipelineViewStorageKey(workspaceId: string, userId: string): string {
  return `thinkaiq.pipeline.view.${workspaceId}.${userId}`;
}

export function readPipelineViewPreference(
  workspaceId: string | undefined,
  userId: string | undefined,
): PipelineViewMode | null {
  if (typeof window === 'undefined' || !workspaceId || !userId) return null;
  try {
    const raw = window.localStorage.getItem(pipelineViewStorageKey(workspaceId, userId));
    return isPipelineViewMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writePipelineViewPreference(
  workspaceId: string | undefined,
  userId: string | undefined,
  view: PipelineViewMode,
): void {
  if (typeof window === 'undefined' || !workspaceId || !userId) return;
  if (!isPipelineViewMode(view)) return;
  try {
    window.localStorage.setItem(pipelineViewStorageKey(workspaceId, userId), view);
  } catch {
    // ignore quota / private mode
  }
}
