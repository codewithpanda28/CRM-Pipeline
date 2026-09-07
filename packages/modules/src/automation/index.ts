import type { ModuleDefinition } from '../types';

/** Phase 6 Round 1 — Automation engine v2 (ADR-027). Separate from PM automations. */
export const AUTOMATION_MODULE: ModuleDefinition = {
  id: 'automation',
  name: 'Automation',
  description: 'Durable workflows, approvals, and run history (engine v2).',
  icon: 'Workflow',
  defaultEnabled: true,
  permissions: [
    { key: 'automation:workflows:view', label: 'View workflows', defaultRoles: ['admin', 'member'] },
    { key: 'automation:workflows:edit', label: 'Edit workflow drafts', defaultRoles: ['admin'] },
    { key: 'automation:workflows:publish', label: 'Publish workflows', defaultRoles: ['admin'] },
    { key: 'automation:runs:view', label: 'View workflow runs', defaultRoles: ['admin', 'member'] },
    { key: 'automation:runs:replay', label: 'Replay workflow runs', defaultRoles: ['admin'] },
    { key: 'automation:approvals:view', label: 'View approval inbox', defaultRoles: ['admin', 'member'] },
    { key: 'automation:approvals:decide', label: 'Authorize or reject approvals', defaultRoles: ['admin'] },
    { key: 'automation:admin', label: 'Manage automation engine flags and pause', defaultRoles: ['admin'] },
  ],
  nav: [
    { label: 'Automation', path: '/automation', icon: 'Workflow' },
    { label: 'Workflows', path: '/automation/workflows', icon: 'Workflow' },
    { label: 'Templates', path: '/automation/templates', icon: 'LayoutTemplate' },
    { label: 'Approvals', path: '/automation/approvals', icon: 'CheckSquare' },
    { label: 'Runs', path: '/automation/runs', icon: 'Play' },
    { label: 'Settings', path: '/automation/settings', icon: 'Settings' },
  ],
  apiPrefixes: ['/automation'],
  workers: ['automation.event.dispatch', 'automation.run.advance', 'automation.approval.timeout'],
  emitsActivity: false,
};
