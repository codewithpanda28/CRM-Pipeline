'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { FormField, Textarea } from '@/modules/shared/components/ui/FormField';
import { automationApi, type ApprovalRow } from '../lib/api';
import {
  AutomationShell,
  Button,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  StatusLabel,
  helperStyle,
  panelStyle,
  riskBadgeStyle,
} from '../components/ui';

export default function ApprovalsPage() {
  return (
    <ModuleGuard moduleId="automation">
      <Topbar />
      <ApprovalsInner />
    </ModuleGuard>
  );
}

function ApprovalsInner() {
  const getToken = useApiToken();
  const { hasPermission } = useAuth();
  const list = useQuery({
    queryKey: ['automation', 'approvals'],
    queryFn: async () => automationApi.listApprovals(await getToken()),
    enabled: hasPermission('automation:approvals:view'),
  });

  const pending = useMemo(
    () => (list.data ?? []).filter((a) => a.status === 'pending'),
    [list.data],
  );

  return (
    <AutomationShell
      title="Approvals"
      subtitle="Authorize critical actions before they run. Draft and Publish never authorize money or critical steps."
    >
      {list.isLoading ? <LoadingBlock /> : null}
      {list.error ? <ErrorBlock message={(list.error as Error).message} /> : null}
      {!list.isLoading && pending.length === 0 ? (
        <EmptyState
          title="No pending approvals"
          description="When an automation needs your OK, it will show up here."
        />
      ) : null}
      <div style={{ display: 'grid', gap: 10 }}>
        {pending.map((a) => (
          <Link
            key={a.id}
            href={`/automation/approvals/${a.id}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <ApprovalCard summary approval={a} />
          </Link>
        ))}
      </div>
    </AutomationShell>
  );
}

export function ApprovalDetailPage({ approvalId }: { approvalId: string }) {
  return (
    <ModuleGuard moduleId="automation">
      <Topbar />
      <DetailInner approvalId={approvalId} />
    </ModuleGuard>
  );
}

function DetailInner({ approvalId }: { approvalId: string }) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canDecide = hasPermission('automation:approvals:decide');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [advanced, setAdvanced] = useState(false);

  const detail = useQuery({
    queryKey: ['automation', 'approval', approvalId],
    queryFn: async () => automationApi.getApproval(await getToken(), approvalId),
    enabled: hasPermission('automation:approvals:view'),
  });

  const authorize = useMutation({
    mutationFn: async () => automationApi.authorize(await getToken(), approvalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automation', 'approvals'] });
      qc.invalidateQueries({ queryKey: ['automation', 'approval', approvalId] });
    },
  });
  const reject = useMutation({
    mutationFn: async () => {
      if (!reason.trim()) throw new Error('Add a reason for rejecting.');
      return automationApi.reject(await getToken(), approvalId, reason.trim());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automation', 'approvals'] });
      qc.invalidateQueries({ queryKey: ['automation', 'approval', approvalId] });
      setRejectOpen(false);
    },
  });

  if (detail.isLoading) {
    return (
      <AutomationShell title="Approval">
        <LoadingBlock />
      </AutomationShell>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <AutomationShell title="Approval">
        <ErrorBlock message={(detail.error as Error)?.message ?? 'Not found'} />
      </AutomationShell>
    );
  }

  const a = detail.data;
  const snap = a.requested_payload_snapshot ?? {};
  const pending = a.status === 'pending';

  return (
    <>
      <AutomationShell title="Approval required" subtitle="Review carefully before authorizing.">
        <div style={{ paddingBottom: pending && canDecide ? 88 : 0 }}>
          <ApprovalCard approval={a} />

          <div style={{ ...panelStyle, marginTop: 12 }}>
            <DetailRow label="Action" value={humanAction(a.action_type)} />
            <DetailRow label="Amount" value={formatAmount(snap)} />
            <DetailRow
              label="Customer"
              value={String(snap['customer_name'] ?? snap['customer_party_id'] ?? '—')}
            />
            <DetailRow
              label="Affected record"
              value={String(snap['record_label'] ?? snap['record_id'] ?? a.workflow_run_id.slice(0, 8))}
            />
            <DetailRow label="Reason" value={a.reason || 'Automation requested authorization'} />
            <DetailRow label="Requester" value={`${a.requester_type} · ${a.requester_id.slice(0, 8)}…`} />
            <DetailRow label="Expires" value={new Date(a.expires_at).toLocaleString()} />
            <div style={{ marginTop: 8 }}>
              <StatusLabel status={a.status} />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAdvanced((x) => !x)}
            style={{
              marginTop: 12,
              background: 'none',
              border: 'none',
              color: 'var(--text2)',
              fontSize: 13,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {advanced ? 'Hide execution details' : 'Execution details'}
          </button>
          {advanced ? (
            <div
              style={{
                ...panelStyle,
                marginTop: 8,
                fontSize: 12,
                color: 'var(--text2)',
                wordBreak: 'break-all',
              }}
            >
              <div>Workflow: {a.workflow_id}</div>
              <div>Version: {a.workflow_version_id}</div>
              <div>Run: {a.workflow_run_id}</div>
              <div>Step: {a.workflow_run_step_id ?? '—'}</div>
              <div>Payload hash: {a.payload_hash}</div>
              <pre style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{JSON.stringify(snap, null, 2)}</pre>
            </div>
          ) : null}

          {rejectOpen ? (
            <div style={{ ...panelStyle, marginTop: 12 }}>
              <FormField label="Why are you rejecting?">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
              </FormField>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <Button variant="danger" disabled={reject.isPending} onClick={() => reject.mutate()}>
                  Reject
                </Button>
                <Button variant="secondary" onClick={() => setRejectOpen(false)}>
                  Cancel
                </Button>
              </div>
              {reject.error ? <ErrorBlock message={(reject.error as Error).message} /> : null}
            </div>
          ) : null}

          {authorize.error ? (
            <div style={{ marginTop: 12 }}>
              <ErrorBlock message={(authorize.error as Error).message} />
            </div>
          ) : null}
        </div>
      </AutomationShell>

      {pending && canDecide ? (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 40,
            padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
            background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
            backdropFilter: 'blur(8px)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: 10,
            justifyContent: 'center',
          }}
        >
          <Button
            variant="primary"
            disabled={authorize.isPending}
            onClick={() => authorize.mutate()}
            style={{ flex: '1 1 160px', maxWidth: 280, minHeight: 44 }}
          >
            Authorize this action
          </Button>
          <Button
            variant="secondary"
            onClick={() => setRejectOpen(true)}
            style={{ flex: '1 1 120px', maxWidth: 200, minHeight: 44 }}
          >
            Reject
          </Button>
        </div>
      ) : null}
    </>
  );
}

function ApprovalCard({ approval, summary }: { approval: ApprovalRow; summary?: boolean }) {
  const snap = approval.requested_payload_snapshot ?? {};
  return (
    <div style={{ ...panelStyle, padding: summary ? '14px 16px' : '16px 18px' }}>
      <div style={{ ...riskBadgeStyle('B'), marginBottom: 10 }}>APPROVAL REQUIRED</div>
      <div style={{ fontSize: 16, fontWeight: 650 }}>{humanAction(approval.action_type)}</div>
      <p style={{ ...helperStyle, margin: '6px 0 0' }}>
        {formatAmount(snap) !== '—' ? `${formatAmount(snap)} · ` : ''}
        Expires {new Date(approval.expires_at).toLocaleString()}
      </p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text2)' }}>{label}</span>
      <span style={{ fontWeight: 560, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function humanAction(type: string): string {
  if (type === 'critical.stub') return 'Critical customer action';
  if (type === 'task.create') return 'Create task';
  return type;
}

function formatAmount(snap: Record<string, unknown>): string {
  const amt = snap['amount'] ?? snap['total'] ?? snap['invoice_amount'];
  if (amt == null) return '—';
  return String(amt);
}
