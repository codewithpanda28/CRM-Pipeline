'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { FormField, Input, Select, Textarea } from '@/modules/shared/components/ui/FormField';
import {
  AutomationShell,
  Button,
  ErrorBlock,
  LoadingBlock,
  RiskBadge,
  helperStyle,
  panelStyle,
  riskBadgeStyle,
} from '../components/ui';
import { automationApi } from '../lib/api';
import {
  type ClientGraph,
  type ClientKind,
  type ClientNode,
  actionRisk,
  appendLinear,
  emptyClientGraph,
  fromEngineGraph,
  newId,
  toEngineGraph,
  validateClientGraph,
} from '../lib/client-graph';

const EVENTS = [
  { value: 'crm.lead.created', label: 'New Lead Created' },
  { value: 'crm.deal.won', label: 'Deal Won' },
  { value: 'crm.deal.stage_changed', label: 'Deal Stage Changed' },
  { value: 'crm.quote.accepted', label: 'Quote Accepted' },
  { value: 'finance.invoice.overdue', label: 'Invoice Overdue' },
];

const ACTIONS = [
  { value: 'task.create', label: 'Create Follow-up Task', risk: 'A' as const },
  { value: 'notification.internal', label: 'Notify Staff', risk: 'A' as const },
  { value: 'critical.stub', label: 'Customer Message / Critical Action', risk: 'B' as const },
  { value: 'data.purge', label: 'Delete Customer Data', risk: 'C' as const },
];

export default function WorkflowBuilderPage({ workflowId }: { workflowId?: string }) {
  return (
    <ModuleGuard moduleId="automation">
      <Topbar />
      <BuilderInner workflowId={workflowId} />
    </ModuleGuard>
  );
}

function BuilderInner({ workflowId }: { workflowId?: string }) {
  const isNew = !workflowId || workflowId === 'new';
  const getToken = useApiToken();
  const router = useRouter();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('automation:workflows:edit');
  const canPublish = hasPermission('automation:workflows:publish');

  const [name, setName] = useState('New Automation');
  const [graph, setGraph] = useState<ClientGraph>(emptyClientGraph());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [id, setId] = useState<string | null>(isNew ? null : workflowId!);
  const [versionLabel, setVersionLabel] = useState('Draft');
  const [history, setHistory] = useState<ClientGraph[]>([emptyClientGraph()]);
  const [histIdx, setHistIdx] = useState(0);
  const skipHist = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const existing = useQuery({
    queryKey: ['automation', 'workflow', workflowId],
    queryFn: async () => automationApi.getWorkflow(await getToken(), workflowId!),
    enabled: !isNew && !!workflowId,
  });

  useEffect(() => {
    if (!existing.data) return;
    setName(existing.data.name);
    const cg = fromEngineGraph(existing.data.draft_graph ?? undefined);
    setGraph(cg);
    setHistory([cg]);
    setHistIdx(0);
    setId(existing.data.id);
    const d = existing.data.draft_version_number;
    const p = existing.data.published_version_number;
    setVersionLabel(p != null ? `Published v${p}${d != null ? ` · Draft v${d}` : ''}` : d != null ? `Draft v${d}` : 'Draft');
  }, [existing.data]);

  const pushGraph = useCallback((next: ClientGraph) => {
    setGraph(next);
    if (skipHist.current) {
      skipHist.current = false;
      return;
    }
    setHistory((h) => {
      const sliced = h.slice(0, histIdx + 1);
      sliced.push(next);
      return sliced.slice(-40);
    });
    setHistIdx((i) => Math.min(i + 1, 39));
  }, [histIdx]);

  const undo = () => {
    if (histIdx <= 0) return;
    skipHist.current = true;
    const nextIdx = histIdx - 1;
    setHistIdx(nextIdx);
    setGraph(history[nextIdx]!);
  };
  const redo = () => {
    if (histIdx >= history.length - 1) return;
    skipHist.current = true;
    const nextIdx = histIdx + 1;
    setHistIdx(nextIdx);
    setGraph(history[nextIdx]!);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return automationApi.createWorkflow(token, {
        name,
        graph: toEngineGraph(graph),
      });
    },
    onSuccess: (wf) => {
      setId(wf.id);
      setSaveState('saved');
      router.replace(`/automation/workflows/${wf.id}/edit`);
      qc.invalidateQueries({ queryKey: ['automation', 'workflows'] });
    },
  });

  const saveDraft = useCallback(async () => {
    if (!canEdit) return;
    setSaveState('saving');
    try {
      const token = await getToken();
      if (!id) {
        const wf = await automationApi.createWorkflow(token, { name, graph: toEngineGraph(graph) });
        setId(wf.id);
        router.replace(`/automation/workflows/${wf.id}/edit`);
      } else {
        await automationApi.updateDraft(token, id, toEngineGraph(graph));
      }
      setSaveState('saved');
      qc.invalidateQueries({ queryKey: ['automation', 'workflows'] });
    } catch {
      setSaveState('error');
    }
  }, [canEdit, getToken, graph, id, name, qc, router]);

  useEffect(() => {
    if (!canEdit || !id) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void saveDraft();
    }, 1200);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [graph, name, canEdit, id, saveDraft]);

  const publishMut = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      let wid = id;
      if (!wid) {
        const wf = await automationApi.createWorkflow(token, { name, graph: toEngineGraph(graph) });
        wid = wf.id;
        setId(wid);
      } else {
        await automationApi.updateDraft(token, wid, toEngineGraph(graph));
      }
      return automationApi.publish(token, wid);
    },
    onSuccess: (wf) => {
      setVersionLabel(`Published`);
      qc.invalidateQueries({ queryKey: ['automation', 'workflows'] });
      router.push(`/automation/workflows/${wf.id}/edit`);
    },
  });

  const issues = useMemo(() => validateClientGraph(graph), [graph]);
  const canPublishNow = issues.length === 0 && canPublish && canEdit;

  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null;

  const addNode = (kind: ClientKind) => {
    if (kind === 'WHEN' && graph.nodes.some((n) => n.kind === 'WHEN')) return;
    const node = defaultNode(kind);
    if (kind === 'WHEN' && graph.nodes.length === 0) {
      pushGraph({ nodes: [node], edges: [] });
    } else {
      pushGraph(appendLinear(graph, node));
    }
    setSelectedId(node.id);
  };

  const updateNode = (nodeId: string, patch: Partial<ClientNode>) => {
    pushGraph({
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch, config: { ...n.config, ...(patch.config ?? {}) } } : n)),
    });
  };

  const deleteNode = (nodeId: string) => {
    const nodes = graph.nodes.filter((n) => n.id !== nodeId);
    const edges = graph.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
    // reconnect linear gap
    const idx = graph.nodes.findIndex((n) => n.id === nodeId);
    if (idx > 0 && idx < graph.nodes.length - 1) {
      const prev = graph.nodes[idx - 1]!;
      const next = graph.nodes[idx + 1]!;
      if (!edges.some((e) => e.from === prev.id && e.to === next.id)) {
        edges.push({ from: prev.id, to: next.id });
      }
    }
    pushGraph({ nodes, edges });
    if (selectedId === nodeId) setSelectedId(null);
  };

  if (!isNew && existing.isLoading) {
    return (
      <AutomationShell title="Edit Automation">
        <LoadingBlock />
      </AutomationShell>
    );
  }
  if (!isNew && existing.error) {
    return (
      <AutomationShell title="Edit Automation">
        <ErrorBlock message={(existing.error as Error).message} />
      </AutomationShell>
    );
  }

  return (
    <AutomationShell
      title={isNew ? 'Create Automation' : 'Edit Automation'}
      subtitle="WHEN → IF → THEN → WAIT → APPROVAL — tell ThinkAIQ what to do in plain steps."
      actions={
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : versionLabel}
          </span>
          <Button variant="ghost" onClick={undo} disabled={histIdx <= 0}>
            Undo
          </Button>
          <Button variant="ghost" onClick={redo} disabled={histIdx >= history.length - 1}>
            Redo
          </Button>
          {canEdit ? (
            <Button variant="secondary" onClick={() => void saveDraft()} disabled={saveState === 'saving'}>
              Save draft
            </Button>
          ) : null}
          {canPublish ? (
            <Button
              variant="primary"
              disabled={!canPublishNow || publishMut.isPending}
              onClick={() => publishMut.mutate()}
              aria-label={issues[0]?.message ?? 'Publish'}
            >
              Publish
            </Button>
          ) : null}
        </div>
      }
    >
      <FormField label="Automation name">
        <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} placeholder="New Lead Follow-up" />
      </FormField>

      {issues.length > 0 ? (
        <div
          style={{
            ...panelStyle,
            marginBottom: 14,
            borderColor: 'color-mix(in srgb, #c97816 40%, var(--border))',
          }}
        >
          <div style={{ fontWeight: 650, marginBottom: 8 }}>Before you can publish</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text2)', fontSize: 13 }}>
            {issues.map((i, idx) => (
              <li key={idx}>{i.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 340px)',
          gap: 16,
          alignItems: 'start',
        }}
        className="automation-builder-grid"
      >
        <style>{`
          @media (max-width: 768px) {
            .automation-builder-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>

        <div style={panelStyle}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {(['WHEN', 'IF', 'THEN', 'WAIT', 'ELSE', 'APPROVAL'] as ClientKind[]).map((k) => (
              <Button
                key={k}
                variant="secondary"
                disabled={!canEdit || (k === 'WHEN' && graph.nodes.some((n) => n.kind === 'WHEN'))}
                onClick={() => addNode(k)}
              >
                + {k}
              </Button>
            ))}
          </div>

          {graph.nodes.length === 0 ? (
            <p style={helperStyle}>Add a WHEN step to choose what starts this automation.</p>
          ) : (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
              {graph.nodes.map((n, i) => {
                const risk =
                  n.kind === 'THEN' || n.kind === 'APPROVAL'
                    ? actionRisk(String(n.config['action_type'] ?? 'task.create'))
                    : null;
                return (
                  <li key={n.id}>
                    {i > 0 ? (
                      <div style={{ height: 12, marginLeft: 18, borderLeft: '2px solid var(--border)' }} />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setSelectedId(n.id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        border:
                          selectedId === n.id
                            ? '1px solid color-mix(in srgb, var(--accent) 50%, var(--border))'
                            : '1px solid var(--border)',
                        background: selectedId === n.id ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'var(--surface2)',
                        borderRadius: 12,
                        padding: '12px 14px',
                        cursor: 'pointer',
                        color: 'var(--text)',
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text2)' }}>
                        {n.kind}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 650, marginTop: 2 }}>{n.title}</div>
                      {n.subtitle || risk ? (
                        <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {risk ? <RiskBadge risk={risk} /> : null}
                          {!risk && n.subtitle ? (
                            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{n.subtitle}</span>
                          ) : null}
                        </div>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div style={panelStyle}>
          <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 650 }}>Step settings</h2>
          {!selected ? (
            <p style={helperStyle}>Select a step to configure it. No JSON — just forms.</p>
          ) : (
            <NodeEditor
              node={selected}
              disabled={!canEdit}
              onChange={(patch) => updateNode(selected.id, patch)}
              onDelete={() => deleteNode(selected.id)}
            />
          )}
        </div>
      </div>

      {createMut.error || publishMut.error ? (
        <div style={{ marginTop: 12 }}>
          <ErrorBlock message={((createMut.error || publishMut.error) as Error).message} />
        </div>
      ) : null}
    </AutomationShell>
  );
}

function defaultNode(kind: ClientKind): ClientNode {
  const id = newId(kind.toLowerCase());
  if (kind === 'WHEN') {
    return {
      id,
      kind,
      title: 'New Lead Created',
      subtitle: 'Starts this automation',
      config: { event_name: 'crm.lead.created' },
    };
  }
  if (kind === 'IF') {
    return {
      id,
      kind,
      title: 'Lead not contacted',
      subtitle: 'Check a condition',
      config: { path: 'payload.status', op: 'neq', value: 'contacted' },
    };
  }
  if (kind === 'WAIT') {
    return {
      id,
      kind,
      title: '1 hour',
      subtitle: 'Pause before continuing',
      config: { amount: 1, unit: 'hours' },
    };
  }
  if (kind === 'ELSE') {
    return { id, kind, title: 'Otherwise', subtitle: 'Alternate path', config: {} };
  }
  if (kind === 'APPROVAL') {
    return {
      id,
      kind,
      title: 'Authorize critical action',
      subtitle: 'Needs your approval',
      config: { action_type: 'critical.stub', params: {}, expires_in_seconds: 86400 },
    };
  }
  return {
    id,
    kind: 'THEN',
    title: 'Create Follow-up Task',
    subtitle: 'Runs automatically',
    config: { action_type: 'task.create', params: { title: 'Follow up' } },
  };
}

function NodeEditor({
  node,
  disabled,
  onChange,
  onDelete,
}: {
  node: ClientNode;
  disabled: boolean;
  onChange: (patch: Partial<ClientNode>) => void;
  onDelete: () => void;
}) {
  const [more, setMore] = useState(false);
  const params = (node.config['params'] as Record<string, unknown>) ?? {};

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <FormField label="Title">
        <Input
          value={node.title}
          disabled={disabled}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </FormField>

      {node.kind === 'WHEN' ? (
        <FormField label="When this happens">
          <Select
            disabled={disabled}
            value={String(node.config['event_name'] ?? '')}
            onChange={(e) => {
              const ev = EVENTS.find((x) => x.value === e.target.value);
              onChange({
                title: ev?.label ?? e.target.value,
                config: { ...node.config, event_name: e.target.value },
              });
            }}
          >
            {EVENTS.map((ev) => (
              <option key={ev.value} value={ev.value}>
                {ev.label}
              </option>
            ))}
          </Select>
        </FormField>
      ) : null}

      {node.kind === 'IF' ? (
        <>
          <FormField label="Field">
            <Select
              disabled={disabled}
              value={String(node.config['path'] ?? 'payload.status')}
              onChange={(e) => onChange({ config: { ...node.config, path: e.target.value } })}
            >
              <option value="payload.status">Status</option>
              <option value="payload.amount">Amount</option>
              <option value="payload.owner_id">Owner</option>
            </Select>
          </FormField>
          <FormField label="Operator">
            <Select
              disabled={disabled}
              value={String(node.config['op'] ?? 'eq')}
              onChange={(e) => onChange({ config: { ...node.config, op: e.target.value } })}
            >
              <option value="eq">Equals</option>
              <option value="neq">Does not equal</option>
              <option value="gt">Greater than</option>
              <option value="lt">Less than</option>
            </Select>
          </FormField>
          <FormField label="Value">
            <Input
              disabled={disabled}
              value={String(node.config['value'] ?? '')}
              onChange={(e) => onChange({ config: { ...node.config, value: e.target.value } })}
            />
          </FormField>
          <p style={helperStyle}>True / false branches connect from this step in the flow order.</p>
        </>
      ) : null}

      {node.kind === 'WAIT' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <FormField label="Wait">
            <Input
              type="number"
              min={1}
              disabled={disabled}
              value={Number(node.config['amount'] ?? 1)}
              onChange={(e) => {
                const amount = Number(e.target.value);
                const unit = String(node.config['unit'] ?? 'hours');
                onChange({
                  title: `${amount} ${unit}`,
                  config: { ...node.config, amount },
                });
              }}
            />
          </FormField>
          <FormField label="Unit">
            <Select
              disabled={disabled}
              value={String(node.config['unit'] ?? 'hours')}
              onChange={(e) => {
                const unit = e.target.value;
                const amount = Number(node.config['amount'] ?? 1);
                onChange({
                  title: `${amount} ${unit}`,
                  config: { ...node.config, unit },
                });
              }}
            >
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </Select>
          </FormField>
        </div>
      ) : null}

      {node.kind === 'THEN' || node.kind === 'APPROVAL' ? (
        <>
          <FormField label="Action">
            <Select
              disabled={disabled}
              value={String(node.config['action_type'] ?? 'task.create')}
              onChange={(e) => {
                const a = ACTIONS.find((x) => x.value === e.target.value);
                if (a?.risk === 'C') {
                  onChange({
                    title: a.label,
                    subtitle: 'Not available',
                    config: { ...node.config, action_type: e.target.value },
                  });
                  return;
                }
                onChange({
                  title: a?.label ?? e.target.value,
                  subtitle: a?.risk === 'B' ? 'Needs your approval' : 'Runs automatically',
                  kind: a?.risk === 'B' ? 'APPROVAL' : node.kind === 'APPROVAL' && a?.risk === 'A' ? 'THEN' : node.kind,
                  config: { ...node.config, action_type: e.target.value },
                });
              }}
            >
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value} disabled={a.risk === 'C'}>
                  {a.label}
                  {a.risk === 'C' ? ' (not available)' : ''}
                </option>
              ))}
            </Select>
          </FormField>
          <div>
            <RiskBadge risk={actionRisk(String(node.config['action_type'] ?? 'task.create'))} />
          </div>
          {String(node.config['action_type']) === 'task.create' ? (
            <FormField label="Task title">
              <Input
                disabled={disabled}
                value={String(params['title'] ?? '')}
                onChange={(e) =>
                  onChange({
                    config: { ...node.config, params: { ...params, title: e.target.value } },
                  })
                }
              />
            </FormField>
          ) : null}
          {String(node.config['action_type']) === 'notification.internal' ? (
            <>
              <FormField label="Notification title">
                <Input
                  disabled={disabled}
                  value={String(params['title'] ?? '')}
                  onChange={(e) =>
                    onChange({
                      config: { ...node.config, params: { ...params, title: e.target.value } },
                    })
                  }
                />
              </FormField>
              <FormField label="Message">
                <Textarea
                  disabled={disabled}
                  value={String(params['body'] ?? '')}
                  onChange={(e) =>
                    onChange({
                      config: { ...node.config, params: { ...params, body: e.target.value } },
                    })
                  }
                />
              </FormField>
            </>
          ) : null}
          {actionRisk(String(node.config['action_type'] ?? '')) === 'B' ? (
            <div style={{ ...riskBadgeStyle('B'), display: 'block', padding: 10 }}>
              This step needs your approval before it runs. Publishing does not authorize the action.
            </div>
          ) : null}
        </>
      ) : null}

      <button
        type="button"
        onClick={() => setMore((m) => !m)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text2)',
          fontSize: 13,
          textAlign: 'left',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {more ? 'Hide more options' : 'More options'}
      </button>
      {more ? (
        <FormField label="Notes (internal)">
          <Textarea
            disabled={disabled}
            value={String(node.config['notes'] ?? '')}
            onChange={(e) => onChange({ config: { ...node.config, notes: e.target.value } })}
          />
        </FormField>
      ) : null}

      {!disabled ? (
        <Button variant="danger" onClick={onDelete}>
          Delete step
        </Button>
      ) : null}
    </div>
  );
}
