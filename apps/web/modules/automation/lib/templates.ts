import type { ClientGraph } from './client-graph';
import { newId } from './client-graph';

export interface AutomationTemplate {
  id: string;
  name: string;
  outcome: string;
  category: string;
  industry: string[];
  riskSummary: string;
  explanation: string[];
  buildGraph: () => ClientGraph;
}

function linear(nodes: ClientGraph['nodes']): ClientGraph {
  const edges: ClientGraph['edges'] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ from: nodes[i]!.id, to: nodes[i + 1]!.id });
  }
  return { nodes, edges };
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'never-miss-lead',
    name: 'Never miss a new lead',
    outcome: 'Assign, welcome, and follow up so no lead goes cold.',
    category: 'Sales',
    industry: ['General B2B Sales', 'Real Estate', 'Agency'],
    riskSummary: 'Runs automatically for assignment and tasks. Customer messages may need approval.',
    explanation: [
      'When a new lead is created',
      'Assign it to a salesperson',
      'Send a welcome message (may need approval)',
      'Create a follow-up task',
    ],
    buildGraph: () => {
      const w = newId('when');
      const a1 = newId('then');
      const a2 = newId('then');
      const a3 = newId('then');
      return linear([
        {
          id: w,
          kind: 'WHEN',
          title: 'New Lead Created',
          subtitle: 'Starts this automation',
          config: { event_name: 'crm.lead.created' },
        },
        {
          id: a1,
          kind: 'THEN',
          title: 'Assign Salesperson',
          subtitle: 'Runs automatically',
          config: {
            action_type: 'task.create',
            params: { title: 'Own new lead', assignee_label: 'Selected salesperson' },
          },
        },
        {
          id: a2,
          kind: 'APPROVAL',
          title: 'Send Welcome Message',
          subtitle: 'Needs your approval',
          config: {
            action_type: 'critical.stub',
            params: { message: 'Welcome — thanks for reaching out.' },
            expires_in_seconds: 86400,
          },
        },
        {
          id: a3,
          kind: 'THEN',
          title: 'Create Follow-up Task',
          subtitle: 'Runs automatically',
          config: {
            action_type: 'task.create',
            params: { title: 'Follow up with new lead' },
          },
        },
      ]);
    },
  },
  {
    id: 'unpaid-invoice',
    name: 'Follow up on unpaid invoices',
    outcome: 'Remind your team and escalate overdue invoices safely.',
    category: 'Finance',
    industry: ['General B2B Sales', 'CA/Professional Services', 'Agency'],
    riskSummary: 'Staff notifications run automatically. Critical customer outreach needs approval.',
    explanation: [
      'When an invoice becomes overdue',
      'Notify your team',
      'Ask for approval before customer outreach',
      'Create an escalation task',
    ],
    buildGraph: () => {
      const w = newId('when');
      const t1 = newId('then');
      const ap = newId('appr');
      const t2 = newId('then');
      return linear([
        {
          id: w,
          kind: 'WHEN',
          title: 'Invoice Overdue',
          subtitle: 'Starts this automation',
          config: { event_name: 'finance.invoice.overdue' },
        },
        {
          id: t1,
          kind: 'THEN',
          title: 'Notify Staff',
          subtitle: 'Runs automatically',
          config: {
            action_type: 'notification.internal',
            params: { title: 'Invoice overdue', body: 'An invoice needs follow-up.' },
          },
        },
        {
          id: ap,
          kind: 'APPROVAL',
          title: 'Customer reminder',
          subtitle: 'Needs your approval',
          config: { action_type: 'critical.stub', params: { kind: 'invoice_reminder' } },
        },
        {
          id: t2,
          kind: 'THEN',
          title: 'Escalate to Manager',
          subtitle: 'Runs automatically',
          config: {
            action_type: 'task.create',
            params: { title: 'Escalate overdue invoice' },
          },
        },
      ]);
    },
  },
  {
    id: 'quote-accepted',
    name: 'Convert accepted quote into next business step',
    outcome: 'Move from accepted quote to invoice follow-through and tasks.',
    category: 'Sales',
    industry: ['Agency', 'Manufacturing/Distribution', 'Construction'],
    riskSummary: 'Internal tasks run automatically. Money documents stay in Finance.',
    explanation: [
      'When a quote is accepted',
      'Notify the owner',
      'Create a kickoff task',
    ],
    buildGraph: () => {
      const w = newId('when');
      const t1 = newId('then');
      const t2 = newId('then');
      return linear([
        {
          id: w,
          kind: 'WHEN',
          title: 'Quote Accepted',
          subtitle: 'Starts this automation',
          config: { event_name: 'crm.quote.accepted' },
        },
        {
          id: t1,
          kind: 'THEN',
          title: 'Notify Owner',
          subtitle: 'Runs automatically',
          config: {
            action_type: 'notification.internal',
            params: { title: 'Quote accepted', body: 'Prepare the next commercial step.' },
          },
        },
        {
          id: t2,
          kind: 'THEN',
          title: 'Create Kickoff Task',
          subtitle: 'Runs automatically',
          config: { action_type: 'task.create', params: { title: 'Kick off accepted quote' } },
        },
      ]);
    },
  },
  {
    id: 'appointment-remind',
    name: 'Remind customers before appointments',
    outcome: 'Internal reminder before an appointment window.',
    category: 'Appointments',
    industry: ['Salon/Clinic/Appointment', 'Automobile/Workshop', 'Education'],
    riskSummary: 'Staff reminders run automatically in Round 2A.',
    explanation: [
      'When a deal stage changes (appointment set)',
      'Wait before the appointment',
      'Notify staff to confirm',
    ],
    buildGraph: () => {
      const w = newId('when');
      const wait = newId('wait');
      const t1 = newId('then');
      return linear([
        {
          id: w,
          kind: 'WHEN',
          title: 'Deal Stage Changed',
          subtitle: 'Starts this automation',
          config: { event_name: 'crm.deal.stage_changed' },
        },
        {
          id: wait,
          kind: 'WAIT',
          title: '24 hours',
          subtitle: 'Pause before continuing',
          config: { amount: 24, unit: 'hours' },
        },
        {
          id: t1,
          kind: 'THEN',
          title: 'Remind Staff',
          subtitle: 'Runs automatically',
          config: {
            action_type: 'notification.internal',
            params: { title: 'Upcoming appointment', body: 'Confirm with the customer.' },
          },
        },
      ]);
    },
  },
  {
    id: 'after-sales-call',
    name: 'Follow up after a sales call',
    outcome: 'Create the next CRM task after a call outcome (Voice connects in Round 2B).',
    category: 'Sales',
    industry: ['Real Estate', 'Recruitment', 'General B2B Sales'],
    riskSummary: 'Uses deal stage as a stand-in until Voice events are connected.',
    explanation: [
      'When a deal stage changes after a call',
      'Create a follow-up task',
      'Notify the owner',
    ],
    buildGraph: () => {
      const w = newId('when');
      const t1 = newId('then');
      const t2 = newId('then');
      return linear([
        {
          id: w,
          kind: 'WHEN',
          title: 'Deal Stage Changed',
          subtitle: 'Starts this automation',
          config: { event_name: 'crm.deal.stage_changed' },
        },
        {
          id: t1,
          kind: 'THEN',
          title: 'Create Follow-up Task',
          subtitle: 'Runs automatically',
          config: { action_type: 'task.create', params: { title: 'Post-call follow-up' } },
        },
        {
          id: t2,
          kind: 'THEN',
          title: 'Notify Owner',
          subtitle: 'Runs automatically',
          config: {
            action_type: 'notification.internal',
            params: { title: 'Call follow-up', body: 'Complete the next step with the customer.' },
          },
        },
      ]);
    },
  },
];

export function getTemplate(id: string): AutomationTemplate | undefined {
  return AUTOMATION_TEMPLATES.find((t) => t.id === id);
}
