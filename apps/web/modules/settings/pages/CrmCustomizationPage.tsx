'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { apiFetch } from '@/modules/shared/lib/api';
import {
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  pageShellStyle,
  panelStyle,
  sectionTitleStyle,
} from '@/modules/crm/shared/ui';

type EntityType = 'lead' | 'customer_party' | 'deal';

type CrmSection = {
  id: string;
  section_key: string;
  label: string;
  position: number;
  archived_at?: string | null;
};

type CrmField = {
  id: string;
  section_id: string | null;
  field_key: string;
  label: string;
  field_type: string;
  required: boolean;
  position: number;
  searchable?: boolean;
  archived_at?: string | null;
};

type CrmOption = {
  id: string;
  option_value: string;
  label: string;
  position: number;
  archived_at?: string | null;
};

const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'customer_party', label: 'Customer party' },
  { value: 'deal', label: 'Deal' },
];

const FIELD_TYPES = [
  'text',
  'long_text',
  'number',
  'currency',
  'date',
  'datetime',
  'phone',
  'email',
  'url',
  'single_select',
  'multi_select',
  'checkbox',
  'user_ref',
] as const;

const fieldStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 13,
  fontFamily: 'var(--font-sans)',
};

const rowBtn: React.CSSProperties = {
  fontSize: 12,
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  cursor: 'pointer',
  color: 'var(--text)',
  fontFamily: 'var(--font-sans)',
};

function snakeKey(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([^a-z])/, 'f$1')
    .slice(0, 64);
}

export default function CrmCustomizationPage() {
  const { hasPermission, user } = useAuth();
  const getToken = useApiToken();
  const qc = useQueryClient();
  const canManage = hasPermission('workspace:manage') || Boolean(user?.isAdmin);

  const [entityType, setEntityType] = useState<EntityType>('lead');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const [sectionLabel, setSectionLabel] = useState('');
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType, setFieldType] = useState<string>('text');
  const [fieldSectionId, setFieldSectionId] = useState('');
  const [optionLabel, setOptionLabel] = useState('');

  const qs = useMemo(() => {
    const p = new URLSearchParams({ entity_type: entityType });
    if (includeArchived) p.set('include_archived', '1');
    return `?${p}`;
  }, [entityType, includeArchived]);

  const sectionsQ = useQuery({
    queryKey: ['crm-customization', 'sections', entityType, includeArchived],
    queryFn: async () =>
      apiFetch<{ data: CrmSection[] }>(`/api/crm/customization/sections${qs}`, {
        token: await getToken(),
      }),
    enabled: Boolean(user),
  });

  const fieldsQ = useQuery({
    queryKey: ['crm-customization', 'fields', entityType, includeArchived],
    queryFn: async () =>
      apiFetch<{ data: CrmField[] }>(`/api/crm/customization/fields${qs}`, {
        token: await getToken(),
      }),
    enabled: Boolean(user),
  });

  const optionsQ = useQuery({
    queryKey: ['crm-customization', 'options', selectedFieldId, includeArchived],
    queryFn: async () => {
      const p = includeArchived ? '?include_archived=1' : '';
      return apiFetch<{ data: CrmOption[] }>(
        `/api/crm/customization/fields/${selectedFieldId}/options${p}`,
        { token: await getToken() },
      );
    },
    enabled: Boolean(user) && Boolean(selectedFieldId),
  });

  const sections = sectionsQ.data?.data ?? [];
  const fields = fieldsQ.data?.data ?? [];
  const options = optionsQ.data?.data ?? [];
  const selectedField = fields.find((f) => f.id === selectedFieldId) ?? null;
  const selectField =
    selectedField &&
    (selectedField.field_type === 'single_select' || selectedField.field_type === 'multi_select');

  function invalidateAll() {
    void qc.invalidateQueries({ queryKey: ['crm-customization'] });
  }

  const createSection = useMutation({
    mutationFn: async () => {
      const label = sectionLabel.trim();
      const section_key = snakeKey(label);
      if (!label || !section_key) throw new Error('Section label required');
      return apiFetch('/api/crm/customization/sections', {
        method: 'POST',
        token: await getToken(),
        body: JSON.stringify({ entity_type: entityType, section_key, label }),
      });
    },
    onSuccess: () => {
      setSectionLabel('');
      setError(null);
      invalidateAll();
    },
    onError: (e: Error) => setError(e.message),
  });

  const renameSection = useMutation({
    mutationFn: async (p: { id: string; label: string }) =>
      apiFetch(`/api/crm/customization/sections/${p.id}`, {
        method: 'PATCH',
        token: await getToken(),
        body: JSON.stringify({ label: p.label }),
      }),
    onSuccess: () => {
      setError(null);
      invalidateAll();
    },
    onError: (e: Error) => setError(e.message),
  });

  const archiveSection = useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/api/crm/customization/sections/${id}`, {
        method: 'PATCH',
        token: await getToken(),
        body: JSON.stringify({ archive: true }),
      }),
    onSuccess: () => invalidateAll(),
    onError: (e: Error) => setError(e.message),
  });

  const reorderSections = useMutation({
    mutationFn: async (ids: string[]) =>
      apiFetch('/api/crm/customization/sections/reorder', {
        method: 'POST',
        token: await getToken(),
        body: JSON.stringify({ entity_type: entityType, ids }),
      }),
    onSuccess: () => invalidateAll(),
    onError: (e: Error) => setError(e.message),
  });

  const createField = useMutation({
    mutationFn: async () => {
      const label = fieldLabel.trim();
      const field_key = snakeKey(label);
      if (!label || !field_key) throw new Error('Field label required');
      return apiFetch('/api/crm/customization/fields', {
        method: 'POST',
        token: await getToken(),
        body: JSON.stringify({
          entity_type: entityType,
          section_id: fieldSectionId || null,
          field_key,
          label,
          field_type: fieldType,
        }),
      });
    },
    onSuccess: () => {
      setFieldLabel('');
      setError(null);
      invalidateAll();
    },
    onError: (e: Error) => setError(e.message),
  });

  const renameField = useMutation({
    mutationFn: async (p: { id: string; label: string }) =>
      apiFetch(`/api/crm/customization/fields/${p.id}`, {
        method: 'PATCH',
        token: await getToken(),
        body: JSON.stringify({ label: p.label }),
      }),
    onSuccess: () => invalidateAll(),
    onError: (e: Error) => setError(e.message),
  });

  const archiveField = useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/api/crm/customization/fields/${id}`, {
        method: 'PATCH',
        token: await getToken(),
        body: JSON.stringify({ archive: true }),
      }),
    onSuccess: (_data, id) => {
      if (selectedFieldId === id) setSelectedFieldId(null);
      invalidateAll();
    },
    onError: (e: Error) => setError(e.message),
  });

  const createOption = useMutation({
    mutationFn: async () => {
      if (!selectedFieldId) throw new Error('Select a field');
      const label = optionLabel.trim();
      if (!label) throw new Error('Option label required');
      const option_value = snakeKey(label) || label;
      return apiFetch(`/api/crm/customization/fields/${selectedFieldId}/options`, {
        method: 'POST',
        token: await getToken(),
        body: JSON.stringify({ option_value, label }),
      });
    },
    onSuccess: () => {
      setOptionLabel('');
      setError(null);
      void qc.invalidateQueries({ queryKey: ['crm-customization', 'options'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const renameOption = useMutation({
    mutationFn: async (p: { id: string; label: string }) =>
      apiFetch(`/api/crm/customization/options/${p.id}`, {
        method: 'PATCH',
        token: await getToken(),
        body: JSON.stringify({ label: p.label }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['crm-customization', 'options'] }),
    onError: (e: Error) => setError(e.message),
  });

  const archiveOption = useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/api/crm/customization/options/${id}`, {
        method: 'PATCH',
        token: await getToken(),
        body: JSON.stringify({ archive: true }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['crm-customization', 'options'] }),
    onError: (e: Error) => setError(e.message),
  });

  const reorderOptions = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!selectedFieldId) throw new Error('No field');
      return apiFetch(`/api/crm/customization/fields/${selectedFieldId}/options/reorder`, {
        method: 'POST',
        token: await getToken(),
        body: JSON.stringify({ ids }),
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['crm-customization', 'options'] }),
    onError: (e: Error) => setError(e.message),
  });

  function moveSection(id: string, dir: -1 | 1) {
    const ids = sections.map((s) => s.id);
    const idx = ids.indexOf(id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= ids.length) return;
    const copy = [...ids];
    const [item] = copy.splice(idx, 1);
    copy.splice(next, 0, item!);
    reorderSections.mutate(copy);
  }

  function moveOption(id: string, dir: -1 | 1) {
    const ids = options.map((o) => o.id);
    const idx = ids.indexOf(id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= ids.length) return;
    const copy = [...ids];
    const [item] = copy.splice(idx, 1);
    copy.splice(next, 0, item!);
    reorderOptions.mutate(copy);
  }

  if (!canManage) {
    return (
      <div style={pageShellStyle}>
        <PageHeader title="CRM Customization" subtitle="Sections, fields, and select options." />
        <div style={panelStyle}>
          <p style={{ margin: 0, color: 'var(--text2)', fontSize: 13 }}>
            Requires workspace:manage permission.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={pageShellStyle}>
      <PageHeader
        title="CRM Customization"
        subtitle="Tenant sections, fields, and options for lead, customer party, and deal records."
        actions={
          <SecondaryButton
            type="button"
            onClick={() => {
              void sectionsQ.refetch();
              void fieldsQ.refetch();
            }}
          >
            Refresh
          </SecondaryButton>
        }
      />

      {error ? (
        <p role="alert" style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>
          {error}
        </p>
      ) : null}

      <div style={{ ...panelStyle, marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', gap: 8, alignItems: 'center' }}>
            Entity
            <select
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value as EntityType);
                setSelectedFieldId(null);
              }}
              style={{ ...fieldStyle, width: 'auto', minWidth: 160 }}
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            Include archived
          </label>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          alignItems: 'start',
        }}
      >
        <div style={panelStyle}>
          <h2 style={sectionTitleStyle}>Sections</h2>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input
              placeholder="New section label"
              value={sectionLabel}
              onChange={(e) => setSectionLabel(e.target.value)}
              style={{ ...fieldStyle, flex: '1 1 140px' }}
            />
            <PrimaryButton
              type="button"
              disabled={createSection.isPending || !sectionLabel.trim()}
              onClick={() => createSection.mutate()}
            >
              Add
            </PrimaryButton>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {sections.map((s, i) => (
              <li
                key={s.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
                  opacity: s.archived_at ? 0.55 : 1,
                }}
              >
                <span style={{ flex: '1 1 120px', fontSize: 13, color: 'var(--text)' }}>
                  {s.label}
                  <span style={{ color: 'var(--text3)', fontSize: 11 }}> · {s.section_key}</span>
                </span>
                {!s.archived_at ? (
                  <>
                    <button type="button" style={rowBtn} disabled={i === 0} onClick={() => moveSection(s.id, -1)}>
                      ↑
                    </button>
                    <button
                      type="button"
                      style={rowBtn}
                      disabled={i === sections.length - 1}
                      onClick={() => moveSection(s.id, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      style={rowBtn}
                      onClick={() => {
                        const label = window.prompt('Rename section', s.label);
                        if (label?.trim()) renameSection.mutate({ id: s.id, label: label.trim() });
                      }}
                    >
                      Rename
                    </button>
                    <button type="button" style={rowBtn} onClick={() => archiveSection.mutate(s.id)}>
                      Archive
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>archived</span>
                )}
              </li>
            ))}
          </ul>
          {!sectionsQ.isLoading && sections.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>No sections yet.</p>
          ) : null}
        </div>

        <div style={panelStyle}>
          <h2 style={sectionTitleStyle}>Fields</h2>
          <div
            style={{
              display: 'grid',
              gap: 8,
              marginBottom: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            }}
          >
            <input
              placeholder="New field label"
              value={fieldLabel}
              onChange={(e) => setFieldLabel(e.target.value)}
              style={fieldStyle}
            />
            <select value={fieldType} onChange={(e) => setFieldType(e.target.value)} style={fieldStyle}>
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select value={fieldSectionId} onChange={(e) => setFieldSectionId(e.target.value)} style={fieldStyle}>
              <option value="">No section</option>
              {sections
                .filter((s) => !s.archived_at)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
            </select>
            <PrimaryButton
              type="button"
              disabled={createField.isPending || !fieldLabel.trim()}
              onClick={() => createField.mutate()}
            >
              Add field
            </PrimaryButton>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {fields.map((f) => {
              const active = selectedFieldId === f.id;
              return (
                <li
                  key={f.id}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
                    opacity: f.archived_at ? 0.55 : 1,
                    background: active ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : undefined,
                    borderRadius: 6,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedFieldId(f.id)}
                    style={{
                      flex: '1 1 140px',
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: 13,
                      color: 'var(--text)',
                      fontFamily: 'var(--font-sans)',
                      padding: 0,
                    }}
                  >
                    {f.label}
                    <span style={{ color: 'var(--text3)', fontSize: 11 }}>
                      {' '}
                      · {f.field_type} · {f.field_key}
                    </span>
                  </button>
                  {!f.archived_at ? (
                    <>
                      <button
                        type="button"
                        style={rowBtn}
                        onClick={() => {
                          const label = window.prompt('Rename field', f.label);
                          if (label?.trim()) renameField.mutate({ id: f.id, label: label.trim() });
                        }}
                      >
                        Rename
                      </button>
                      <button type="button" style={rowBtn} onClick={() => archiveField.mutate(f.id)}>
                        Archive
                      </button>
                    </>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>archived</span>
                  )}
                </li>
              );
            })}
          </ul>
          {!fieldsQ.isLoading && fields.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>No fields yet.</p>
          ) : null}
        </div>

        <div style={panelStyle}>
          <h2 style={sectionTitleStyle}>Options</h2>
          {!selectedField ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>Select a select field to manage options.</p>
          ) : !selectField ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>
              {selectedField.label} is not a select type.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <input
                  placeholder="New option label"
                  value={optionLabel}
                  onChange={(e) => setOptionLabel(e.target.value)}
                  style={{ ...fieldStyle, flex: '1 1 140px' }}
                />
                <PrimaryButton
                  type="button"
                  disabled={createOption.isPending || !optionLabel.trim()}
                  onClick={() => createOption.mutate()}
                >
                  Add
                </PrimaryButton>
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {options.map((o, i) => (
                  <li
                    key={o.id}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 6,
                      alignItems: 'center',
                      padding: '8px 0',
                      borderBottom: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
                      opacity: o.archived_at ? 0.55 : 1,
                    }}
                  >
                    <span style={{ flex: '1 1 120px', fontSize: 13, color: 'var(--text)' }}>
                      {o.label}
                      <span style={{ color: 'var(--text3)', fontSize: 11 }}> · {o.option_value}</span>
                    </span>
                    {!o.archived_at ? (
                      <>
                        <button type="button" style={rowBtn} disabled={i === 0} onClick={() => moveOption(o.id, -1)}>
                          ↑
                        </button>
                        <button
                          type="button"
                          style={rowBtn}
                          disabled={i === options.length - 1}
                          onClick={() => moveOption(o.id, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          style={rowBtn}
                          onClick={() => {
                            const label = window.prompt('Rename option', o.label);
                            if (label?.trim()) renameOption.mutate({ id: o.id, label: label.trim() });
                          }}
                        >
                          Rename
                        </button>
                        <button type="button" style={rowBtn} onClick={() => archiveOption.mutate(o.id)}>
                          Archive
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>archived</span>
                    )}
                  </li>
                ))}
              </ul>
              {!optionsQ.isLoading && options.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>No options yet.</p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
