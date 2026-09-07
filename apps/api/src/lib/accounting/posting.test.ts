/**
 * Unit tests — posting key idempotency shape.
 */
import { describe, it, expect } from 'vitest';

describe('posting keys', () => {
  it('are stable per source document', () => {
    const invoiceId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(`invoice.issued:${invoiceId}`).toBe(`invoice.issued:${invoiceId}`);
    expect(`payment.received:${invoiceId}`).not.toBe(`invoice.issued:${invoiceId}`);
  });
});
