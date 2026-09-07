import { describe, expect, it } from 'vitest';
import { mapFieldValuesToDeal } from '../deals/field-map';
import { productLabelFromFieldValues } from './item-display';

describe('pipeline item display mapping', () => {
  it('prefers human name over empty and maps amount currency', () => {
    const mapped = mapFieldValuesToDeal({
      name: 'Enterprise roll-out',
      amount: '12500.00',
      currency: 'INR',
      owner_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(mapped.name).toBe('Enterprise roll-out');
    expect(mapped.amount).toBe('12500.00');
    expect(mapped.currency).toBe('INR');
  });

  it('falls back to Untitled deal when name missing', () => {
    expect(mapFieldValuesToDeal({}).name).toBe('Untitled deal');
  });

  it('maps probability from field_values', () => {
    expect(mapFieldValuesToDeal({ probability: 40 }).probability).toBe(40);
  });

  it('reads product label only from known field keys', () => {
    expect(productLabelFromFieldValues({ product_name: 'Hosting Plan' })).toBe('Hosting Plan');
    expect(productLabelFromFieldValues({ sku: 'SKU-1' })).toBe('SKU-1');
    expect(productLabelFromFieldValues({ random: 'nope' })).toBeNull();
    expect(productLabelFromFieldValues(null)).toBeNull();
  });
});
