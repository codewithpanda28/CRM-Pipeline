import type { ModuleDefinition } from '../types';

/** Member-facing Operations permissions (R1 + R2 own-scope defaults). */
export const OPS_MEMBER_PERMISSIONS = [
  'ops.employees.view',
  'ops.tasks.view',
  'ops.tasks.manage',
  'ops.targets.view_own',
  'ops.dpr.view_own',
  'ops.dpr.create',
  'ops.performance.view_own',
] as const;

/** Manager system role template permissions (seeded; not auto-assigned). */
export const OPS_MANAGER_PERMISSIONS = [
  'ops.employees.view',
  'ops.tasks.view',
  'ops.tasks.manage',
  'ops.tasks.assign',
  'ops.targets.view_own',
  'ops.targets.view_team',
  'ops.dpr.view_own',
  'ops.dpr.create',
  'ops.dpr.view_team',
  'ops.dpr.review',
  'ops.performance.view_own',
  'ops.performance.view_team',
] as const;

/** Business Operations — org, business tasks, targets, DPR, performance (ADR-027 adjacent). */
export const OPS_MODULE: ModuleDefinition = {
  id: 'ops',
  name: 'Operations',
  description: 'Employees, departments, teams, business tasks, targets, DPR, and performance.',
  icon: 'Users',
  defaultEnabled: true,
  permissions: [
    { key: 'ops.employees.view', label: 'View employees', defaultRoles: ['admin', 'member'] },
    { key: 'ops.employees.manage', label: 'Manage employees', defaultRoles: ['admin'] },
    { key: 'ops.departments.manage', label: 'Manage departments and teams', defaultRoles: ['admin'] },
    { key: 'ops.tasks.view', label: 'View business tasks', defaultRoles: ['admin', 'member'] },
    { key: 'ops.tasks.manage', label: 'Create and edit business tasks', defaultRoles: ['admin', 'member'] },
    { key: 'ops.tasks.assign', label: 'Assign business tasks', defaultRoles: ['admin'] },
    { key: 'ops.targets.view_own', label: 'View own targets', defaultRoles: ['admin', 'member'] },
    { key: 'ops.targets.view_team', label: 'View team targets', defaultRoles: ['admin'] },
    { key: 'ops.targets.view_department', label: 'View department targets', defaultRoles: ['admin'] },
    { key: 'ops.targets.view_company', label: 'View company targets', defaultRoles: ['admin'] },
    { key: 'ops.targets.manage', label: 'Manage targets', defaultRoles: ['admin'] },
    { key: 'ops.dpr.view_own', label: 'View own DPR', defaultRoles: ['admin', 'member'] },
    { key: 'ops.dpr.create', label: 'Create and submit own DPR', defaultRoles: ['admin', 'member'] },
    { key: 'ops.dpr.view_team', label: 'View team DPRs', defaultRoles: ['admin'] },
    { key: 'ops.dpr.review', label: 'Review team DPRs', defaultRoles: ['admin'] },
    { key: 'ops.performance.view_own', label: 'View own performance', defaultRoles: ['admin', 'member'] },
    { key: 'ops.performance.view_team', label: 'View team performance', defaultRoles: ['admin'] },
    { key: 'ops.performance.view_department', label: 'View department performance', defaultRoles: ['admin'] },
    { key: 'ops.performance.view_company', label: 'View company performance', defaultRoles: ['admin'] },
    { key: 'ops.commission_hooks.view', label: 'View commission hook events', defaultRoles: ['admin'] },
  ],
  nav: [
    { label: 'Today', path: '/ops/today', icon: 'CalendarCheck' },
    { label: 'My Work', path: '/ops/my-work', icon: 'ClipboardList' },
    { label: 'Tasks', path: '/ops/tasks', icon: 'CheckSquare' },
    { label: 'Performance', path: '/ops/performance', icon: 'BarChart3' },
    { label: 'DPR', path: '/ops/dpr', icon: 'FileText' },
    { label: 'Employees', path: '/ops/employees', icon: 'Users' },
    { label: 'Departments', path: '/ops/departments', icon: 'Building2' },
    { label: 'Teams', path: '/ops/teams', icon: 'UsersRound' },
    { label: 'Targets', path: '/ops/targets', icon: 'Target' },
  ],
  apiPrefixes: ['/ops'],
  workers: [],
};
