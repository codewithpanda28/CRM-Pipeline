'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/modules/shared/components/ui/Button';
import { Input, Select } from '@/modules/shared/components/ui/FormField';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { LeadCsvImportExport } from './LeadCsvImportExport';
import {
  bulkLeads,
  convertLead,
  createLead,
  listLeads,
  updateLead,
  type Lead,
} from '../lib/leads';
import { listPipelines, type Pipeline } from '@/modules/crm/pipeline/lib/pipelines';
import { DealCreateModal } from '@/modules/crm/pipeline/components/shared/DealCreateModal';
import { defaultOpenStageId } from '@/modules/crm/pipeline/lib/deal-create-form';
import { PRIORITY_BG, PRIORITY_COLOR } from '@/modules/crm/tasks/lib/types';

const STATUSES = ['new', 'contacted', 'qualified', 'unqualified', 'lost', 'abandoned', 'converted'] as const;
const BULK_STATUSES = ['new', 'contacted', 'qualified', 'unqualified', 'lost', 'abandoned'] as const;

const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  converted: 'Converted',
  unqualified: 'Unqualified',
  lost: 'Lost',
  abandoned: 'Abandoned',
};

function chipStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    color: 'var(--text2)',
    background: 'var(--surface2, var(--surface))',
    fontFamily: 'var(--font-sans)',
    ...extra,
  };
}

function fieldLabel(text: string) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 650,
        letterSpacing: 0.55,
        textTransform: 'uppercase',
        color: 'var(--text3)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {text}
    </span>
  );
}

function PriorityChip({ priority }: { priority?: string | null }) {
  const p = (priority ?? 'NONE').toUpperCase();
  if (p === 'NONE' || !p) return null;
  const key = p as keyof typeof PRIORITY_COLOR;
  return (
    <span
      style={chipStyle({
        color: PRIORITY_COLOR[key] ?? 'var(--text3)',
        background: PRIORITY_BG[key] ?? 'transparent',
        borderColor: 'transparent',
      })}
    >
      {p}
    </span>
  );
}

function nextTaskLabel(lead: Lead): string | null {
  const n = lead.next_task;
  const title = n?.title?.trim();
  if (!title) return null;
  const dueRaw = n?.due_at ?? n?.due;
  const due = dueRaw
    ? new Date(dueRaw).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;
  return due ? `${title} · ${due}` : title;
}

function linkedDeal(lead: Lead) {
  return lead.deal ?? (lead.deal_id ? { id: lead.deal_id, name: 'Deal', stage_name: null } : null);
}

export function LeadsBoard() {
  const router = useRouter();
  const getToken = useApiToken();
  const { user, hasPermission } = useAuth();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [convertId, setConvertId] = useState<string | null>(null);
  const [alsoCreateDeal, setAlsoCreateDeal] = useState(false);
  const [convertPipelineId, setConvertPipelineId] = useState('');
  const [convertStageId, setConvertStageId] = useState('');
  const [createDealLead, setCreateDealLead] = useState<Lead | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', company_name: '', source: '' });
  const [dupes, setDupes] = useState<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>('contacted');
  const canCreateDeal = hasPermission('deals:create');
  const canConvert = hasPermission('leads:convert');

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (statusFilter) p.status = statusFilter;
    return p;
  }, [statusFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ['leads', params],
    queryFn: async () => listLeads(await getToken(), params),
    enabled: Boolean(user),
  });

  const needPipelines = alsoCreateDeal || Boolean(createDealLead);
  const { data: pipelines = [] } = useQuery({
    queryKey: ['pipelines', 'lead-convert'],
    queryFn: async () => listPipelines(await getToken()),
    enabled: Boolean(user) && needPipelines,
  });

  const convertPipeline: Pipeline | undefined =
    pipelines.find((p) => p.id === convertPipelineId) ??
    pipelines.find((p) => p.is_default) ??
    pipelines[0];

  const dealPipeline: Pipeline | undefined =
    pipelines.find((p) => p.is_default) ?? pipelines[0];

  const convertStages = convertPipeline?.stages ?? [];
  const openConvertStage =
    convertStages.find((s) => s.id === convertStageId) ??
    convertStages.find((s) => !s.is_won && !s.is_lost) ??
    convertStages[0];

  const leads = data?.data ?? [];

  const createMut = useMutation({
    mutationFn: async () =>
      createLead(await getToken(), {
        name: form.name || undefined,
        email: form.email || null,
        phone: form.phone || null,
        company_name: form.company_name || null,
        source: form.source || null,
        owner_id: user!.id,
      }),
    onSuccess: (res) => {
      setDupes(res.meta?.duplicates ?? []);
      setShowCreate(false);
      setForm({ name: '', email: '', phone: '', company_name: '', source: '' });
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const convertMut = useMutation({
    mutationFn: async (id: string) => {
      const lead = leads.find((l) => l.id === id);
      const body: Record<string, unknown> = {
        create_company: true,
        create_customer_party: true,
        create_deal: false,
      };
      if (alsoCreateDeal && canCreateDeal && convertPipeline && openConvertStage) {
        body.create_deal = true;
        body.deal = {
          pipeline_id: convertPipeline.id,
          stage_id: openConvertStage.id,
          name: lead?.name,
          owner_id: lead?.owner_id ?? user?.id,
        };
      }
      return convertLead(await getToken(), id, body);
    },
    onSuccess: () => {
      setConvertId(null);
      setAlsoCreateDeal(false);
      void qc.invalidateQueries({ queryKey: ['leads', params] });
      if (alsoCreateDeal && convertPipeline) {
        void qc.invalidateQueries({ queryKey: ['items', convertPipeline.id] });
      }
    },
    onError: (e: Error) => setError(e.message),
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      updateLead(await getToken(), id, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['leads'] });
      const previous = qc.getQueriesData<{ data: Array<{ id: string; status?: string }> }>({
        queryKey: ['leads'],
      });
      qc.setQueriesData<{ data: Array<{ id: string; status?: string }> }>({ queryKey: ['leads'] }, (old) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((l) => (l.id === id ? { ...l, status } : l)),
        };
      });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) {
        for (const [key, data] of ctx.previous) qc.setQueryData(key, data);
      }
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['leads', params] }),
  });

  const bulkMut = useMutation({
    mutationFn: async (body: {
      action: 'assign' | 'status' | 'delete';
      ids: string[];
      owner_id?: string;
      status?: string;
    }) => bulkLeads(await getToken(), body),
    onSuccess: () => {
      setSelected(new Set());
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === leads.length) setSelected(new Set());
    else setSelected(new Set(leads.map((l) => l.id)));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, width: '100%' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Select
          aria-label="Filter by lead status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ width: 'auto', minWidth: 160 }}
        >
          <option value="">All lead statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s] ?? s}
            </option>
          ))}
        </Select>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <LeadCsvImportExport
            exportParams={params}
            onImported={() => void qc.invalidateQueries({ queryKey: ['leads'] })}
          />
          <Button
            variant="primary"
            onClick={() => {
              setError(null);
              setShowCreate(true);
            }}
          >
            + New Lead
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--red)', margin: 0, fontSize: 13 }}>
          {error}
        </p>
      )}

      {Array.isArray(dupes) && dupes.length > 0 && (
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          Possible duplicates detected on last create — review before convert.
        </div>
      )}

      {showCreate && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            createMut.mutate();
          }}
          style={{
            display: 'grid',
            gap: 10,
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            padding: 14,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface)',
            minWidth: 0,
            alignItems: 'end',
          }}
        >
          <Input
            required
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            style={{ minWidth: 0 }}
          />
          <Input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            style={{ minWidth: 0 }}
          />
          <Input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            style={{ minWidth: 0 }}
          />
          <Input
            placeholder="Company"
            value={form.company_name}
            onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
            style={{ minWidth: 0 }}
          />
          <Input
            placeholder="Source"
            value={form.source}
            onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
            style={{ minWidth: 0 }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button type="submit" variant="primary" disabled={createMut.isPending}>
              {createMut.isPending ? 'Creating…' : 'Create'}
            </Button>
            <Button type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>Loading leads…</p>
      ) : leads.length === 0 ? (
        <p style={{ color: 'var(--text3)', fontSize: 13, margin: 0 }}>
          No leads yet. Create one to start qualification.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minWidth: 0,
          }}
        >
          <li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text3)' }}>
            <input
              type="checkbox"
              checked={selected.size === leads.length && leads.length > 0}
              onChange={toggleAll}
              aria-label="Select all leads"
            />
            Select all
          </li>
          {leads.map((lead: Lead) => {
            const next = nextTaskLabel(lead);
            const deal = linkedDeal(lead);
            const stageName = lead.pipeline_stage?.name ?? lead.deal?.stage_name ?? null;
            const stageColor = lead.pipeline_stage?.color ?? lead.deal?.stage_color ?? null;
            const convertedNoDeal = lead.status === 'converted' && !deal;

            return (
              <li
                key={lead.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/crm/records/lead:${lead.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    router.push(`/crm/records/lead:${lead.id}`);
                  }
                }}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: 14,
                  background: 'var(--surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  minWidth: 0,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
                  <label
                    style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggleSelect(lead.id)}
                      aria-label={`Select ${lead.name}`}
                    />
                    <strong style={{ wordBreak: 'break-word', color: 'var(--text)' }}>{lead.name}</strong>
                  </label>
                </div>

                <div style={{ fontSize: 13, color: 'var(--text2)', wordBreak: 'break-word' }}>
                  {[lead.email, lead.phone, lead.company_name].filter(Boolean).join(' · ') || '—'}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: 10,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {fieldLabel('Lead Status')}
                    <span style={chipStyle()}>{STATUS_LABEL[lead.status] ?? lead.status}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {fieldLabel('Deal')}
                    {deal ? (
                      <span
                        role="link"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/crm/records/deal:${deal.id}`);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            router.push(`/crm/records/deal:${deal.id}`);
                          }
                        }}
                        style={chipStyle({ cursor: 'pointer', color: 'var(--text)' })}
                      >
                        {deal.name}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text3)' }}>No deal yet</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {fieldLabel('Pipeline Stage')}
                    {stageName ? (
                      <span
                        style={chipStyle({
                          borderLeft: `3px solid ${stageColor || 'var(--border)'}`,
                        })}
                      >
                        {stageName}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text3)' }}>—</span>
                    )}
                  </div>
                </div>

                {next ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>Next task: {next}</span>
                    <PriorityChip priority={lead.next_task?.priority} />
                  </div>
                ) : null}

                <div
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {lead.status !== 'converted' && (
                    <>
                      <Select
                        aria-label={`Lead status for ${lead.name}`}
                        value={lead.status}
                        onChange={(e) => statusMut.mutate({ id: lead.id, status: e.target.value })}
                        style={{ width: 'auto', minWidth: 140 }}
                      >
                        {STATUSES.filter((s) => s !== 'converted').map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s] ?? s}
                          </option>
                        ))}
                      </Select>
                      {canConvert ? (
                        <Button
                          onClick={() => {
                            setError(null);
                            setConvertId(lead.id);
                          }}
                        >
                          Convert
                        </Button>
                      ) : null}
                    </>
                  )}
                  {convertedNoDeal && canCreateDeal ? (
                    <Button
                      variant="primary"
                      onClick={() => {
                        setError(null);
                        setCreateDealLead(lead);
                      }}
                    >
                      Create Deal
                    </Button>
                  ) : null}
                  {lead.status === 'converted' && deal ? (
                    <Button
                      onClick={() => router.push(`/crm/records/deal:${deal.id}`)}
                    >
                      Open deal
                    </Button>
                  ) : null}
                </div>
                {convertId === lead.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      paddingTop: 10,
                      borderTop: '1px solid var(--border)',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)' }}>
                      Convert creates a contact (and optional party). Lead status becomes Converted — it does not
                      move a pipeline card unless you also create a deal.
                    </p>
                    {canConvert && canCreateDeal && (
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 13,
                          color: 'var(--text2)',
                          fontFamily: 'var(--font-sans)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={alsoCreateDeal}
                          onChange={(e) => setAlsoCreateDeal(e.target.checked)}
                        />
                        Also create deal
                      </label>
                    )}
                    {alsoCreateDeal && canCreateDeal && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <Select
                          aria-label="Pipeline for deal"
                          value={convertPipeline?.id ?? ''}
                          onChange={(e) => {
                            setConvertPipelineId(e.target.value);
                            setConvertStageId('');
                          }}
                          style={{ width: 'auto', minWidth: 160 }}
                        >
                          {pipelines.length === 0 && <option value="">Loading pipelines…</option>}
                          {pipelines.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                        <Select
                          aria-label="Stage for deal"
                          value={openConvertStage?.id ?? ''}
                          onChange={(e) => setConvertStageId(e.target.value)}
                          style={{ width: 'auto', minWidth: 140 }}
                        >
                          {convertStages.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <Button
                        variant="primary"
                        disabled={
                          convertMut.isPending ||
                          (alsoCreateDeal && (!convertPipeline || !openConvertStage))
                        }
                        onClick={() => convertMut.mutate(lead.id)}
                      >
                        {convertMut.isPending
                          ? 'Converting…'
                          : alsoCreateDeal
                            ? 'Confirm → Contact + Deal'
                            : 'Confirm → Contact'}
                      </Button>
                      <Button
                        onClick={() => {
                          setConvertId(null);
                          setAlsoCreateDeal(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {createDealLead && !dealPipeline ? (
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>Loading pipelines for deal create…</p>
      ) : null}

      {createDealLead && dealPipeline ? (
        <DealCreateModal
          pipelineId={dealPipeline.id}
          pipelineName={dealPipeline.name}
          stages={dealPipeline.stages}
          fields={dealPipeline.fields}
          defaultStageId={defaultOpenStageId(dealPipeline.stages)}
          initialLead={createDealLead}
          initialLeadId={createDealLead.id}
          onClose={() => {
            setCreateDealLead(null);
            void qc.invalidateQueries({ queryKey: ['leads'] });
            void qc.invalidateQueries({ queryKey: ['items', dealPipeline.id] });
          }}
        />
      ) : null}

      {selected.size > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--text)',
            color: '#fff',
            borderRadius: 12,
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 100,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selected.size} selected</span>
          <Select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            style={{ width: 'auto', minWidth: 120 }}
            aria-label="Bulk status"
          >
            {BULK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s] ?? s}
              </option>
            ))}
          </Select>
          <Button
            disabled={bulkMut.isPending}
            onClick={() =>
              bulkMut.mutate({
                action: 'status',
                ids: [...selected],
                status: bulkStatus,
              })
            }
          >
            Set status
          </Button>
          <Button
            disabled={bulkMut.isPending || !user}
            onClick={() =>
              bulkMut.mutate({
                action: 'assign',
                ids: [...selected],
                owner_id: user!.id,
              })
            }
          >
            Assign to me
          </Button>
          <Button
            disabled={bulkMut.isPending}
            onClick={() =>
              bulkMut.mutate({
                action: 'delete',
                ids: [...selected],
              })
            }
          >
            Soft delete
          </Button>
          <Button onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}
    </div>
  );
}
