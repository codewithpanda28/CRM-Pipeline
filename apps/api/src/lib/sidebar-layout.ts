export interface SidebarGroupDto {
  id: string | null;
  label: string;
  is_default: boolean;
  item_keys: string[];
}

/** Canonical Sales nav order (module-gated client-side). */
export const SALES_ITEM_KEYS: readonly string[] = [
  '/crm/customer-parties',
  '/crm/contacts',
  '/crm/companies',
  '/crm/products',
  '/crm/quotes',
  '/crm/tasks',
  '/activity',
];

/** Round B — primary employee chrome (employee_sales_core). */
export const EMPLOYEE_PRIMARY_KEYS: readonly string[] = [
  '/ops/tasks',
  '/crm/pipeline',
  '/crm/leads',
];

/** Canonical Finance nav order. */
export const FINANCE_ITEM_KEYS: readonly string[] = [
  '/finance/invoices',
  '/finance/payments',
  '/finance/expenses',
  '/finance/vendors',
  '/finance/accounts',
  '/finance/journals',
  '/finance/periods',
  '/finance/reports',
  '/finance/settings',
];

export const AUTOMATION_ITEM_KEYS: readonly string[] = [
  '/automation',
  '/automation/workflows',
  '/automation/templates',
  '/automation/approvals',
  '/automation/runs',
  '/automation/settings',
];

/** Business Operations — nav label "Operations" (not "Team"). */
export const OPS_ITEM_KEYS: readonly string[] = [
  '/ops/today',
  '/ops/my-work',
  '/ops/employees',
  '/ops/departments',
  '/ops/teams',
  '/ops/targets',
];

const SALES_KEY_SET = new Set<string>(SALES_ITEM_KEYS);
const FINANCE_KEY_SET = new Set<string>(FINANCE_ITEM_KEYS);
const AUTOMATION_KEY_SET = new Set<string>(AUTOMATION_ITEM_KEYS);
const OPS_KEY_SET = new Set<string>(OPS_ITEM_KEYS);
const PRIMARY_KEY_SET = new Set<string>(EMPLOYEE_PRIMARY_KEYS);

export const BUILTIN_ITEM_KEYS: readonly string[] = [
  ...EMPLOYEE_PRIMARY_KEYS,
  ...SALES_ITEM_KEYS,
  ...FINANCE_ITEM_KEYS,
  ...AUTOMATION_ITEM_KEYS,
  ...OPS_ITEM_KEYS,
  '/infra/servers', '/infra/databases', '/infra/websites', '/infra/alerts',
  '/messaging', '/projects',
  '/analytics',
  '/dashboard',
];

const SEED: ReadonlyArray<Readonly<{ label: string; is_default: boolean; item_keys: readonly string[] }>> = [
  { label: 'Work', is_default: true, item_keys: EMPLOYEE_PRIMARY_KEYS },
  { label: 'Sales',    is_default: false, item_keys: SALES_ITEM_KEYS },
  { label: 'Finance',  is_default: false, item_keys: FINANCE_ITEM_KEYS },
  { label: 'Operations', is_default: false, item_keys: OPS_ITEM_KEYS },
  { label: 'Automation', is_default: false, item_keys: AUTOMATION_ITEM_KEYS },
  { label: 'Infra',     is_default: false, item_keys: ['/infra/servers', '/infra/databases', '/infra/websites', '/infra/alerts'] },
  { label: 'Messaging', is_default: false, item_keys: ['/messaging'] },
  { label: 'Projects',  is_default: false, item_keys: ['/projects'] },
  { label: 'Insights',  is_default: false, item_keys: ['/analytics'] },
  { label: 'General',   is_default: false, item_keys: ['/dashboard'] },
];

export function seedGroups(): SidebarGroupDto[] {
  return SEED.map(g => ({ id: null, label: g.label, is_default: g.is_default, item_keys: [...g.item_keys] }));
}

/** Ensure Work = My Tasks · Pipeline · Leads first (employee_sales_core). */
export function applyEmployeeSalesCorePreset(groups: SidebarGroupDto[]): SidebarGroupDto[] {
  const primary = [...EMPLOYEE_PRIMARY_KEYS];
  const withoutPrimary = groups.map((g) => ({
    ...g,
    item_keys: g.item_keys.filter((k) => !PRIMARY_KEY_SET.has(k)),
    is_default: false,
  }));
  const workExtras = withoutPrimary
    .filter((g) => g.label.trim().toLowerCase() === 'work')
    .flatMap((g) => g.item_keys);
  const rest = withoutPrimary.filter((g) => g.label.trim().toLowerCase() !== 'work');

  // Plugins / extras previously parked on Work must not disappear when Work is reset.
  if (workExtras.length > 0) {
    let general = rest.find((g) => g.label.trim().toLowerCase() === 'general');
    if (!general) {
      general = { id: null, label: 'General', is_default: false, item_keys: [] };
      rest.push(general);
    }
    const seen = new Set(general.item_keys);
    for (const k of workExtras) {
      if (!seen.has(k)) {
        general.item_keys.push(k);
        seen.add(k);
      }
    }
  }

  return [
    { id: null, label: 'Work', is_default: true, item_keys: primary },
    ...rest,
  ];
}

/**
 * Messaging must not live under a "Projects" label.
 * Splits /messaging into its own group; keeps /projects under Projects.
 * Dedupes duplicate Messaging/Projects labels.
 */
export function normalizeMessagingProjectsGroups(groups: SidebarGroupDto[]): SidebarGroupDto[] {
  const out: SidebarGroupDto[] = groups.map((g) => ({
    ...g,
    item_keys: [...g.item_keys],
  }));

  // Pull /messaging out of any non-Messaging group
  const messagingKeys: string[] = [];
  for (const g of out) {
    const label = g.label.trim().toLowerCase();
    if (label === 'messaging') continue;
    const kept: string[] = [];
    for (const k of g.item_keys) {
      if (k === '/messaging') messagingKeys.push(k);
      else kept.push(k);
    }
    g.item_keys = kept;
  }

  let messagingIdx = out.findIndex((g) => g.label.trim().toLowerCase() === 'messaging');
  if (messagingIdx === -1 && messagingKeys.length > 0) {
    const projectsIdx = out.findIndex((g) => g.label.trim().toLowerCase() === 'projects');
    const insertAt = projectsIdx >= 0 ? projectsIdx : out.length;
    out.splice(insertAt, 0, {
      id: null,
      label: 'Messaging',
      is_default: false,
      item_keys: [],
    });
    messagingIdx = insertAt;
  }
  if (messagingIdx >= 0) {
    const seen = new Set(out[messagingIdx]!.item_keys);
    for (const k of messagingKeys) {
      if (!seen.has(k)) {
        out[messagingIdx]!.item_keys.push(k);
        seen.add(k);
      }
    }
    if (!seen.has('/messaging')) out[messagingIdx]!.item_keys.push('/messaging');
  }

  // Ensure a Projects group exists for /projects when present anywhere
  const projectKeys: string[] = [];
  for (const g of out) {
    const label = g.label.trim().toLowerCase();
    if (label === 'projects') continue;
    const kept: string[] = [];
    for (const k of g.item_keys) {
      if (k === '/projects') projectKeys.push(k);
      else kept.push(k);
    }
    g.item_keys = kept;
  }
  let projectsIdx = out.findIndex((g) => g.label.trim().toLowerCase() === 'projects');
  if (projectsIdx === -1 && projectKeys.length > 0) {
    const msgIdx = out.findIndex((g) => g.label.trim().toLowerCase() === 'messaging');
    const insertAt = msgIdx >= 0 ? msgIdx + 1 : out.length;
    out.splice(insertAt, 0, {
      id: null,
      label: 'Projects',
      is_default: false,
      item_keys: [],
    });
    projectsIdx = insertAt;
  }
  if (projectsIdx >= 0) {
    const seen = new Set(out[projectsIdx]!.item_keys);
    for (const k of projectKeys) {
      if (!seen.has(k)) {
        out[projectsIdx]!.item_keys.push(k);
        seen.add(k);
      }
    }
  }

  // Drop duplicate-named groups (keep first; merge leftover keys)
  const byLabel = new Map<string, SidebarGroupDto>();
  const ordered: SidebarGroupDto[] = [];
  for (const g of out) {
    const label = g.label.trim().toLowerCase();
    const existing = byLabel.get(label);
    if (existing) {
      for (const k of g.item_keys) {
        if (!existing.item_keys.includes(k)) existing.item_keys.push(k);
      }
      continue;
    }
    byLabel.set(label, g);
    ordered.push(g);
  }
  return ordered;
}

/** Keep Sales keys in canonical order; preserve unknown extras after. */
export function orderSalesKeys(keys: string[]): string[] {
  const set = new Set(keys);
  const ordered = SALES_ITEM_KEYS.filter(k => set.has(k));
  const extras = keys.filter(k => !SALES_KEY_SET.has(k));
  return [...ordered, ...extras];
}

export function orderFinanceKeys(keys: string[]): string[] {
  const set = new Set(keys);
  const ordered = FINANCE_ITEM_KEYS.filter(k => set.has(k));
  const extras = keys.filter(k => !FINANCE_KEY_SET.has(k));
  return [...ordered, ...extras];
}

export function orderAutomationKeys(keys: string[]): string[] {
  const set = new Set(keys);
  const ordered = AUTOMATION_ITEM_KEYS.filter(k => set.has(k));
  const extras = keys.filter(k => !AUTOMATION_KEY_SET.has(k));
  return [...ordered, ...extras];
}

export function orderOpsKeys(keys: string[]): string[] {
  const set = new Set(keys);
  const ordered = OPS_ITEM_KEYS.filter(k => set.has(k));
  const extras = keys.filter(k => !OPS_KEY_SET.has(k));
  return [...ordered, ...extras];
}

export function mergeLayout(groups: SidebarGroupDto[], knownKeys: string[]): SidebarGroupDto[] {
  const known = new Set(knownKeys);
  const seen = new Set<string>();
  const out = groups.map(g => ({
    ...g,
    item_keys: g.item_keys.filter(k => {
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }),
  }));

  let defaultIdx = out.findIndex(g => g.is_default);
  if (defaultIdx === -1) defaultIdx = Math.max(0, out.length - 1);
  out.forEach((g, i) => { g.is_default = i === defaultIdx; });

  let salesIdx = out.findIndex(g => g.label.trim().toLowerCase() === 'sales');
  if (salesIdx === -1) {
    const insertAt = Math.max(0, defaultIdx);
    out.splice(insertAt, 0, { id: null, label: 'Sales', is_default: false, item_keys: [] });
    salesIdx = insertAt;
    defaultIdx = out.findIndex(g => g.is_default);
  }

  let financeIdx = out.findIndex(g => g.label.trim().toLowerCase() === 'finance');
  if (financeIdx === -1) {
    const insertAt = salesIdx + 1;
    out.splice(insertAt, 0, { id: null, label: 'Finance', is_default: false, item_keys: [] });
    financeIdx = insertAt;
    defaultIdx = out.findIndex(g => g.is_default);
    salesIdx = out.findIndex(g => g.label.trim().toLowerCase() === 'sales');
  }

  let opsIdx = out.findIndex(g => g.label.trim().toLowerCase() === 'operations');
  if (opsIdx === -1) {
    const insertAt = financeIdx + 1;
    out.splice(insertAt, 0, { id: null, label: 'Operations', is_default: false, item_keys: [] });
    opsIdx = insertAt;
    defaultIdx = out.findIndex(g => g.is_default);
    salesIdx = out.findIndex(g => g.label.trim().toLowerCase() === 'sales');
    financeIdx = out.findIndex(g => g.label.trim().toLowerCase() === 'finance');
  }

  let automationIdx = out.findIndex(g => g.label.trim().toLowerCase() === 'automation');
  if (automationIdx === -1) {
    const insertAt = opsIdx + 1;
    out.splice(insertAt, 0, { id: null, label: 'Automation', is_default: false, item_keys: [] });
    automationIdx = insertAt;
    defaultIdx = out.findIndex(g => g.is_default);
    salesIdx = out.findIndex(g => g.label.trim().toLowerCase() === 'sales');
    financeIdx = out.findIndex(g => g.label.trim().toLowerCase() === 'finance');
    opsIdx = out.findIndex(g => g.label.trim().toLowerCase() === 'operations');
  }

  const salesHeld = new Set<string>();
  const financeHeld = new Set<string>();
  const automationHeld = new Set<string>();
  const opsHeld = new Set<string>();
  for (const g of out) {
    for (const k of g.item_keys) {
      if (SALES_KEY_SET.has(k)) salesHeld.add(k);
      if (FINANCE_KEY_SET.has(k)) financeHeld.add(k);
      if (AUTOMATION_KEY_SET.has(k)) automationHeld.add(k);
      if (OPS_KEY_SET.has(k)) opsHeld.add(k);
    }
    g.item_keys = g.item_keys.filter(
      k =>
        !SALES_KEY_SET.has(k) &&
        !FINANCE_KEY_SET.has(k) &&
        !AUTOMATION_KEY_SET.has(k) &&
        !OPS_KEY_SET.has(k) &&
        !PRIMARY_KEY_SET.has(k),
    );
  }
  for (const k of SALES_ITEM_KEYS) {
    if (known.has(k)) salesHeld.add(k);
  }
  for (const k of FINANCE_ITEM_KEYS) {
    if (known.has(k)) financeHeld.add(k);
  }
  for (const k of AUTOMATION_ITEM_KEYS) {
    if (known.has(k)) automationHeld.add(k);
  }
  for (const k of OPS_ITEM_KEYS) {
    if (known.has(k)) opsHeld.add(k);
  }

  out[salesIdx]!.item_keys = orderSalesKeys([
    ...salesHeld,
    ...out[salesIdx]!.item_keys,
  ]);
  out[financeIdx]!.item_keys = orderFinanceKeys([
    ...financeHeld,
    ...out[financeIdx]!.item_keys,
  ]);
  out[opsIdx]!.item_keys = orderOpsKeys([
    ...opsHeld,
    ...out[opsIdx]!.item_keys,
  ]);
  out[automationIdx]!.item_keys = orderAutomationKeys([
    ...automationHeld,
    ...out[automationIdx]!.item_keys,
  ]);

  const placed = new Set(out.flatMap(g => g.item_keys));
  const stillMissing = knownKeys.filter(k => !placed.has(k) && !PRIMARY_KEY_SET.has(k));
  if (stillMissing.length > 0 && out[defaultIdx]) {
    out[defaultIdx].item_keys = [...out[defaultIdx].item_keys, ...stillMissing];
  }
  return applyEmployeeSalesCorePreset(normalizeMessagingProjectsGroups(out));
}

export function validateLayout(
  groups: { label: string; item_keys: string[]; is_default: boolean }[],
): string | null {
  if (groups.length === 0) return 'Layout must contain at least one group';
  if (groups.filter(g => g.is_default).length !== 1) return 'Layout must contain exactly one default group';

  const labels = new Set<string>();
  for (const g of groups) {
    const label = g.label.trim().toLowerCase();
    if (!label) return 'Group labels must be non-empty';
    if (labels.has(label)) return `Duplicate group label: ${g.label}`;
    labels.add(label);
  }

  const keys = new Set<string>();
  for (const g of groups) {
    for (const k of g.item_keys) {
      if (keys.has(k)) return `Duplicate item key across groups: ${k}`;
      keys.add(k);
    }
  }
  return null;
}
