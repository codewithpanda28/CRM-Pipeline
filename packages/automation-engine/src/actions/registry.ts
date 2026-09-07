/**
 * Action registry — Class A/B/C (ADR-027).
 * Round 1: task.create, notification.internal (A); critical.stub (B); Class C blocked.
 */
export type ActionClass = 'A' | 'B' | 'C';

export interface ActionDefinition {
  key: string;
  class: ActionClass;
  description: string;
  /** Reserved for Round 2 adapters — not executable in R1 */
  reserved?: boolean;
}

const REGISTRY: Record<string, ActionDefinition> = {
  'task.create': {
    key: 'task.create',
    class: 'A',
    description: 'Create an internal CRM task',
  },
  'notification.internal': {
    key: 'notification.internal',
    class: 'A',
    description: 'Send internal in-app notification to a user',
  },
  'critical.stub': {
    key: 'critical.stub',
    class: 'B',
    description: 'ADR-027 verification stub — executes approved snapshot only',
  },
  // Class C — registered for hard-block only
  'data.purge': { key: 'data.purge', class: 'C', description: 'Destructive purge' },
  'config.privileged': { key: 'config.privileged', class: 'C', description: 'Privileged config' },
  'billing.platform.mutate': {
    key: 'billing.platform.mutate',
    class: 'C',
    description: 'Platform World-1 billing',
  },
  'approval.auto_approve': {
    key: 'approval.auto_approve',
    class: 'C',
    description: 'Auto-approve another approval',
  },
  'ai.execute_critical': {
    key: 'ai.execute_critical',
    class: 'C',
    description: 'AI direct critical execute',
  },
  // Round 2 seams — reserved, not executable
  'voice.call.enqueue': {
    key: 'voice.call.enqueue',
    class: 'B',
    description: 'Voice adapter seam',
    reserved: true,
  },
  'whatsapp.template.send': {
    key: 'whatsapp.template.send',
    class: 'B',
    description: 'WhatsApp adapter seam',
    reserved: true,
  },
};

export function getActionDefinition(key: string): ActionDefinition | null {
  return REGISTRY[key] ?? null;
}

export function getActionClass(key: string): ActionClass | null {
  return REGISTRY[key]?.class ?? null;
}

export function assertPublishableAction(key: string): void {
  const def = getActionDefinition(key);
  if (!def) throw new Error(`UNKNOWN_ACTION:${key}`);
  if (def.class === 'C') throw new Error(`CLASS_C_BLOCKED:${key}`);
  if (def.reserved) throw new Error(`ACTION_NOT_IMPLEMENTED:${key}`);
}

export function listActions(): ActionDefinition[] {
  return Object.values(REGISTRY);
}
