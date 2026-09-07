'use client';

import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  EmptyState,
  PageHeader,
  helperStyle,
  pageShellStyle,
  panelStyle,
  sectionTitleStyle,
} from '@/modules/crm/shared/ui';
import { Button } from '@/modules/shared/components/ui/Button';

export { EmptyState, PageHeader, helperStyle, pageShellStyle, panelStyle, sectionTitleStyle, Button };

export const riskBadgeStyle = (kind: 'A' | 'B' | 'C'): CSSProperties => {
  if (kind === 'A') {
    return {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 8px',
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 600,
      background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
      color: 'var(--accent)',
    };
  }
  if (kind === 'B') {
    return {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 8px',
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 600,
      background: 'color-mix(in srgb, #c97816 16%, transparent)',
      color: '#c97816',
    };
  }
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 8px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    background: 'color-mix(in srgb, var(--red) 14%, transparent)',
    color: 'var(--red)',
  };
};

export function RiskBadge({ risk }: { risk: 'A' | 'B' | 'C' }) {
  const label = risk === 'A' ? 'Runs automatically' : risk === 'B' ? 'Needs your approval' : 'Not available';
  return <span style={riskBadgeStyle(risk)}>{label}</span>;
}

export function StatusLabel({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    draft: { label: 'Draft', color: 'var(--text2)' },
    published: { label: 'On', color: 'var(--accent)' },
    archived: { label: 'Off', color: 'var(--text2)' },
    pending: { label: 'Needs approval', color: '#c97816' },
    authorized: { label: 'Authorized', color: 'var(--accent)' },
    rejected: { label: 'Rejected', color: 'var(--red)' },
    expired: { label: 'Expired', color: 'var(--text2)' },
    running: { label: 'Running', color: 'var(--accent)' },
    completed: { label: 'Completed', color: 'var(--accent)' },
    failed: { label: 'Failed', color: 'var(--red)' },
    waiting: { label: 'Waiting', color: '#c97816' },
  };
  const m = map[status] ?? { label: status, color: 'var(--text2)' };
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color: m.color, letterSpacing: '-0.01em' }}>{m.label}</span>
  );
}

export function SubNav() {
  const items = [
    { href: '/automation', label: 'Home', exact: true },
    { href: '/automation/workflows', label: 'My Automations' },
    { href: '/automation/templates', label: 'Templates' },
    { href: '/automation/approvals', label: 'Approvals' },
    { href: '/automation/runs', label: 'Activity' },
    { href: '/automation/settings', label: 'Settings' },
  ];
  return (
    <nav
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        marginBottom: 18,
        paddingBottom: 12,
        borderBottom: '1px solid var(--border)',
      }}
    >
      {items.map((item) => (
        <SubNavLink key={item.href} href={item.href} label={item.label} exact={item.exact} />
      ))}
    </nav>
  );
}

function SubNavLink({ href, label, exact }: { href: string; label: string; exact?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      style={{
        padding: '6px 12px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: active ? 650 : 500,
        color: active ? 'var(--text)' : 'var(--text2)',
        background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
        textDecoration: 'none',
      }}
    >
      {label}
    </Link>
  );
}

export function AutomationShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ ...pageShellStyle, padding: 24 }}>
      <SubNav />
      <PageHeader title={title} subtitle={subtitle} actions={actions} />
      {children}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div style={{ ...panelStyle, padding: '16px 18px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)' }}>{value}</div>
      {hint ? <div style={{ ...helperStyle, margin: '6px 0 0' }}>{hint}</div> : null}
    </div>
  );
}

export function LoadingBlock() {
  return <div style={{ ...panelStyle, color: 'var(--text2)' }}>Loading…</div>;
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div
      style={{
        ...panelStyle,
        borderColor: 'color-mix(in srgb, var(--red) 40%, var(--border))',
        color: 'var(--red)',
      }}
    >
      {message}
    </div>
  );
}
