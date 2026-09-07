import type { LeadStatus } from '@vencore/db';

const OPEN: LeadStatus[] = ['new', 'contacted', 'qualified'];
const SIDE: LeadStatus[] = ['unqualified', 'lost', 'abandoned'];

const ALLOWED: Record<LeadStatus, ReadonlySet<LeadStatus>> = {
  new: new Set(['contacted', 'qualified', 'unqualified', 'lost', 'abandoned']),
  contacted: new Set(['new', 'qualified', 'unqualified', 'lost', 'abandoned']),
  qualified: new Set(['contacted', 'unqualified', 'lost', 'abandoned']),
  unqualified: new Set(['new', 'contacted', 'qualified']),
  lost: new Set(['new', 'contacted', 'qualified']),
  abandoned: new Set(['new', 'contacted', 'qualified']),
  // converted only via convert endpoint
  converted: new Set(),
};

export function isLeadStatus(v: unknown): v is LeadStatus {
  return (
    typeof v === 'string' &&
    (OPEN.includes(v as LeadStatus) ||
      SIDE.includes(v as LeadStatus) ||
      v === 'converted')
  );
}

export function canTransitionLeadStatus(from: LeadStatus, to: LeadStatus): boolean {
  if (from === to) return true;
  if (to === 'converted') return false; // convert endpoint only
  return ALLOWED[from]?.has(to) ?? false;
}

export function assertLeadStatusTransition(from: LeadStatus, to: LeadStatus): void {
  if (!canTransitionLeadStatus(from, to)) {
    throw Object.assign(new Error(`Invalid lead status transition ${from} → ${to}`), {
      code: 'INVALID_STATUS_TRANSITION',
    });
  }
}

export function isTerminalConverted(status: LeadStatus): boolean {
  return status === 'converted';
}
