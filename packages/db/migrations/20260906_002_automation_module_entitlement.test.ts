import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_MEMBER_PERMISSIONS,
  automationBackfillEnabledValue,
  automationSidebarChildrenVisible,
  shouldBackfillAutomationModule,
} from './20260906_002_automation_module_entitlement';

describe('automation module entitlement backfill policy', () => {
  it('backfills only when the workspace_modules row is missing', () => {
    expect(shouldBackfillAutomationModule(undefined)).toBe(true);
    expect(shouldBackfillAutomationModule(true)).toBe(false);
    expect(shouldBackfillAutomationModule(false)).toBe(false);
  });

  it('inserts enabled=true matching AUTOMATION_MODULE.defaultEnabled', () => {
    expect(automationBackfillEnabledValue()).toBe(true);
  });

  it('member permissions match registry defaults for viewers', () => {
    expect([...AUTOMATION_MEMBER_PERMISSIONS]).toEqual([
      'automation:workflows:view',
      'automation:runs:view',
      'automation:approvals:view',
    ]);
  });
});

describe('automation sidebar children visibility', () => {
  it('entitled tenant with view permission → children visible', () => {
    expect(
      automationSidebarChildrenVisible({
        moduleRowEnabled: true,
        hasWorkflowsViewPermission: true,
        workflowCount: 0,
      }),
    ).toBe(true);
  });

  it('zero workflows does not hide children', () => {
    expect(
      automationSidebarChildrenVisible({
        moduleRowEnabled: true,
        hasWorkflowsViewPermission: true,
        workflowCount: 0,
      }),
    ).toBe(true);
    expect(
      automationSidebarChildrenVisible({
        moduleRowEnabled: true,
        hasWorkflowsViewPermission: true,
        workflowCount: 12,
      }),
    ).toBe(true);
  });

  it('missing module row (legacy tenant) → restricted', () => {
    expect(
      automationSidebarChildrenVisible({
        moduleRowEnabled: undefined,
        hasWorkflowsViewPermission: true,
      }),
    ).toBe(false);
  });

  it('intentionally disabled module → restricted', () => {
    expect(
      automationSidebarChildrenVisible({
        moduleRowEnabled: false,
        hasWorkflowsViewPermission: true,
      }),
    ).toBe(false);
  });

  it('entitled but no permission → restricted', () => {
    expect(
      automationSidebarChildrenVisible({
        moduleRowEnabled: true,
        hasWorkflowsViewPermission: false,
      }),
    ).toBe(false);
  });
});
