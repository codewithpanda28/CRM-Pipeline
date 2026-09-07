import { describe, expect, it } from 'vitest';
import { computeDocumentTotals, computeLine } from './totals';
import { roundMoneyHalfUp } from '../crm-money';

describe('quote totals rounding (half-up 2dp)', () => {
  it('rounds half-up to 2dp for clean decimals', () => {
    expect(roundMoneyHalfUp(10)).toBe('10.00');
    expect(roundMoneyHalfUp(10.1)).toBe('10.10');
    expect(roundMoneyHalfUp(10.129)).toBe('10.13');
  });

  it('computes line with GST intra CGST+SGST', () => {
    const line = computeLine(
      {
        name_snapshot: 'Consulting',
        quantity: '1',
        unit_price: '1000.00',
        tax_rate: '18',
        tax_type: 'gst',
      },
      0,
      { placeOfSupplyIntra: true },
    );
    expect(line.taxable_amount).toBe('1000.00');
    expect(line.tax_amount).toBe('180.00');
    expect(line.line_total).toBe('1180.00');
    expect((line.tax_breakup as { cgst: { amount: string } }).cgst.amount).toBe('90.00');
    expect((line.tax_breakup as { sgst: { amount: string } }).sgst.amount).toBe('90.00');
  });

  it('computes IGST for inter-state', () => {
    const line = computeLine(
      {
        name_snapshot: 'License',
        quantity: '2',
        unit_price: '500',
        tax_rate: '18',
        tax_type: 'gst',
      },
      0,
      { placeOfSupplyIntra: false },
    );
    expect(line.taxable_amount).toBe('1000.00');
    expect((line.tax_breakup as { igst: { amount: string } }).igst.amount).toBe('180.00');
  });

  it('snapshots product list price when unit_price omitted', () => {
    const line = computeLine(
      {
        _product: {
          sku: 'SKU-1',
          name: 'Widget',
          description: null,
          unit: 'each',
          list_price: '99.50',
        },
        quantity: '1',
        tax_type: 'none',
      },
      0,
    );
    expect(line.name_snapshot).toBe('Widget');
    expect(line.sku_snapshot).toBe('SKU-1');
    expect(line.unit_price).toBe('99.50');
  });

  it('document totals sum rounded lines', () => {
    const doc = computeDocumentTotals(
      [
        { name_snapshot: 'A', quantity: '1', unit_price: '100', tax_rate: '18', tax_type: 'gst' },
        { name_snapshot: 'B', quantity: '1', unit_price: '50', tax_rate: '18', tax_type: 'gst' },
      ],
      { placeOfSupplyIntra: true },
    );
    expect(doc.subtotal).toBe('150.00');
    expect(doc.tax_amount).toBe('27.00');
    expect(doc.total).toBe('177.00');
  });
});
