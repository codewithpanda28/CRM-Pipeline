/** Legacy short names → canonical namespaced types (EVENTS.md). */
export const EVENT_TYPE_ALIASES: Record<string, string> = {
  'lead.created': 'crm.lead.created',
  'deal.won': 'crm.deal.won',
  'invoice.paid': 'finance.invoice.paid',
  'payment.received': 'finance.payment.received',
  'message.received': 'whatsapp.message.received',
  'workflow_run.failed': 'automation.run.failed',
  'contact.created': 'crm.contact.created',
  'contact.updated': 'crm.contact.updated',
  'deal.created': 'crm.deal.created',
  'deal.stage_changed': 'crm.deal.stage_changed',
  'deal.lost': 'crm.deal.lost',
  'task.created': 'tasks.task.created',
  'task.completed': 'tasks.task.completed',
  'alert.created': 'ops.alert.created',
  'alert.resolved': 'ops.alert.resolved',
  'item.moved': 'crm.item.moved',
};

export function canonicalizeEventType(type: string): string {
  return EVENT_TYPE_ALIASES[type] ?? type;
}
