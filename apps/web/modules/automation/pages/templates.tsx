'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { Input, Select } from '@/modules/shared/components/ui/FormField';
import { AUTOMATION_TEMPLATES, getTemplate } from '../lib/templates';
import { toEngineGraph } from '../lib/client-graph';
import { automationApi } from '../lib/api';
import {
  AutomationShell,
  Button,
  EmptyState,
  ErrorBlock,
  helperStyle,
  panelStyle,
} from '../components/ui';

export default function TemplatesPage() {
  return (
    <ModuleGuard moduleId="automation">
      <Topbar />
      <TemplatesInner />
    </ModuleGuard>
  );
}

function TemplatesInner() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const categories = useMemo(
    () => Array.from(new Set(AUTOMATION_TEMPLATES.map((t) => t.category))),
    [],
  );
  const rows = useMemo(() => {
    return AUTOMATION_TEMPLATES.filter((t) => {
      if (cat !== 'all' && t.category !== cat) return false;
      if (!q.trim()) return true;
      const n = q.toLowerCase();
      return t.name.toLowerCase().includes(n) || t.outcome.toLowerCase().includes(n);
    });
  }, [q, cat]);

  return (
    <AutomationShell
      title="Templates"
      subtitle="Start from a proven outcome. Installation always creates a draft — never turns on automatically."
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: '1 1 200px' }}>
          <Input placeholder="Search templates…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: 180 }}>
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No templates match" description="Try another search or category." />
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {rows.map((t) => (
            <div key={t.id} style={{ ...panelStyle, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>{t.category}</div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 650 }}>{t.name}</h2>
              <p style={{ ...helperStyle, margin: 0, flex: 1 }}>{t.outcome}</p>
              <p style={{ ...helperStyle, margin: 0, fontSize: 12 }}>{t.riskSummary}</p>
              <Link href={`/automation/templates/${t.id}/install`}>
                <Button variant="primary">Preview & install</Button>
              </Link>
            </div>
          ))}
        </div>
      )}
    </AutomationShell>
  );
}

export function TemplateInstallPage({ templateId }: { templateId: string }) {
  return (
    <ModuleGuard moduleId="automation">
      <Topbar />
      <InstallInner templateId={templateId} />
    </ModuleGuard>
  );
}

function InstallInner({ templateId }: { templateId: string }) {
  const tpl = getTemplate(templateId);
  const getToken = useApiToken();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('automation:workflows:edit');

  const install = useMutation({
    mutationFn: async () => {
      if (!tpl) throw new Error('Template not found');
      const graph = toEngineGraph(tpl.buildGraph());
      return automationApi.createWorkflow(await getToken(), {
        name: tpl.name,
        description: tpl.outcome,
        graph,
      });
    },
    onSuccess: (wf) => router.push(`/automation/workflows/${wf.id}/edit`),
  });

  if (!tpl) {
    return (
      <AutomationShell title="Template">
        <ErrorBlock message="This template was not found." />
      </AutomationShell>
    );
  }

  return (
    <AutomationShell
      title={tpl.name}
      subtitle={tpl.outcome}
      actions={
        canEdit ? (
          <Button variant="primary" disabled={install.isPending} onClick={() => install.mutate()}>
            Install as draft
          </Button>
        ) : null
      }
    >
      <div style={panelStyle}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 650 }}>What ThinkAIQ will do</h2>
        <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--text)', fontSize: 14, lineHeight: 1.6 }}>
          {tpl.explanation.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
        <p style={{ ...helperStyle, marginTop: 14 }}>
          <strong>Risk:</strong> {tpl.riskSummary}
        </p>
        <p style={helperStyle}>
          Installing creates a <strong>draft</strong> only. You must review and Publish before it runs. Publishing does
          not authorize Class B actions — those still need “Authorize this action”.
        </p>
        {install.error ? <ErrorBlock message={(install.error as Error).message} /> : null}
      </div>
    </AutomationShell>
  );
}
