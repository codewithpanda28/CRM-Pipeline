import { describe, expect, it } from 'vitest';
import {
  actionRisk,
  appendLinear,
  emptyClientGraph,
  fromEngineGraph,
  newId,
  toEngineGraph,
  validateClientGraph,
  type ClientNode,
} from './client-graph';
import { AUTOMATION_TEMPLATES } from './templates';

describe('actionRisk / Class A/B/C', () => {
  it('labels Class A/B/C correctly', () => {
    expect(actionRisk('task.create')).toBe('A');
    expect(actionRisk('notification.internal')).toBe('A');
    expect(actionRisk('critical.stub')).toBe('B');
    expect(actionRisk('data.purge')).toBe('C');
    expect(actionRisk('approval.auto_approve')).toBe('C');
  });
});

describe('validateClientGraph', () => {
  it('requires WHEN', () => {
    const issues = validateClientGraph(emptyClientGraph());
    expect(issues.some((i) => i.message.includes('starting event'))).toBe(true);
  });

  it('blocks Class C', () => {
    const when: ClientNode = {
      id: 'w1',
      kind: 'WHEN',
      title: 'New Lead',
      config: { event_name: 'crm.lead.created' },
    };
    const then: ClientNode = {
      id: 't1',
      kind: 'THEN',
      title: 'Purge',
      config: { action_type: 'data.purge', params: {} },
    };
    const g = appendLinear({ nodes: [when], edges: [] }, then);
    expect(validateClientGraph(g).some((i) => i.message.includes('can’t be automated'))).toBe(true);
  });

  it('passes a valid lead follow-up', () => {
    const when: ClientNode = {
      id: 'w1',
      kind: 'WHEN',
      title: 'New Lead',
      config: { event_name: 'crm.lead.created' },
    };
    const then: ClientNode = {
      id: 't1',
      kind: 'THEN',
      title: 'Task',
      config: { action_type: 'task.create', params: { title: 'Follow up' } },
    };
    const g = appendLinear({ nodes: [when], edges: [] }, then);
    expect(validateClientGraph(g)).toEqual([]);
  });
});

describe('toEngineGraph / fromEngineGraph', () => {
  it('maps WHEN/THEN to trigger/action without exposing step_type in client nodes', () => {
    const when: ClientNode = {
      id: 'w1',
      kind: 'WHEN',
      title: 'New Lead Created',
      config: { event_name: 'crm.lead.created' },
    };
    const then: ClientNode = {
      id: 't1',
      kind: 'THEN',
      title: 'Assign',
      config: { action_type: 'task.create', params: { title: 'Own lead' } },
    };
    const client = appendLinear({ nodes: [when], edges: [] }, then);
    const engine = toEngineGraph(client);
    expect((engine['trigger'] as { event_name: string }).event_name).toBe('crm.lead.created');
    const nodes = engine['nodes'] as Array<{ type: string }>;
    expect(nodes[0]!.type).toBe('trigger');
    expect(nodes[1]!.type).toBe('action');
    const back = fromEngineGraph(engine);
    expect(back.nodes.every((n) => ['WHEN', 'IF', 'THEN', 'WAIT', 'ELSE', 'APPROVAL'].includes(n.kind))).toBe(
      true,
    );
  });

  it('maps Class B THEN to approval under the hood', () => {
    const when: ClientNode = {
      id: 'w1',
      kind: 'WHEN',
      title: 'Lead',
      config: { event_name: 'crm.lead.created' },
    };
    const then: ClientNode = {
      id: 't1',
      kind: 'THEN',
      title: 'Message',
      config: { action_type: 'critical.stub', params: {} },
    };
    const engine = toEngineGraph(appendLinear({ nodes: [when], edges: [] }, then));
    const nodes = engine['nodes'] as Array<{ type: string }>;
    expect(nodes[1]!.type).toBe('approval');
  });
});

describe('templates', () => {
  it('install graphs are drafts (validation-ready, not auto-published)', () => {
    for (const t of AUTOMATION_TEMPLATES) {
      const g = t.buildGraph();
      expect(g.nodes.some((n) => n.kind === 'WHEN')).toBe(true);
      const engine = toEngineGraph(g);
      expect(engine['trigger']).toBeTruthy();
      // Templates must not contain Class C
      const nodes = engine['nodes'] as Array<{ type: string; config?: { action_type?: string } }>;
      for (const n of nodes) {
        if (n.config?.action_type) {
          expect(actionRisk(n.config.action_type)).not.toBe('C');
        }
      }
    }
  });

  it('has the five outcome templates', () => {
    expect(AUTOMATION_TEMPLATES.map((t) => t.id).sort()).toEqual(
      [
        'after-sales-call',
        'appointment-remind',
        'never-miss-lead',
        'quote-accepted',
        'unpaid-invoice',
      ].sort(),
    );
  });
});

describe('newId', () => {
  it('creates unique-ish ids', () => {
    expect(newId('when')).not.toBe(newId('when'));
  });
});
