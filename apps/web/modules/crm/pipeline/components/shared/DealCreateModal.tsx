'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { apiFetch } from '@/modules/shared/lib/api';
import { createDeal } from '@/modules/crm/deals/lib/api';
import { listCustomerParties, type CustomerParty } from '@/modules/crm/customer-parties/lib/api';
import { convertLead, listLeads, type Lead } from '@/modules/crm/leads/lib/leads';
import { FieldEditor } from '@/modules/crm/pipeline/components/fields/FieldEditor';
import type { PipelineField, PipelineStage } from '@/modules/crm/pipeline/lib/pipelines';
import {
  buildDealCustomFields,
  defaultOpenStageId,
  expectedCloseToIso,
  validateDealCreateForm,
  type DealCreateFormValues,
} from '@/modules/crm/pipeline/lib/deal-create-form';

interface WorkspaceUser {
  id: string;
  name: string;
  email?: string;
}

interface ContactRow {
  id: string;
  name: string;
  email?: string | null;
  company_id?: string | null;
}

interface CompanyRow {
  id: string;
  name: string;
}

interface Props {
  pipelineId: string;
  pipelineName?: string;
  stages: PipelineStage[];
  fields: PipelineField[];
  defaultStageId?: string;
  /** Prefill lead when opening from Leads → Create Deal */
  initialLeadId?: string | null;
  initialLead?: Lead | null;
  onClose: () => void;
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.6px',
  color: 'var(--text3)',
  fontFamily: 'var(--font-sans)',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  minHeight: 40,
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 13,
  fontFamily: 'var(--font-sans)',
  background: 'var(--surface)',
  color: 'var(--text)',
  outline: 'none',
  boxSizing: 'border-box',
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--red, #991b1b)', fontFamily: 'var(--font-sans)' }}>
      {message}
    </div>
  );
}

export function DealCreateModal({
  pipelineId,
  pipelineName,
  stages,
  fields,
  defaultStageId,
  initialLeadId,
  initialLead,
  onClose,
}: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { user, hasPermission } = useAuth();
  const canCreate = hasPermission('deals:create');

  const seedLeadId = initialLead?.id ?? initialLeadId ?? '';

  const [values, setValues] = useState<DealCreateFormValues>(() => ({
    name: initialLead?.name ?? '',
    customerPartyId: '',
    amount: '',
    currency: 'INR',
    stageId: defaultOpenStageId(stages, defaultStageId),
    probability: '0',
    ownerId: initialLead?.owner_id ?? user?.id ?? '',
    expectedClose: '',
    contactId: initialLead?.contact_id ?? '',
    companyId: initialLead?.company_id ?? '',
    leadId: seedLeadId,
    productLabel: '',
    nextActionTitle: '',
    nextActionDue: '',
    notes: '',
  }));
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>({});
  const [partyQuery, setPartyQuery] = useState('');
  const [leadQuery, setLeadQuery] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof validateDealCreateForm>>({});
  const [error, setError] = useState<string | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (user?.id && !values.ownerId) {
      setValues((v) => ({ ...v, ownerId: user.id }));
    }
  }, [user?.id, values.ownerId]);

  const { data: usersData } = useQuery({
    queryKey: ['workspace-users'],
    queryFn: async () =>
      apiFetch<{ data: WorkspaceUser[] }>('/api/users', { token: await getToken() }),
  });
  const users = usersData?.data ?? [];

  const { data: partiesData } = useQuery({
    queryKey: ['customer-parties', 'deal-create', partyQuery],
    queryFn: async () =>
      listCustomerParties(await getToken(), {
        status: 'active',
        per_page: '50',
        ...(partyQuery.trim() ? { q: partyQuery.trim() } : {}),
      }),
  });
  const parties = (partiesData?.data ?? []).filter((p) => p.status === 'active');

  const { data: leadsData } = useQuery({
    queryKey: ['leads', 'deal-create', leadQuery],
    queryFn: async () =>
      listLeads(await getToken(), {
        per_page: '50',
        ...(leadQuery.trim() ? { q: leadQuery.trim() } : {}),
      }),
  });
  const leads = useMemo(() => {
    const rows = leadsData?.data ?? [];
    if (initialLead && !rows.some((l) => l.id === initialLead.id)) {
      return [initialLead, ...rows];
    }
    return rows;
  }, [leadsData?.data, initialLead]);

  const { data: contactsData } = useQuery({
    queryKey: ['contacts', 'deal-create'],
    queryFn: async () =>
      apiFetch<{ data: ContactRow[] }>('/api/contacts?per_page=100', { token: await getToken() }),
  });
  const contacts = contactsData?.data ?? [];

  const { data: companiesData } = useQuery({
    queryKey: ['companies', 'deal-create'],
    queryFn: async () =>
      apiFetch<{ data: CompanyRow[] }>('/api/companies?per_page=100', { token: await getToken() }),
  });
  const companies = companiesData?.data ?? [];

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === values.leadId) ?? null,
    [leads, values.leadId],
  );

  const selectedParty = useMemo(
    () => parties.find((p) => p.id === values.customerPartyId) ?? null,
    [parties, values.customerPartyId],
  );

  function patch(p: Partial<DealCreateFormValues>) {
    setValues((v) => ({ ...v, ...p }));
  }

  function onSelectLead(lead: Lead | null) {
    if (!lead) {
      patch({ leadId: '' });
      return;
    }
    const next: Partial<DealCreateFormValues> = {
      leadId: lead.id,
      name: values.name.trim() ? values.name : lead.name,
      contactId: lead.contact_id ?? '',
      companyId: lead.company_id ?? '',
    };
    if (lead.owner_id) next.ownerId = lead.owner_id;
    patch(next);
  }

  function onSelectParty(party: CustomerParty | null) {
    if (!party) {
      patch({ customerPartyId: '' });
      return;
    }
    const next: Partial<DealCreateFormValues> = { customerPartyId: party.id };
    if (party.party_type === 'company') {
      next.companyId = party.party_id;
    } else if (party.party_type === 'contact') {
      next.contactId = party.party_id;
    }
    patch(next);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!canCreate) throw new Error('You do not have permission to create deals');
      const errors = validateDealCreateForm(values);
      setFieldErrors(errors);
      if (Object.keys(errors).length > 0) throw new Error('Please fix the highlighted fields');

      const token = await getToken();
      const custom_fields = {
        ...buildDealCustomFields(values),
        ...customFieldValues,
      };
      const amountNum = Number((values.amount.trim() || '0').replace(/,/g, ''));
      const probability = Number(values.probability);
      const expected_close_at = expectedCloseToIso(values.expectedClose);

      let dealId: string;

      // Unconverted lead → reuse convert API with create_deal (lineage-preserving)
      if (selectedLead && selectedLead.status !== 'converted') {
        if (!values.customerPartyId) {
          throw new Error('Customer is required');
        }
        const converted = await convertLead(token, selectedLead.id, {
          create_company: true,
          create_customer_party: true,
          customer_party_id: values.customerPartyId,
          create_deal: true,
          deal: {
            pipeline_id: pipelineId,
            stage_id: values.stageId,
            name: values.name.trim(),
            amount: amountNum,
            currency: values.currency.trim().toUpperCase(),
            owner_id: values.ownerId,
          },
        });
        const data = converted.data as {
          lead?: { deal_id?: string | null };
          deal?: { id?: string };
        };
        dealId = data?.lead?.deal_id ?? data?.deal?.id ?? '';
        if (!dealId) {
          throw new Error('Lead converted but deal id was not returned');
        }
        // Patch deal with optional fields convert may not set
        await apiFetch(`/api/deals/${dealId}`, {
          method: 'PATCH',
          token,
          body: JSON.stringify({
            probability,
            expected_close_at,
            primary_contact_id: values.contactId || null,
            company_id: values.companyId || null,
            customer_party_id: values.customerPartyId,
            custom_fields,
          }),
        }).catch(() => undefined);
      } else {
        const created = await createDeal(token, {
          name: values.name.trim(),
          pipeline_id: pipelineId,
          stage_id: values.stageId,
          owner_id: values.ownerId,
          amount: amountNum,
          currency: values.currency.trim().toUpperCase(),
          probability,
          expected_close_at,
          customer_party_id: values.customerPartyId,
          primary_contact_id: values.contactId || null,
          company_id: values.companyId || null,
          lead_id: values.leadId || null,
          custom_fields,
          source: values.leadId ? undefined : null,
        });
        dealId = created.data.id;
      }

      // Best-effort next action — do not block deal success on optional task create
      const nextTitle = values.nextActionTitle.trim();
      if (nextTitle && dealId) {
        const taskToken = token;
        const taskDealId = dealId;
        void apiFetch('/api/tasks', {
          method: 'POST',
          token: taskToken,
          body: JSON.stringify({
            title: nextTitle,
            related_deal_id: taskDealId,
            assignee_id: values.ownerId,
            ...(values.nextActionDue.trim()
              ? { due_date: expectedCloseToIso(values.nextActionDue) ?? values.nextActionDue }
              : {}),
          }),
        }).catch(() => {
          // Deal already created — do not fail the whole flow
        });
      }

      return dealId;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['items', pipelineId] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const gridCols = isNarrow ? '1fr' : '1fr 1fr';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deal-create-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(11,19,48,0.25)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: isNarrow ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isNarrow ? 0 : 24,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: isNarrow ? '20px 20px 0 0' : 20,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          border: '1px solid var(--border)',
          width: isNarrow ? '100%' : 600,
          maxWidth: '100%',
          maxHeight: isNarrow ? '92vh' : '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              id="deal-create-title"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: '-0.4px',
                color: 'var(--text)',
                margin: 0,
              }}
            >
              New deal
            </h2>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 13,
                color: 'var(--text2)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Pipeline:{' '}
              <strong style={{ color: 'var(--text)' }}>{pipelineName ?? 'Current pipeline'}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text3)',
              fontSize: 22,
              lineHeight: 1,
              width: 32,
              height: 32,
              borderRadius: 8,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '18px 24px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {!canCreate && (
            <div
              style={{
                background: 'var(--amber-bg, #fef3c7)',
                color: 'var(--amber, #92400e)',
                fontSize: 13,
                padding: '10px 14px',
                borderRadius: 10,
                marginBottom: 16,
                fontFamily: 'var(--font-sans)',
              }}
            >
              You need the <strong>deals:create</strong> permission to create deals.
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>
              Deal name <span style={{ color: 'var(--red, #991b1b)' }}>*</span>
            </label>
            <input
              value={values.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="e.g. Acme — annual renewal"
              style={inputStyle}
              autoFocus
            />
            <FieldError message={fieldErrors.name} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>
                Customer <span style={{ color: 'var(--red, #991b1b)' }}>*</span>
              </label>
              <input
                value={partyQuery}
                onChange={(e) => setPartyQuery(e.target.value)}
                placeholder="Search customers…"
                style={{ ...inputStyle, marginBottom: 8 }}
                aria-label="Search customers"
              />
              <select
                value={values.customerPartyId}
                onChange={(e) => {
                  const party = parties.find((p) => p.id === e.target.value) ?? null;
                  onSelectParty(party);
                }}
                style={inputStyle}
              >
                <option value="">Select customer…</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name} ({p.party_type === 'company' ? 'Company' : 'Contact'})
                  </option>
                ))}
              </select>
              {selectedParty && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-sans)' }}>
                  Linked CustomerParty · {selectedParty.party_type}
                </div>
              )}
              <FieldError message={fieldErrors.customer} />
            </div>

            <div>
              <label style={labelStyle}>Lead (optional)</label>
              <input
                value={leadQuery}
                onChange={(e) => setLeadQuery(e.target.value)}
                placeholder="Search leads…"
                style={{ ...inputStyle, marginBottom: 8 }}
                aria-label="Search leads"
              />
              <select
                value={values.leadId}
                onChange={(e) => {
                  const lead = leads.find((l) => l.id === e.target.value) ?? null;
                  onSelectLead(lead);
                }}
                style={inputStyle}
              >
                <option value="">No lead</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} · {l.status}
                    {l.company_name ? ` · ${l.company_name}` : ''}
                  </option>
                ))}
              </select>
              {selectedLead && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-sans)' }}>
                  {selectedLead.status === 'converted'
                    ? 'Converted lead — party/contact reused; lineage kept on deal.'
                    : 'Unconverted lead — convert + create deal together (history preserved).'}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Contact</label>
              <select
                value={values.contactId}
                onChange={(e) => patch({ contactId: e.target.value })}
                style={inputStyle}
              >
                <option value="">Optional contact…</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.email ? ` · ${c.email}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Company</label>
              <select
                value={values.companyId}
                onChange={(e) => patch({ companyId: e.target.value })}
                style={inputStyle}
              >
                <option value="">Optional company…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>
                Amount <span style={{ color: 'var(--red, #991b1b)' }}>*</span>
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={values.amount}
                onChange={(e) => patch({ amount: e.target.value })}
                placeholder="0"
                style={inputStyle}
              />
              <FieldError message={fieldErrors.amount} />
            </div>
            <div>
              <label style={labelStyle}>
                Currency <span style={{ color: 'var(--red, #991b1b)' }}>*</span>
              </label>
              <select
                value={values.currency}
                onChange={(e) => patch({ currency: e.target.value })}
                style={inputStyle}
              >
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="AED">AED</option>
              </select>
              <FieldError message={fieldErrors.currency} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>
                Stage <span style={{ color: 'var(--red, #991b1b)' }}>*</span>
              </label>
              <select
                value={values.stageId}
                onChange={(e) => patch({ stageId: e.target.value })}
                style={inputStyle}
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.is_won ? ' (Won)' : s.is_lost ? ' (Lost)' : ''}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.stage} />
            </div>
            <div>
              <label style={labelStyle}>
                Probability (%) <span style={{ color: 'var(--red, #991b1b)' }}>*</span>
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={values.probability}
                onChange={(e) => patch({ probability: e.target.value })}
                style={inputStyle}
              />
              <FieldError message={fieldErrors.probability} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>
                Salesperson <span style={{ color: 'var(--red, #991b1b)' }}>*</span>
              </label>
              <select
                value={values.ownerId}
                onChange={(e) => patch({ ownerId: e.target.value })}
                style={inputStyle}
              >
                <option value="">Select owner…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.email ? ` · ${u.email}` : ''}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.owner} />
            </div>
            <div>
              <label style={labelStyle}>Expected close</label>
              <input
                type="date"
                value={values.expectedClose}
                onChange={(e) => patch({ expectedClose: e.target.value })}
                style={inputStyle}
              />
              <FieldError message={fieldErrors.expectedClose} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Product / service</label>
            <input
              value={values.productLabel}
              onChange={(e) => patch({ productLabel: e.target.value })}
              placeholder="Optional product or service label"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Next action</label>
              <input
                value={values.nextActionTitle}
                onChange={(e) => patch({ nextActionTitle: e.target.value })}
                placeholder="e.g. Send proposal"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Next action due</label>
              <input
                type="date"
                value={values.nextActionDue}
                onChange={(e) => patch({ nextActionDue: e.target.value })}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={values.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              rows={3}
              placeholder="Optional notes"
              style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
            />
          </div>

          {fields.length > 0 && (
            <div
              style={{
                marginTop: 20,
                paddingTop: 16,
                borderTop: '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text2)',
                  fontFamily: 'var(--font-sans)',
                  marginBottom: 12,
                  letterSpacing: '0.4px',
                  textTransform: 'uppercase',
                }}
              >
                Custom pipeline fields
              </div>
              {fields.map((field) => (
                <div key={field.id} style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>
                    {field.label}
                    {field.required && (
                      <span style={{ color: 'var(--red, #991b1b)', marginLeft: 2 }}>*</span>
                    )}
                  </label>
                  <FieldEditor
                    field={field}
                    value={customFieldValues[field.key]}
                    onChange={(v) =>
                      setCustomFieldValues((prev) => ({ ...prev, [field.key]: v }))
                    }
                  />
                </div>
              ))}
            </div>
          )}

          {error && (
            <div
              style={{
                background: 'var(--red-bg, #fee2e2)',
                color: 'var(--red, #991b1b)',
                fontSize: 13,
                fontFamily: 'var(--font-sans)',
                padding: '10px 14px',
                borderRadius: 10,
                marginTop: 12,
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            flexShrink: 0,
            background: 'var(--surface)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 18px',
              minHeight: 40,
              border: '1px solid var(--border)',
              borderRadius: 12,
              background: 'var(--surface)',
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              color: 'var(--text2)',
              fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
            disabled={mutation.isPending || !canCreate || !values.stageId}
            style={{
              padding: '10px 18px',
              minHeight: 40,
              border: 'none',
              borderRadius: 12,
              background:
                mutation.isPending || !canCreate || !values.stageId ? 'var(--text3)' : 'var(--text)',
              color: '#fff',
              cursor: mutation.isPending || !canCreate || !values.stageId ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
            }}
          >
            {mutation.isPending ? 'Creating…' : 'Create deal'}
          </button>
        </div>
      </div>
    </div>
  );
}
