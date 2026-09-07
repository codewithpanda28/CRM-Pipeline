'use client';

import { usePathname } from 'next/navigation';
import { NotificationBell } from './NotificationBell';
import { ActiveRoleSwitcher } from './ActiveRoleSwitcher';
import { GlobalSearch } from './GlobalSearch';
import { PLATFORM_IDENTITY } from '@vencore/config/theme';

const PAGE_TITLES: Record<string, string> = {
  '/crm/pipeline': 'Pipeline',
  '/crm/leads': 'Leads',
  '/crm/customer-parties': 'Customers',
  '/crm/contacts': 'Contacts',
  '/crm/companies': 'Companies',
  '/crm/products': 'Products',
  '/crm/quotes': 'Quotes',
  '/finance/invoices': 'Invoices',
  '/finance/payments': 'Payments',
  '/finance/expenses': 'Expenses',
  '/finance/vendors': 'Vendors',
  '/finance/reports': 'Reports',
  '/crm/tasks': 'Tasks',
  '/activity': 'Activity',
  '/ops/today': 'Today',
  '/ops/my-work': 'My Work',
  '/ops/tasks': 'Tasks',
  '/ops/performance': 'Performance',
  '/ops/dpr': 'DPR',
  '/ops/employees': 'Employees',
  '/ops/departments': 'Departments',
  '/ops/teams': 'Teams',
  '/ops/targets': 'Targets',
  '/infra/servers': 'Servers',
  '/infra/databases': 'Databases',
  '/infra/websites': 'Websites',
  '/analytics': 'Analytics',
  '/infra/alerts': 'Alerts',
  '/settings': 'Settings',
};

export function Topbar({ action, left }: { action?: React.ReactNode; left?: React.ReactNode }) {
  const pathname = usePathname();
  const parts = pathname.split('/').filter(Boolean);
  const segment =
    parts[0] === 'crm' || parts[0] === 'infra' || parts[0] === 'finance' || parts[0] === 'ops'
      ? `/${parts[0]}/${parts[1] ?? ''}`
      : '/' + (parts[0] ?? '');
  const title = PAGE_TITLES[segment] ?? PLATFORM_IDENTITY.productName;

  return (
    <div style={{
      height: 'var(--header-h)',
      background: 'var(--nav-bg)',
      borderBottom: '1px solid var(--nav-border)',
      display: 'flex', alignItems: 'center',
      padding: '0 24px', gap: 16, flexShrink: 0,
      /* ~10px gap below header divider so page titles aren't flush against the rule */
      marginBottom: 10,
    }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        {left ?? (
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: 20, fontWeight: 500,
            letterSpacing: '-0.4px', color: 'var(--nav-fg)',
          }}>{title}</span>
        )}
      </div>

      <div suppressHydrationWarning style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <GlobalSearch />
        <ActiveRoleSwitcher />
        <NotificationBell />
        {action}
      </div>
    </div>
  );
}
