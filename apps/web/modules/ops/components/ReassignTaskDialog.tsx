'use client';

import type { CSSProperties } from 'react';

export type AssignableEmployee = {
  id: string;
  user_id: string;
  display_name: string;
};

export function ReassignTaskDialog({
  open,
  employees,
  selectedUserId,
  onSelect,
  onCancel,
  onConfirm,
  busy,
}: {
  open: boolean;
  employees: AssignableEmployee[];
  selectedUserId: string;
  onSelect: (userId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  if (!open) return null;
  return (
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
        <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Reassign task</h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text2)' }}>
          Choose an employee in your managed team (or any active employee if you are an admin).
        </p>
        {employees.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>
            No assignable employees. You need task assign permission and a managed team.
          </p>
        ) : (
          <select
            value={selectedUserId}
            onChange={(e) => onSelect(e.target.value)}
            style={{
              width: '100%',
              fontSize: 13,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              boxSizing: 'border-box',
            }}
          >
            <option value="">Select employee…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.user_id}>
                {e.display_name}
              </option>
            ))}
          </select>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={btnGhost}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!selectedUserId || busy || employees.length === 0}
            style={{
              ...btnPrimary,
              opacity: !selectedUserId || busy || employees.length === 0 ? 0.5 : 1,
            }}
          >
            Reassign
          </button>
        </div>
      </div>
    </div>
  );
}

const btnGhost: CSSProperties = {
  fontSize: 13,
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--text)',
};
const btnPrimary: CSSProperties = {
  fontSize: 13,
  padding: '6px 12px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--nav-fg)',
  color: 'var(--nav-bg)',
  cursor: 'pointer',
};
