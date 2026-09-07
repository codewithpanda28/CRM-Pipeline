import { describe, expect, it } from 'vitest';
import {
  buildDealCustomFields,
  defaultOpenStageId,
  expectedCloseToIso,
  validateDealCreateForm,
  type DealCreateFormValues,
} from './deal-create-form';

const base: DealCreateFormValues = {
  name: 'Acme expansion',
  customerPartyId: 'party-1',
  amount: '1000',
  currency: 'INR',
  stageId: 'stage-1',
  probability: '40',
  ownerId: 'user-1',
  expectedClose: '',
  contactId: '',
  companyId: '',
  leadId: '',
  productLabel: '',
  nextActionTitle: '',
  nextActionDue: '',
  notes: '',
};

describe('validateDealCreateForm', () => {
  it('passes a complete canonical form', () => {
    expect(validateDealCreateForm(base)).toEqual({});
  });

  it('requires name, customer, stage, owner', () => {
    const errors = validateDealCreateForm({
      ...base,
      name: '  ',
      customerPartyId: '',
      stageId: '',
      ownerId: '',
    });
    expect(errors.name).toBeTruthy();
    expect(errors.customer).toBeTruthy();
    expect(errors.stage).toBeTruthy();
    expect(errors.owner).toBeTruthy();
  });

  it('validates amount, currency, probability', () => {
    expect(validateDealCreateForm({ ...base, amount: '-1' }).amount).toBeTruthy();
    expect(validateDealCreateForm({ ...base, currency: 'IN' }).currency).toBeTruthy();
    expect(validateDealCreateForm({ ...base, probability: '101' }).probability).toBeTruthy();
    expect(validateDealCreateForm({ ...base, probability: '40.5' }).probability).toBeTruthy();
  });

  it('allows zero amount', () => {
    expect(validateDealCreateForm({ ...base, amount: '0' })).toEqual({});
  });
});

describe('defaultOpenStageId', () => {
  const stages = [
    { id: 'w', is_won: true, is_lost: false },
    { id: 'a', is_won: false, is_lost: false },
    { id: 'l', is_won: false, is_lost: true },
  ];
  it('prefers non-won/non-lost', () => {
    expect(defaultOpenStageId(stages)).toBe('a');
  });
  it('honors preferred when valid', () => {
    expect(defaultOpenStageId(stages, 'l')).toBe('l');
  });
});

describe('expectedCloseToIso / custom fields', () => {
  it('converts date-only to ISO', () => {
    expect(expectedCloseToIso('2026-09-15')).toBe('2026-09-15T00:00:00.000Z');
    expect(expectedCloseToIso('')).toBeNull();
  });
  it('stores notes and product_name', () => {
    expect(
      buildDealCustomFields({
        ...base,
        notes: 'Call next week',
        productLabel: 'Pro plan',
      }),
    ).toEqual({ notes: 'Call next week', product_name: 'Pro plan' });
  });
});
