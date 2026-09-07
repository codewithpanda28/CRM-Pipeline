'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { Topbar } from '@/modules/shared/components/Topbar';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { FormField, Input } from '@/modules/shared/components/ui/FormField';
import { automationApi } from '../lib/api';
import { EngineOnOffControl, useEngineFlags } from '../components/engine-status';
import {
  AutomationShell,
  Button,
  ErrorBlock,
  LoadingBlock,
  StatCard,
  helperStyle,
  panelStyle,
} from '../components/ui';

export default function AutomationSettingsPage() {
  return (
    <ModuleGuard moduleId="automation">
      <Topbar />
      <SettingsInner />
    </ModuleGuard>
  );
}

function SettingsInner() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const isAdmin = hasPermission('automation:admin');
  const [advanced, setAdvanced] = useState(false);
  const [defaultApprover, setDefaultApprover] = useState('');

  const usage = useQuery({
    queryKey: ['automation', 'usage'],
    queryFn: async () => automationApi.usage(await getToken()),
    enabled: hasPermission('automation:workflows:view'),
  });

  const workflows = useQuery({
    queryKey: ['automation', 'workflows'],
    queryFn: async () => automationApi.listWorkflows(await getToken()),
    enabled: hasPermission('automation:workflows:view'),
  });

  const flags = useEngineFlags(isAdmin && advanced);

  const setFlags = useMutation({
    mutationFn: async (body: Record<string, unknown>) => automationApi.setFlags(await getToken(), body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation', 'flags'] }),
  });

  const publishedCount = (workflows.data ?? []).filter((w) => w.status === 'published').length;

  return (
    <AutomationShell
      title="Automation settings"
      subtitle="Turn Automation on or off, check usage, and set team defaults."
    >
      <EngineOnOffControl publishedCount={publishedCount} />

      {usage.isLoading ? <LoadingBlock /> : null}
      {usage.error ? <ErrorBlock message={(usage.error as Error).message} /> : null}

      {usage.data ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <StatCard
            label="Automations used"
            value={`${usage.data.runs_started} / ${usage.data.display_limit}`}
            hint="Runs started this period (not a bill)"
          />
          <StatCard label="Completed" value={usage.data.runs_completed} />
          <StatCard label="Failed" value={usage.data.runs_failed} />
          <StatCard label="Steps run" value={usage.data.steps_executed} />
        </div>
      ) : null}

      <div style={{ ...panelStyle, marginBottom: 14 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 650 }}>Defaults</h2>
        <p style={helperStyle}>
          Default approvers are stored as a preference for your team (display only in Round 2A).
        </p>
        <FormField label="Default approver note">
          <Input
            placeholder="e.g. Finance manager"
            value={defaultApprover}
            onChange={(e) => setDefaultApprover(e.target.value)}
          />
        </FormField>
      </div>

      {isAdmin ? (
        <>
          <button
            type="button"
            onClick={() => setAdvanced((a) => !a)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text2)',
              fontSize: 13,
              cursor: 'pointer',
              padding: 0,
              marginBottom: 8,
            }}
          >
            {advanced ? 'Hide advanced' : 'Advanced'}
          </button>
          {advanced ? (
            <div style={panelStyle}>
              <p style={helperStyle}>
                Extra engine options. The main ON/OFF control above is the same Round 1 flag (
                automation.engine.v2.enabled).
              </p>
              {flags.isLoading ? <LoadingBlock /> : null}
              {flags.data ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(flags.data['selfApproval'])}
                      onChange={(e) => setFlags.mutate({ selfApproval: e.target.checked })}
                    />
                    Allow requester to authorize their own critical actions (not recommended)
                  </label>
                  {setFlags.error ? <ErrorBlock message={(setFlags.error as Error).message} /> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </AutomationShell>
  );
}
