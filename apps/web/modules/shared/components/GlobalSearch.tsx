'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

type SearchHit = {
  entity_type: string;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  rank: number;
};

const TYPE_LABELS: Record<string, string> = {
  lead: 'Leads',
  contact: 'Contacts',
  company: 'Companies',
  customer_party: 'Customers',
  deal: 'Deals',
  quote: 'Quotes',
  invoice: 'Invoices',
  payment: 'Payments',
  task: 'Tasks',
};

const TYPE_ORDER = Object.keys(TYPE_LABELS);

function shortcutLabel() {
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)) {
    return '⌘K';
  }
  return 'Ctrl+K';
}

export function GlobalSearch() {
  const getToken = useApiToken();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  /** Client-focused topbar mode (Round A). Advanced = Block 1 full search. */
  const [scope, setScope] = useState<'clients' | 'all'>('clients');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shortcut = useMemo(() => shortcutLabel(), []);

  const flatResults = results;

  const grouped = useMemo(() => {
    const map = new Map<string, SearchHit[]>();
    for (const hit of results) {
      const list = map.get(hit.entity_type) ?? [];
      list.push(hit);
      map.set(hit.entity_type, list);
    }
    return TYPE_ORDER.filter((t) => map.has(t)).map((t) => ({
      type: t,
      label: TYPE_LABELS[t] ?? t,
      hits: map.get(t)!,
    }));
  }, [results]);

  const close = useCallback(() => {
    setOpen(false);
    setQ('');
    setResults([]);
    setError(null);
    setActiveIdx(0);
  }, []);

  const runSearch = useCallback(
    async (query: string, searchScope: 'clients' | 'all') => {
      if (query.trim().length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const qs = new URLSearchParams({
          q: query.trim(),
          scope: searchScope,
        }).toString();
        const res = await apiFetch<{ data: { results: SearchHit[] }; error: null }>(
          `/api/crm/search?${qs}`,
          { token },
        );
        setResults(res.data.results ?? []);
        setActiveIdx(0);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Search failed');
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [getToken],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(q, scope);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, open, scope, runSearch]);

  function goTo(hit: SearchHit) {
    router.push(hit.href);
    close();
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(flatResults.length - 1, 0)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' && flatResults[activeIdx]) {
      e.preventDefault();
      goTo(flatResults[activeIdx]!);
    }
  }

  let flatIndex = -1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Client search"
        title={`Search clients (${shortcut})`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 34,
          padding: '0 12px',
          borderRadius: 8,
          border: '1px solid var(--nav-border)',
          background: 'var(--surface)',
          color: 'var(--text2)',
          fontSize: 13,
          cursor: 'pointer',
          minWidth: 180,
          fontFamily: 'inherit',
        }}
      >
        <span style={{ opacity: 0.7 }}>Search clients…</span>
        <kbd
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            opacity: 0.55,
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '1px 5px',
          }}
        >
          {shortcut}
        </kbd>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Client search"
          onClick={close}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'center',
            paddingTop: '12vh',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(560px, 92vw)',
              maxHeight: '70vh',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderBottom: '1px solid var(--border)',
                paddingRight: 12,
              }}
            >
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder={
                  scope === 'clients'
                    ? 'Search leads, contacts, customers, deals…'
                    : 'Search everything…'
                }
                style={{
                  flex: 1,
                  border: 'none',
                  padding: '14px 16px',
                  fontSize: 15,
                  outline: 'none',
                  background: 'transparent',
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                }}
              />
              <kbd
                style={{
                  fontSize: 11,
                  opacity: 0.55,
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  padding: '1px 5px',
                  flexShrink: 0,
                }}
              >
                {shortcut}
              </kbd>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                padding: '8px 12px',
                borderBottom: '1px solid var(--border)',
                fontSize: 12,
              }}
            >
              <button
                type="button"
                onClick={() => setScope('clients')}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '4px 8px',
                  background: scope === 'clients' ? 'var(--bg)' : 'transparent',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: scope === 'clients' ? 600 : 400,
                }}
              >
                Clients
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '4px 8px',
                  background: scope === 'all' ? 'var(--bg)' : 'transparent',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: scope === 'all' ? 600 : 400,
                }}
              >
                Search everything
              </button>
            </div>
            <div style={{ overflowY: 'auto', padding: '8px 0', minHeight: 120 }}>
              {loading && (
                <p style={{ margin: 12, fontSize: 13, color: 'var(--text3)' }}>Searching…</p>
              )}
              {!loading && error && (
                <p role="alert" style={{ margin: 12, fontSize: 13, color: 'var(--red)' }}>
                  {error}
                </p>
              )}
              {!loading && !error && q.trim().length >= 2 && results.length === 0 && (
                <p style={{ margin: 12, fontSize: 13, color: 'var(--text3)' }}>No results</p>
              )}
              {!loading && !error && q.trim().length < 2 && (
                <p style={{ margin: 12, fontSize: 13, color: 'var(--text3)' }}>
                  Type at least 2 characters
                </p>
              )}
              {grouped.map((group) => (
                <div key={group.type}>
                  <div
                    style={{
                      padding: '6px 16px',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: 0.4,
                      textTransform: 'uppercase',
                      color: 'var(--text3)',
                    }}
                  >
                    {group.label}
                  </div>
                  {group.hits.map((hit) => {
                    flatIndex += 1;
                    const idx = flatIndex;
                    const active = idx === activeIdx;
                    return (
                      <button
                        key={`${hit.entity_type}-${hit.id}`}
                        type="button"
                        onClick={() => goTo(hit)}
                        onMouseEnter={() => setActiveIdx(idx)}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          border: 'none',
                          background: active ? 'var(--bg)' : 'transparent',
                          padding: '8px 16px',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          color: 'var(--text)',
                        }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{hit.title}</div>
                        {hit.subtitle && (
                          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                            {hit.subtitle}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
