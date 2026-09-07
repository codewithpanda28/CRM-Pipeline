'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDispatch } from 'react-redux';
import Link from 'next/link';
import { apiFetch } from '@/modules/shared/lib/api';
import { useConfig } from '@/modules/shared/lib/useConfig';
import { PlatformBrandMark } from '@/modules/shared/components/PlatformBrandMark';
import { setAuth } from '@/store/auth-slice';
import type { AppDispatch } from '@/store';
import { PLATFORM_IDENTITY, resolvePlatformProductName } from '@vencore/config/theme';

function LoginForm() {
  const searchParams = useSearchParams();
  const dispatch = useDispatch<AppDispatch>();
  const { data: config } = useConfig();
  const login = config?.app.appearance?.login;
  const productName = resolvePlatformProductName(config?.app.name);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{
        data: {
          id: string; name: string; email: string; token: string;
          isAdmin: boolean; permissions: string[]; theme: 'light' | 'dark';
        };
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      dispatch(setAuth({
        token: res.data.token,
        user: {
          id: res.data.id,
          name: res.data.name,
          email: res.data.email,
          isAdmin: res.data.isAdmin,
          permissions: res.data.permissions,
          theme: res.data.theme,
        },
      }));
      const raw = searchParams.get('from') ?? '';
      // Prevent open redirect — only allow same-origin relative paths
      const from = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/crm/pipeline';
      window.location.href = from;
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      ...(login?.backgroundImage
        ? {
            backgroundImage: `url(${login.backgroundImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }
        : login?.background
          ? { background: login.background }
          : { background: 'var(--bg)' }),
    }}>
      <div style={{
        width: '100%',
        maxWidth: 360,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 32,
      }}>
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <PlatformBrandMark
              logoUrl={config?.app.logoUrl}
              productName={productName}
              size={40}
            />
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>{productName}</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
            {config?.app.tagline ?? PLATFORM_IDENTITY.productCategory}
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginTop: 16 }}>Sign in</div>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 7,
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 7,
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ textAlign: 'right', marginTop: -6 }}>
            <Link href="/forgot-password" style={{ fontSize: 12, color: 'var(--text3)', textDecoration: 'none' }}>
              Forgot password?
            </Link>
          </div>

          {error && (
            <div style={{ fontSize: 13, color: 'var(--red)', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 7 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '9px 16px', borderRadius: 7, border: 'none',
              background: 'var(--text)', color: '#fff', fontSize: 14,
              fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1, marginTop: 4,
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
