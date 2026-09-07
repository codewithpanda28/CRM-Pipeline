import { describe, it, expect } from 'vitest'
import {
  seedGroups,
  mergeLayout,
  validateLayout,
  SALES_ITEM_KEYS,
  FINANCE_ITEM_KEYS,
  OPS_ITEM_KEYS,
  EMPLOYEE_PRIMARY_KEYS,
  orderSalesKeys,
  normalizeMessagingProjectsGroups,
} from './sidebar-layout'

describe('seedGroups', () => {
  it('returns employee_sales_core Work default + Messaging separate from Projects', () => {
    const groups = seedGroups()
    expect(groups.map(g => g.label)).toEqual([
      'Work',
      'Sales',
      'Finance',
      'Operations',
      'Automation',
      'Infra',
      'Messaging',
      'Projects',
      'Insights',
      'General',
    ])
    expect(groups.filter(g => g.is_default).map(g => g.label)).toEqual(['Work'])
    expect(groups.find(g => g.label === 'Work')!.item_keys).toEqual([...EMPLOYEE_PRIMARY_KEYS])
    expect(groups.find(g => g.label === 'Sales')!.item_keys).toEqual([...SALES_ITEM_KEYS])
    expect(groups.find(g => g.label === 'Finance')!.item_keys).toEqual([...FINANCE_ITEM_KEYS])
    expect(groups.find(g => g.label === 'Operations')!.item_keys).toEqual([...OPS_ITEM_KEYS])
    expect(groups.find(g => g.label === 'Messaging')!.item_keys).toEqual(['/messaging'])
    expect(groups.find(g => g.label === 'Projects')!.item_keys).toEqual(['/projects'])
    expect(groups.flatMap(g => g.item_keys)).not.toContain('/settings')
  })

  it('returns a fresh copy each call', () => {
    const a = seedGroups()
    a[0]!.item_keys.push('/mutated')
    expect(seedGroups()[0]!.item_keys).not.toContain('/mutated')
  })
})

describe('normalizeMessagingProjectsGroups', () => {
  it('splits messaging out of a Projects-labeled group', () => {
    const fixed = normalizeMessagingProjectsGroups([
      { id: '1', label: 'Projects', is_default: false, item_keys: ['/messaging', '/projects'] },
      { id: '2', label: 'General', is_default: true, item_keys: ['/dashboard'] },
    ])
    expect(fixed.find(g => g.label === 'Messaging')!.item_keys).toEqual(['/messaging'])
    expect(fixed.find(g => g.label === 'Projects')!.item_keys).toEqual(['/projects'])
  })
})

describe('orderSalesKeys', () => {
  it('orders canonical sales keys and keeps extras last', () => {
    expect(orderSalesKeys(['/crm/tasks', '/crm/customer-parties', '/extra', '/crm/quotes'])).toEqual([
      '/crm/customer-parties',
      '/crm/quotes',
      '/crm/tasks',
      '/extra',
    ])
  })
})

describe('mergeLayout', () => {
  const base = () => [
    { id: 'g1', label: 'Sales', is_default: false, item_keys: ['/crm/contacts'] },
    { id: 'g2', label: 'General', is_default: true, item_keys: ['/dashboard'] },
  ]

  it('places missing Sales keys into Sales and Work primary keys into Work', () => {
    const merged = mergeLayout(base(), [
      '/crm/contacts',
      '/crm/leads',
      '/crm/pipeline',
      '/crm/customer-parties',
      '/crm/products',
      '/crm/quotes',
      '/ops/tasks',
      '/dashboard',
      '/plugins/foo/home',
    ])
    expect(merged.find(g => g.label === 'Work')!.item_keys).toEqual([...EMPLOYEE_PRIMARY_KEYS])
    expect(merged.find(g => g.label === 'Sales')!.item_keys).toEqual([
      '/crm/customer-parties',
      '/crm/contacts',
      '/crm/products',
      '/crm/quotes',
    ])
    expect(merged.find(g => g.label === 'Work')!.is_default).toBe(true)
  })

  it('places missing Finance keys into Finance group', () => {
    const merged = mergeLayout(base(), [
      '/crm/contacts',
      '/finance/invoices',
      '/finance/payments',
      '/dashboard',
    ])
    expect(merged.find(g => g.label === 'Finance')!.item_keys).toEqual([
      '/finance/invoices',
      '/finance/payments',
    ])
  })

  it('moves Sales keys stuck in General back into Sales', () => {
    const groups = [
      { id: 'g1', label: 'Sales', is_default: false, item_keys: ['/crm/contacts'] },
      {
        id: 'g2',
        label: 'General',
        is_default: true,
        item_keys: ['/dashboard', '/crm/customer-parties', '/crm/products', '/crm/quotes'],
      },
    ]
    const merged = mergeLayout(groups, [
      '/crm/contacts',
      '/crm/customer-parties',
      '/crm/products',
      '/crm/quotes',
      '/dashboard',
    ])
    expect(merged.find(g => g.label === 'Sales')!.item_keys).toEqual([
      '/crm/customer-parties',
      '/crm/contacts',
      '/crm/products',
      '/crm/quotes',
    ])
    expect(merged.find(g => g.label === 'General')!.item_keys).toEqual(['/dashboard'])
  })

  it('splits legacy Projects+Messaging combo during merge', () => {
    const groups = [
      { id: 'g1', label: 'Projects', is_default: false, item_keys: ['/messaging', '/projects'] },
      { id: 'g2', label: 'General', is_default: true, item_keys: ['/dashboard'] },
    ]
    const merged = mergeLayout(groups, ['/messaging', '/projects', '/dashboard'])
    expect(merged.find(g => g.label === 'Messaging')!.item_keys).toContain('/messaging')
    expect(merged.find(g => g.label === 'Projects')!.item_keys).toEqual(['/projects'])
    expect(merged.filter(g => g.label === 'Messaging')).toHaveLength(1)
    expect(merged.filter(g => g.label === 'Projects')).toHaveLength(1)
  })

  it('keeps unknown stored keys (stale modules stay assigned, hidden client-side)', () => {
    const groups = base()
    groups[0]!.item_keys = ['/crm/contacts', '/ghost']
    const merged = mergeLayout(groups, ['/crm/contacts', '/dashboard'])
    expect(merged.find(g => g.label === 'Sales')!.item_keys).toContain('/ghost')
  })

  it('forces exactly one default group when none is marked', () => {
    const groups = base().map(g => ({ ...g, is_default: false }))
    const merged = mergeLayout(groups, [])
    expect(merged.filter(g => g.is_default)).toHaveLength(1)
    expect(merged.find(g => g.is_default)!.label).toBe('Work')
  })

  it('does not mutate its input', () => {
    const groups = base()
    mergeLayout(groups, ['/crm/contacts', '/dashboard', '/new'])
    expect(groups[1]!.item_keys).toEqual(['/dashboard'])
  })
})

describe('validateLayout', () => {
  const ok = () => [
    { label: 'Sales', item_keys: ['/crm/contacts'], is_default: false },
    { label: 'General', item_keys: ['/dashboard'], is_default: true },
  ]

  it('accepts a valid layout', () => {
    expect(validateLayout(ok())).toBeNull()
  })

  it('rejects empty layout', () => {
    expect(validateLayout([])).toMatch(/at least one/i)
  })

  it('rejects zero or multiple default groups', () => {
    expect(validateLayout(ok().map(g => ({ ...g, is_default: false })))).toMatch(/default/i)
    expect(validateLayout(ok().map(g => ({ ...g, is_default: true })))).toMatch(/default/i)
  })

  it('rejects empty and duplicate labels (case-insensitive)', () => {
    const g = ok()
    g[0]!.label = '   '
    expect(validateLayout(g)).toMatch(/label/i)
    const d = ok()
    d[0]!.label = 'general'
    expect(validateLayout(d)).toMatch(/label/i)
  })

  it('rejects duplicate item keys across groups', () => {
    const g = ok()
    g[0]!.item_keys = ['/crm/contacts', '/dashboard']
    expect(validateLayout(g)).toMatch(/duplicate/i)
  })
})
