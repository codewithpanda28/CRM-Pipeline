/** Client-side validation helpers for DealCreateModal (unit-tested). */

export type DealCreateFormValues = {
  name: string;
  customerPartyId: string;
  amount: string;
  currency: string;
  stageId: string;
  probability: string;
  ownerId: string;
  expectedClose: string;
  contactId: string;
  companyId: string;
  leadId: string;
  productLabel: string;
  nextActionTitle: string;
  nextActionDue: string;
  notes: string;
};

export type DealCreateFieldErrors = Partial<
  Record<
    | 'name'
    | 'customer'
    | 'amount'
    | 'currency'
    | 'stage'
    | 'probability'
    | 'owner'
    | 'expectedClose',
    string
  >
>;

export function defaultOpenStageId(
  stages: Array<{ id: string; is_won: boolean; is_lost: boolean }>,
  preferred?: string | null,
): string {
  if (preferred && stages.some((s) => s.id === preferred)) return preferred;
  const open = stages.find((s) => !s.is_won && !s.is_lost);
  return open?.id ?? stages[0]?.id ?? '';
}

export function validateDealCreateForm(values: DealCreateFormValues): DealCreateFieldErrors {
  const errors: DealCreateFieldErrors = {};
  if (!values.name.trim()) errors.name = 'Deal name is required';
  if (!values.customerPartyId) errors.customer = 'Customer is required';
  if (!values.stageId) errors.stage = 'Stage is required';
  if (!values.ownerId) errors.owner = 'Salesperson is required';

  const currency = values.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) errors.currency = 'Currency must be a 3-letter code';

  const amountRaw = values.amount.trim() === '' ? '0' : values.amount.trim();
  const amount = Number(amountRaw.replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount < 0) errors.amount = 'Amount must be 0 or greater';

  const prob = Number(values.probability);
  if (!Number.isInteger(prob) || prob < 0 || prob > 100) {
    errors.probability = 'Probability must be an integer from 0 to 100';
  }

  if (values.expectedClose.trim()) {
    const d = new Date(values.expectedClose);
    if (Number.isNaN(d.getTime())) errors.expectedClose = 'Expected close must be a valid date';
  }

  return errors;
}

export function expectedCloseToIso(dateOnly: string): string | null {
  const t = dateOnly.trim();
  if (!t) return null;
  // HTML date → start of day UTC ISO for z.string().datetime()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    return `${t}T00:00:00.000Z`;
  }
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function buildDealCustomFields(values: DealCreateFormValues): Record<string, unknown> {
  const cf: Record<string, unknown> = {};
  if (values.notes.trim()) cf['notes'] = values.notes.trim();
  if (values.productLabel.trim()) {
    cf['product_name'] = values.productLabel.trim();
  }
  return cf;
}
