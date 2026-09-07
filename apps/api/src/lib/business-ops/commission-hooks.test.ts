import { describe, expect, it } from 'vitest';

/** Pure helpers mirroring commission hook meta sanitization. */
function sanitizeHookMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const next = { ...meta };
  delete next.commission_amount;
  delete next.amount_calculated;
  delete next.payout;
  return next;
}

function hookIdempotencyKey(parts: {
  workspaceId: string;
  eventType: string;
  sourceId: string;
  employeeId: string;
}): string {
  return `${parts.workspaceId}|${parts.eventType}|${parts.sourceId}|${parts.employeeId}`;
}

describe('commission hook contracts', () => {
  it('strips calculated amount keys from meta', () => {
    expect(
      sanitizeHookMeta({
        invoice_id: 'x',
        commission_amount: 99,
        payout: 1,
        amount_calculated: 50,
      }),
    ).toEqual({ invoice_id: 'x' });
  });

  it('builds stable idempotency key', () => {
    const a = hookIdempotencyKey({
      workspaceId: 'w',
      eventType: 'deal.won',
      sourceId: 'd1',
      employeeId: 'e1',
    });
    const b = hookIdempotencyKey({
      workspaceId: 'w',
      eventType: 'deal.won',
      sourceId: 'd1',
      employeeId: 'e1',
    });
    expect(a).toBe(b);
  });
});
