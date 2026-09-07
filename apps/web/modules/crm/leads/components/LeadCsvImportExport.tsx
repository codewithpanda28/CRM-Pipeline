'use client';

import { useRef, useState } from 'react';
import { Button } from '@/modules/shared/components/ui/Button';
import { useAlert } from '@/modules/shared/components/ui/ConfirmDialog';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { parseCSV, downloadCSV } from '@/modules/shared/lib/csv';

const TEMPLATE_HEADERS = [
  'name',
  'first_name',
  'last_name',
  'email',
  'phone',
  'alternate_phone',
  'company_name',
  'website',
  'source',
  'status',
  'rating',
  'owner_id',
  'notes',
];

type PreviewRow = {
  index: number;
  status: 'ok' | 'error' | 'duplicate_warn';
  errors?: string[];
  duplicate_refs?: Array<{ kind: string; id: string; label?: string }>;
  email_open_lead_duplicate?: boolean;
};

type PreviewData = {
  total: number;
  valid: number;
  invalid: number;
  duplicate_warnings: number;
  rows: PreviewRow[];
};

type CommitSummary = {
  created: number;
  skipped: number;
  duplicate: number;
  failed: number;
  errors: string[];
};

interface Props {
  exportParams?: Record<string, string>;
  onImported?: () => void;
}

export function LeadCsvImportExport({ exportParams = {}, onImported }: Props) {
  const getToken = useApiToken();
  const { show: showAlert, el: alertEl } = useAlert();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const token = await getToken();
      const qs = new URLSearchParams(exportParams).toString();
      const url = `${process.env['NEXT_PUBLIC_API_URL'] ?? ''}/api/leads/export${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        showAlert(body?.error?.message ?? 'Export failed', {
          variant: 'error',
          title: 'Export failed',
        });
        return;
      }
      const text = await res.text();
      downloadCSV('leads.csv', text);
    } finally {
      setExporting(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showAlert('File too large. Maximum CSV size is 5 MB.', {
        variant: 'error',
        title: 'File too large',
      });
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        showAlert('No rows found in the CSV file.', { variant: 'error', title: 'Empty file' });
        return;
      }
      if (parsed.length > 1000) {
        showAlert('Maximum 1000 rows per import.', { variant: 'error', title: 'Too many rows' });
        return;
      }
      const token = await getToken();
      const res = await apiFetch<{ data: PreviewData; error: null }>('/api/leads/import/preview', {
        method: 'POST',
        body: JSON.stringify({ rows: parsed }),
        token,
      });
      setRows(parsed);
      setPreview(res.data);
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Preview failed', {
        variant: 'error',
        title: 'Import preview failed',
      });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function commitImport() {
    if (!rows) return;
    setBusy(true);
    try {
      const token = await getToken();
      const res = await apiFetch<{ data: CommitSummary; error: null }>('/api/leads/import/commit', {
        method: 'POST',
        body: JSON.stringify({
          rows,
          options: { skip_email_duplicates: true },
        }),
        token,
      });
      const s = res.data;
      showAlert(
        `Created ${s.created}. Skipped ${s.skipped} (duplicates ${s.duplicate}). Failed ${s.failed}.`,
        {
          title: 'Import complete',
          variant: s.failed > 0 ? 'error' : 'success',
        },
      );
      setRows(null);
      setPreview(null);
      onImported?.();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Commit failed', {
        variant: 'error',
        title: 'Import failed',
      });
    } finally {
      setBusy(false);
    }
  }

  function downloadErrorRows() {
    if (!preview) return;
    const bad = preview.rows.filter((r) => r.status === 'error' || r.status === 'duplicate_warn');
    const lines = ['index,status,detail'];
    for (const r of bad) {
      const detail =
        r.errors?.join('; ') ??
        r.duplicate_refs?.map((d) => `${d.kind}:${d.id}`).join('; ') ??
        '';
      lines.push(`${r.index},${r.status},"${detail.replace(/"/g, '""')}"`);
    }
    downloadCSV('lead-import-issues.csv', lines.join('\n'));
  }

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {alertEl}
      <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFile} />
      <Button onClick={() => downloadCSV('leads-template.csv', TEMPLATE_HEADERS.join(',') + '\n')}>
        Template
      </Button>
      <Button onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy ? 'Working…' : 'Import CSV'}
      </Button>
      <Button onClick={handleExport} disabled={exporting}>
        {exporting ? 'Exporting…' : 'Export CSV'}
      </Button>

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              width: 'min(720px, 96vw)',
              maxHeight: '80vh',
              overflow: 'auto',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Import preview</h2>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text2)' }}>
              {preview.total} rows · {preview.valid} valid · {preview.invalid} invalid ·{' '}
              {preview.duplicate_warnings} duplicate warnings. Open-lead email matches are skipped on
              commit (no overwrite).
            </p>
            <div style={{ maxHeight: 320, overflow: 'auto', marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 6 }}>#</th>
                    <th style={{ textAlign: 'left', padding: 6 }}>Status</th>
                    <th style={{ textAlign: 'left', padding: 6 }}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 100).map((r) => (
                    <tr key={r.index} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 6 }}>{r.index}</td>
                      <td style={{ padding: 6 }}>{r.status}</td>
                      <td style={{ padding: 6 }}>
                        {r.errors?.join('; ') ||
                          r.duplicate_refs?.map((d) => `${d.kind} ${d.label ?? d.id}`).join(', ') ||
                          '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="primary" disabled={busy || preview.valid === 0} onClick={commitImport}>
                Confirm import
              </Button>
              <Button onClick={downloadErrorRows}>Download issues</Button>
              <Button
                onClick={() => {
                  setPreview(null);
                  setRows(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
