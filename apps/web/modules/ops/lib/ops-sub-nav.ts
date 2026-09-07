/** Pure ops sub-nav helpers — testable without React. */

export const OPS_SUB_NAV_ITEMS = [
  { href: '/ops/today', label: 'Today' },
  { href: '/ops/my-work', label: 'My Work' },
  { href: '/ops/tasks', label: 'My Tasks' },
  { href: '/ops/performance', label: 'Performance' },
  { href: '/ops/dpr', label: 'DPR' },
  { href: '/ops/employees', label: 'Employees' },
  { href: '/ops/departments', label: 'Departments' },
  { href: '/ops/teams', label: 'Teams' },
  { href: '/ops/targets', label: 'Targets' },
] as const;

export type OpsSubNavHref = (typeof OPS_SUB_NAV_ITEMS)[number]['href'];

/** Active when pathname equals href or is a nested path under it. */
export function isOpsSubNavActive(pathname: string, href: string): boolean {
  if (!pathname || !href) return false;
  const path = pathname.split('?')[0]!.replace(/\/+$/, '') || '/';
  const target = href.replace(/\/+$/, '') || '/';
  // Prefer longer matches: /ops/dpr/inbox should not activate Today
  if (href === '/ops/dpr') {
    return path === '/ops/dpr' || path.startsWith('/ops/dpr/');
  }
  if (href === '/ops/performance') {
    return path === '/ops/performance' || path.startsWith('/ops/performance/');
  }
  return path === target || path.startsWith(`${target}/`);
}
