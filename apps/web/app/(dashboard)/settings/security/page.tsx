'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/modules/shared/lib/api';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { PrimaryButton, SecondaryButton } from '@/modules/crm/shared/ui';

/**
 * MFA enroll for privileged users. Calls /api/auth/mfa/* stubs until backend enroll
 * endpoints are fully wired; UI remains usable and surfaces API errors clearly.
 */
export default function SecurityPage() {
  const getToken = useApiToken();
  const [secretPreview, setSecretPreview] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startMut = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return apiFetch<{
        data: { secret?: string; otpauth_url?: string; qr_url?: string };
        error: null;
      }>('/api/auth/mfa/enroll/start', {
        method: 'POST',
        token,
        body: JSON.stringify({}),
      });
    },
    onSuccess: (res) => {
      setError(null);
      setSecretPreview(res.data?.secret ?? null);
      setOtpauthUrl(res.data?.otpauth_url ?? res.data?.qr_url ?? null);
      setMessage('Scan the authenticator secret, then confirm with a 6-digit code.');
    },
    onError: (e: Error) => {
      setError(e.message);
      setMessage(null);
    },
  });

  const confirmMut = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: { recovery_codes?: string[]; enabled?: boolean }; error: null }>(
        '/api/auth/mfa/enroll/confirm',
        {
          method: 'POST',
          token,
          body: JSON.stringify({ code: code.trim() }),
        },
      );
    },
    onSuccess: (res) => {
      setError(null);
      setRecoveryCodes(res.data?.recovery_codes ?? []);
      setMessage('MFA enrolled. Store recovery codes somewhere safe.');
    },
    onError: (e: Error) => {
      setError(e.message);
      setMessage(null);
    },
  });

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Security</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>
        Extra protection for your account. Admins should enroll MFA before production use.
      </p>

      <div
        style={{
          padding: '16px 16px 14px',
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          marginBottom: 12,
        }}
      >
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          Two-factor authentication (MFA)
        </p>
        <p style={{ margin: '6px 0 12px', fontSize: 12, color: 'var(--text3)', lineHeight: 1.45 }}>
          Require a code from your authenticator app when signing in. Enroll at{' '}
          <code style={{ fontSize: 11 }}>/settings/security</code>.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <PrimaryButton
            type="button"
            disabled={startMut.isPending}
            onClick={() => startMut.mutate()}
          >
            Start MFA enroll
          </PrimaryButton>
        </div>

        {secretPreview || otpauthUrl ? (
          <div style={{ marginTop: 14, fontSize: 13, color: 'var(--text2)' }}>
            {secretPreview ? (
              <p style={{ margin: '0 0 8px' }}>
                Secret: <code style={{ wordBreak: 'break-all' }}>{secretPreview}</code>
              </p>
            ) : null}
            {otpauthUrl ? (
              <p style={{ margin: '0 0 8px', wordBreak: 'break-all' }}>
                otpauth: <code>{otpauthUrl}</code>
              </p>
            ) : null}
            <label style={{ display: 'grid', gap: 6, maxWidth: 220 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>Confirm code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                placeholder="123456"
                style={{
                  minHeight: 40,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: 14,
                }}
              />
            </label>
            <div style={{ marginTop: 10 }}>
              <PrimaryButton
                type="button"
                disabled={code.trim().length < 6 || confirmMut.isPending}
                onClick={() => confirmMut.mutate()}
              >
                Confirm enroll
              </PrimaryButton>
            </div>
          </div>
        ) : null}

        {recoveryCodes && recoveryCodes.length > 0 ? (
          <div style={{ marginTop: 14 }}>
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600 }}>Recovery codes</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text2)' }}>
              {recoveryCodes.map((c) => (
                <li key={c}>
                  <code>{c}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {message ? (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text2)' }}>{message}</p>
        ) : null}
        {error ? (
          <p role="alert" style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--red)' }}>
            {error}
          </p>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Active sessions</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            See and revoke devices currently signed in.
          </p>
        </div>
        <SecondaryButton type="button" disabled>
          Coming soon
        </SecondaryButton>
      </div>
    </div>
  );
}
