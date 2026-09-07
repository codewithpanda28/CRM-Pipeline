'use client';

import {
  PIPELINE_VIEW_SWITCHER_OPTIONS,
  type PipelineViewMode,
} from '@/modules/crm/pipeline/lib/view-preference';

interface Props {
  current: PipelineViewMode;
  onChange: (v: PipelineViewMode) => void;
}

export { PIPELINE_VIEW_SWITCHER_OPTIONS };

export function ViewSwitcher({ current, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Pipeline view"
      style={{
        display: 'flex',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 3,
        gap: 2,
        flexShrink: 0,
        flexWrap: 'wrap',
      }}
    >
      {PIPELINE_VIEW_SWITCHER_OPTIONS.map((v) => {
        const active = current === v.id;
        return (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={v.label}
            onClick={() => onChange(v.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 12px',
              border: 'none',
              borderRadius: 8,
              background: active ? 'var(--surface)' : 'transparent',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              color: active ? 'var(--text)' : 'var(--text3)',
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: 'var(--font-sans)',
              fontWeight: active ? 600 : 400,
              transition: 'var(--transition)',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>{v.icon}</span>
            <span className="pipeline-view-label">{v.label}</span>
          </button>
        );
      })}
      <style>{`
        @media (max-width: 640px) {
          .pipeline-view-label { display: none; }
        }
      `}</style>
    </div>
  );
}
