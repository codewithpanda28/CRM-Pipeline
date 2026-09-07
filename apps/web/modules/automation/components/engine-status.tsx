'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { automationApi } from '../lib/api';
import { Button, ErrorBlock, helperStyle, panelStyle, riskBadgeStyle } from './ui';

export function useEngineFlags(enabled = true) {
  const getToken = useApiToken();
  const { hasPermission } = useAuth();
  const canView = hasPermission('automation:workflows:view');
  return useQuery({
    queryKey: ['automation', 'flags'],
    queryFn: async () => automationApi.flags(await getToken()),
    enabled: enabled && canView,
  });
}

export function EngineStatusBadge({ active }: { active: boolean }) {
  return (
    <span style={riskBadgeStyle(active ? 'A' : 'C')}>{active ? 'Active' : 'Off'}</span>
  );
}

/** Banner when engine is off — workflows stay visible; runs stay server-blocked. */
export function EngineOffBanner({
  canAdmin,
  compact,
}: {
  canAdmin: boolean;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        ...panelStyle,
        marginBottom: 14,
        padding: compact ? '12px 14px' : '14px 16px',
        borderColor: 'color-mix(in srgb, var(--red) 35%, var(--border))',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 200px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
          <EngineStatusBadge active={false} />
          <strong style={{ fontSize: 14 }}>Automation is off</strong>
        </div>
        <p style={{ ...helperStyle, margin: 0 }}>
          Published automations will not start new Automation v2 runs. Drafts and history stay intact. Project
          automation is unchanged.
        </p>
      </div>
      {canAdmin ? (
        <Link href="/automation/settings">
          <Button variant="primary">Turn on Automation</Button>
        </Link>
      ) : null}
    </div>
  );
}

export function EngineOnOffControl({
  publishedCount,
}: {
  publishedCount: number;
}) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canAdmin = hasPermission('automation:admin');
  const flags = useEngineFlags(true);
  const [confirmOff, setConfirmOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setEnabled = useMutation({
    mutationFn: async (enabled: boolean) => {
      setError(null);
      return automationApi.setFlags(await getToken(), { enabled });
    },
    onSuccess: (data) => {
      qc.setQueryData(['automation', 'flags'], data);
      void qc.invalidateQueries({ queryKey: ['automation', 'flags'] });
      setConfirmOff(false);
    },
    onError: (e: Error) => {
      setError(e.message || 'Could not update Automation status.');
      setConfirmOff(false);
    },
  });

  const enabled = Boolean(flags.data?.['enabled']);
  const busy = setEnabled.isPending || flags.isFetching;

  const requestOff = () => {
    if (publishedCount > 0) {
      setConfirmOff(true);
      return;
    }
    setEnabled.mutate(false);
  };

  return (
    <div style={{ ...panelStyle, marginBottom: 14 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 650 }}>Automation Engine</h2>
            {flags.isLoading ? null : <EngineStatusBadge active={enabled} />}
          </div>
          <p style={{ ...helperStyle, margin: 0 }}>
            {flags.isLoading
              ? 'Loading status…'
              : enabled
                ? 'Automation is active and published automations can run.'
                : 'Automation is off. Published automations will not start new Automation v2 runs.'}
          </p>
          {!canAdmin ? (
            <p style={{ ...helperStyle, margin: '8px 0 0' }}>
              Only workspace admins can change this. Your drafts and published automations stay as they are.
            </p>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexShrink: 0,
            width: '100%',
            maxWidth: 280,
          }}
          role="group"
          aria-label="Automation Engine"
        >
          <Button
            variant={enabled ? 'primary' : 'secondary'}
            disabled={!canAdmin || busy || enabled}
            onClick={() => setEnabled.mutate(true)}
            style={{ flex: 1, minHeight: 44 }}
            aria-pressed={enabled}
          >
            ON
          </Button>
          <Button
            variant={!enabled ? 'primary' : 'secondary'}
            disabled={!canAdmin || busy || !enabled}
            onClick={requestOff}
            style={{ flex: 1, minHeight: 44 }}
            aria-pressed={!enabled}
          >
            OFF
          </Button>
        </div>
      </div>

      {confirmOff ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 10,
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
          }}
        >
          <p style={{ ...helperStyle, margin: '0 0 12px' }}>
            You have {publishedCount} published automation{publishedCount === 1 ? '' : 's'}. Turning Automation off
            stops new v2 runs — it does not delete or archive them. Continue?
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => setEnabled.mutate(false)}
              style={{ minHeight: 44 }}
            >
              Turn off Automation
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmOff(false)} style={{ minHeight: 44 }}>
              Keep it on
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div style={{ marginTop: 12 }}>
          <ErrorBlock message={error} />
        </div>
      ) : null}
      {setEnabled.isError && !error ? (
        <div style={{ marginTop: 12 }}>
          <ErrorBlock message={(setEnabled.error as Error).message} />
        </div>
      ) : null}
    </div>
  );
}
