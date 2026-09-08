// packages/api-client/src/core.ts
let _baseUrl = '';

/**
 * Call once at app startup before any API calls.
 * Web:    configure(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001')
 * Mobile: configure(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001')
 */
export function configure(baseUrl: string): void {
  _baseUrl = baseUrl;
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...init } = options;
  const csrf = readCookie('vencore_csrf');
  const res = await fetch(`${_baseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
      ...(init.headers ?? {}),
    },
  });

  const json = (await res.json()) as { error?: { code?: string; message?: string } | null };

  if (!res.ok || json.error) {
    const code = json.error && typeof json.error === 'object' ? json.error.code : undefined;
    const message =
      (json.error && typeof json.error === 'object' ? json.error.message : undefined) ??
      code ??
      `HTTP ${res.status}`;
    throw new Error(message);
  }

  return json as T;
}
