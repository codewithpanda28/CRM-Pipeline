/** Client-facing graph ↔ Round 1 engine graph. No raw step_type in UI. */

export type ClientKind = 'WHEN' | 'IF' | 'THEN' | 'WAIT' | 'ELSE' | 'APPROVAL';

export type ActionRisk = 'A' | 'B' | 'C';

export interface ClientNode {
  id: string;
  kind: ClientKind;
  title: string;
  subtitle?: string;
  config: Record<string, unknown>;
}

export interface ClientGraph {
  nodes: ClientNode[];
  /** Ordered edges: from → to with optional when ('true'|'false'|'default') */
  edges: Array<{ from: string; to: string; when?: string }>;
}

export const RISK_LABEL: Record<ActionRisk, string> = {
  A: 'Runs automatically',
  B: 'Needs your approval',
  C: 'Not available',
};

export function actionRisk(actionType: string): ActionRisk {
  if (actionType === 'task.create' || actionType === 'notification.internal') return 'A';
  if (actionType === 'critical.stub') return 'B';
  if (
    actionType === 'data.purge' ||
    actionType === 'config.privileged' ||
    actionType === 'billing.platform.mutate' ||
    actionType === 'approval.auto_approve' ||
    actionType === 'ai.execute_critical'
  ) {
    return 'C';
  }
  // Future Voice/WA reserved — treat as B for UX badges
  if (actionType.startsWith('voice.') || actionType.startsWith('whatsapp.')) return 'B';
  return 'A';
}

export function emptyClientGraph(): ClientGraph {
  return { nodes: [], edges: [] };
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Map client graph → Round 1 workflow graph JSON. */
export function toEngineGraph(client: ClientGraph): Record<string, unknown> {
  const when = client.nodes.find((n) => n.kind === 'WHEN');
  const eventName = String(when?.config['event_name'] ?? '');

  const nodes = client.nodes.map((n) => {
    if (n.kind === 'WHEN') {
      return { id: n.id, type: 'trigger', config: { ...n.config, title: n.title } };
    }
    if (n.kind === 'IF') {
      return {
        id: n.id,
        type: 'condition',
        config: {
          path: n.config['path'] ?? 'payload.status',
          op: n.config['op'] ?? 'eq',
          value: n.config['value'],
          title: n.title,
        },
      };
    }
    if (n.kind === 'WAIT') {
      const amount = Number(n.config['amount'] ?? 1);
      const unit = String(n.config['unit'] ?? 'hours');
      const mult = unit === 'minutes' ? 60_000 : unit === 'days' ? 86_400_000 : 3_600_000;
      return {
        id: n.id,
        type: 'delay',
        config: { delay_ms: amount * mult, amount, unit, title: n.title },
      };
    }
    if (n.kind === 'APPROVAL') {
      return {
        id: n.id,
        type: 'approval',
        config: {
          action_type: n.config['action_type'] ?? 'critical.stub',
          params: n.config['params'] ?? {},
          expires_in_seconds: Number(n.config['expires_in_seconds'] ?? 86400),
          title: n.title,
        },
      };
    }
    if (n.kind === 'ELSE') {
      return { id: n.id, type: 'branch', config: { title: n.title, cases: [] } };
    }
    // THEN
    const actionType = String(n.config['action_type'] ?? 'task.create');
    const risk = actionRisk(actionType);
    if (risk === 'B') {
      // Class B THEN becomes approval step under the hood
      return {
        id: n.id,
        type: 'approval',
        config: {
          action_type: actionType,
          params: n.config['params'] ?? {},
          expires_in_seconds: Number(n.config['expires_in_seconds'] ?? 86400),
          title: n.title,
        },
      };
    }
    return {
      id: n.id,
      type: 'action',
      config: {
        action_type: actionType,
        params: n.config['params'] ?? {},
        title: n.title,
      },
    };
  });

  return {
    trigger: {
      event_name: eventName,
      filter: when?.config['filter'] ?? null,
    },
    nodes,
    edges: client.edges,
  };
}

export function fromEngineGraph(raw: Record<string, unknown> | null | undefined): ClientGraph {
  if (!raw || !Array.isArray(raw['nodes'])) return emptyClientGraph();
  const nodesIn = raw['nodes'] as Array<{ id: string; type: string; config?: Record<string, unknown> }>;
  const edges = (raw['edges'] as ClientGraph['edges']) ?? [];
  const trigger = raw['trigger'] as { event_name?: string } | undefined;

  const nodes: ClientNode[] = nodesIn.map((n) => {
    const cfg = n.config ?? {};
    const title = String(cfg['title'] ?? n.id);
    if (n.type === 'trigger') {
      return {
        id: n.id,
        kind: 'WHEN',
        title: title === n.id ? eventTitle(trigger?.event_name ?? String(cfg['event_name'] ?? '')) : title,
        subtitle: 'Starts this automation',
        config: { event_name: trigger?.event_name ?? cfg['event_name'] ?? '', ...cfg },
      };
    }
    if (n.type === 'condition') {
      return { id: n.id, kind: 'IF', title, subtitle: 'Check a condition', config: cfg };
    }
    if (n.type === 'delay') {
      return {
        id: n.id,
        kind: 'WAIT',
        title: title === n.id ? waitTitle(cfg) : title,
        subtitle: 'Pause before continuing',
        config: cfg,
      };
    }
    if (n.type === 'approval') {
      return {
        id: n.id,
        kind: 'APPROVAL',
        title,
        subtitle: RISK_LABEL.B,
        config: cfg,
      };
    }
    if (n.type === 'branch') {
      return { id: n.id, kind: 'ELSE', title: title || 'Otherwise', config: cfg };
    }
    const actionType = String(cfg['action_type'] ?? 'task.create');
    return {
      id: n.id,
      kind: 'THEN',
      title,
      subtitle: RISK_LABEL[actionRisk(actionType)],
      config: cfg,
    };
  });

  return { nodes, edges };
}

function eventTitle(name: string): string {
  const map: Record<string, string> = {
    'crm.lead.created': 'New Lead Created',
    'crm.deal.won': 'Deal Won',
    'crm.deal.stage_changed': 'Deal Stage Changed',
    'finance.invoice.overdue': 'Invoice Overdue',
    'crm.quote.accepted': 'Quote Accepted',
  };
  return map[name] || name || 'When something happens';
}

function waitTitle(cfg: Record<string, unknown>): string {
  const amount = cfg['amount'] ?? 1;
  const unit = cfg['unit'] ?? 'hours';
  return `${amount} ${unit}`;
}

export interface ValidationIssue {
  message: string;
  nodeId?: string;
}

export function validateClientGraph(graph: ClientGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const when = graph.nodes.filter((n) => n.kind === 'WHEN');
  if (when.length === 0) {
    issues.push({ message: 'Add a starting event — when should this automation begin?' });
  } else if (!String(when[0]!.config['event_name'] ?? '').trim()) {
    issues.push({ message: 'Choose what starts this automation.', nodeId: when[0]!.id });
  }

  const ids = new Set(graph.nodes.map((n) => n.id));
  for (const e of graph.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) {
      issues.push({ message: 'This step isn’t connected to anything yet.' });
    }
  }

  // reachable from WHEN
  if (when[0]) {
    const reach = new Set<string>([when[0].id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of graph.edges) {
        if (reach.has(e.from) && !reach.has(e.to)) {
          reach.add(e.to);
          changed = true;
        }
      }
    }
    for (const n of graph.nodes) {
      if (n.kind !== 'WHEN' && !reach.has(n.id)) {
        issues.push({
          message: 'This step can never run — connect it or remove it.',
          nodeId: n.id,
        });
      }
    }
  }

  for (const n of graph.nodes) {
    if (n.kind === 'THEN' || n.kind === 'APPROVAL') {
      const actionType = String(n.config['action_type'] ?? '');
      if (!actionType) {
        issues.push({ message: 'Choose what this step should do.', nodeId: n.id });
        continue;
      }
      const risk = actionRisk(actionType);
      if (risk === 'C') {
        issues.push({
          message: 'Deleting customer data can’t be automated.',
          nodeId: n.id,
        });
      }
      if (n.kind === 'THEN' && actionType === 'task.create') {
        const params = (n.config['params'] as Record<string, unknown>) ?? {};
        if (!params['assignee_id'] && !params['assignee_label']) {
          // soft: allow draft save, warn for publish via assignee_label placeholder
          if (!params['title']) {
            issues.push({ message: 'Add a task title.', nodeId: n.id });
          }
        }
      }
      if (n.kind === 'THEN' && risk === 'B') {
        // OK — will map to approval step
      }
    }
    if (n.kind === 'WAIT') {
      const amount = Number(n.config['amount'] ?? 0);
      if (!amount || amount < 1) {
        issues.push({ message: 'Wait time must be at least 1 minute.', nodeId: n.id });
      }
    }
    if (n.kind === 'IF') {
      if (!n.config['path']) {
        issues.push({ message: 'Choose what to check in this condition.', nodeId: n.id });
      }
    }
  }

  return issues;
}

/** Linear helper: append node after last */
export function appendLinear(graph: ClientGraph, node: ClientNode): ClientGraph {
  const nodes = [...graph.nodes, node];
  const edges = [...graph.edges];
  if (graph.nodes.length > 0) {
    const prev = graph.nodes[graph.nodes.length - 1]!;
    edges.push({ from: prev.id, to: node.id });
  }
  return { nodes, edges };
}
