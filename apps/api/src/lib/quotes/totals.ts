/**
 * Quote line / document totals.
 *
 * Rounding: half-up to 2 decimal places at each money step (see crm-money).
 * Client-provided subtotal/tax/total are ignored — server recomputes.
 */
import {
  parseMoneyAmount,
  parseQuantity,
  roundMoneyHalfUp,
  moneyToNumber,
  addMoney,
} from '../crm-money';

export type TaxScheme = 'none' | 'in_gst' | 'vat' | 'other';

export interface LineInput {
  product_id?: string | null;
  sku_snapshot?: string | null;
  name_snapshot?: string;
  description_snapshot?: string | null;
  unit_snapshot?: string;
  quantity?: unknown;
  unit_price?: unknown;
  discount_amount?: unknown;
  discount_percent?: unknown;
  tax_rate?: unknown;
  tax_type?: string | null;
  tax_breakup?: Record<string, unknown> | null;
  hsn_sac?: string | null;
  custom_fields?: Record<string, unknown>;
  /** When product loaded — used to fill snapshots */
  _product?: {
    sku: string;
    name: string;
    description: string | null;
    unit: string;
    list_price: string;
  } | null;
}

export interface ComputedLine {
  product_id: string | null;
  position: number;
  sku_snapshot: string | null;
  name_snapshot: string;
  description_snapshot: string | null;
  unit_snapshot: string;
  quantity: string;
  unit_price: string;
  discount_amount: string;
  discount_percent: string | null;
  taxable_amount: string;
  tax_rate: string | null;
  tax_amount: string;
  line_total: string;
  tax_type: string | null;
  tax_breakup: Record<string, unknown>;
  hsn_sac: string | null;
  custom_fields: Record<string, unknown>;
}

export interface DocumentTotals {
  subtotal: string;
  discount_total: string;
  taxable_amount: string;
  tax_amount: string;
  total: string;
  tax_breakup: Record<string, unknown>;
  lines: ComputedLine[];
}

function buildGstBreakup(
  taxable: number,
  taxRatePct: number,
  scheme: TaxScheme,
  placeOfSupplyIntra: boolean | null,
): { taxAmount: string; breakup: Record<string, unknown> } {
  const tax = moneyToNumber(roundMoneyHalfUp((taxable * taxRatePct) / 100));
  if (scheme !== 'in_gst' || taxRatePct <= 0) {
    return {
      taxAmount: roundMoneyHalfUp(tax),
      breakup: scheme === 'none' ? {} : { scheme, rate: roundMoneyHalfUp(taxRatePct), amount: roundMoneyHalfUp(tax) },
    };
  }
  // India GST pack as data: intra → CGST+SGST split; inter → IGST
  const halfRate = taxRatePct / 2;
  if (placeOfSupplyIntra === false) {
    return {
      taxAmount: roundMoneyHalfUp(tax),
      breakup: {
        scheme: 'in_gst',
        cgst: { rate: roundMoneyHalfUp(0), amount: '0.00' },
        sgst: { rate: roundMoneyHalfUp(0), amount: '0.00' },
        igst: { rate: roundMoneyHalfUp(taxRatePct), amount: roundMoneyHalfUp(tax) },
      },
    };
  }
  // default / intra
  const halfAmt = moneyToNumber(roundMoneyHalfUp(tax / 2));
  const cgst = roundMoneyHalfUp(halfAmt);
  const sgst = roundMoneyHalfUp(tax - moneyToNumber(cgst));
  return {
    taxAmount: roundMoneyHalfUp(moneyToNumber(cgst) + moneyToNumber(sgst)),
    breakup: {
      scheme: 'in_gst',
      cgst: { rate: roundMoneyHalfUp(halfRate), amount: cgst },
      sgst: { rate: roundMoneyHalfUp(halfRate), amount: sgst },
      igst: { rate: '0.00', amount: '0.00' },
    },
  };
}

export function computeLine(
  input: LineInput,
  position: number,
  opts?: { placeOfSupplyIntra?: boolean | null },
): ComputedLine {
  const product = input._product;
  const qtyStr = parseQuantity(input.quantity);
  const qty = Number(qtyStr);
  let unitPrice = parseMoneyAmount(
    input.unit_price !== undefined && input.unit_price !== null && input.unit_price !== ''
      ? input.unit_price
      : product?.list_price ?? 0,
  );
  const gross = moneyToNumber(roundMoneyHalfUp(qty * moneyToNumber(unitPrice)));

  let discountAmount = parseMoneyAmount(input.discount_amount ?? 0);
  let discountPercent: string | null =
    input.discount_percent != null && input.discount_percent !== ''
      ? roundMoneyHalfUp(Number(input.discount_percent))
      : null;
  if (discountPercent != null && (input.discount_amount == null || input.discount_amount === '')) {
    discountAmount = roundMoneyHalfUp((gross * moneyToNumber(discountPercent)) / 100);
  }
  if (moneyToNumber(discountAmount) > gross) discountAmount = roundMoneyHalfUp(gross);

  const taxableNum = Math.max(0, gross - moneyToNumber(discountAmount));
  const taxable = roundMoneyHalfUp(taxableNum);

  const taxRate =
    input.tax_rate != null && input.tax_rate !== ''
      ? roundMoneyHalfUp(Number(input.tax_rate))
      : null;
  const taxType = input.tax_type ?? (taxRate && moneyToNumber(taxRate) > 0 ? 'gst' : 'none');
  const scheme: TaxScheme =
    taxType === 'gst' || taxType === 'in_gst'
      ? 'in_gst'
      : taxType === 'vat'
        ? 'vat'
        : taxType === 'none' || !taxType
          ? 'none'
          : 'other';

  let taxAmount = '0.00';
  let taxBreakup: Record<string, unknown> = input.tax_breakup ?? {};

  if (taxRate != null && moneyToNumber(taxRate) > 0) {
    const computed = buildGstBreakup(
      moneyToNumber(taxable),
      moneyToNumber(taxRate),
      scheme,
      opts?.placeOfSupplyIntra ?? null,
    );
    taxAmount = computed.taxAmount;
    taxBreakup = { ...taxBreakup, ...computed.breakup };
  } else if (taxBreakup && typeof taxBreakup === 'object') {
    // Sum known amount fields if client sent structured breakup without rate
    let sum = 0;
    for (const key of ['cgst', 'sgst', 'igst', 'vat']) {
      const part = (taxBreakup as Record<string, unknown>)[key];
      if (part && typeof part === 'object' && 'amount' in (part as object)) {
        sum += moneyToNumber(parseMoneyAmount((part as { amount: unknown }).amount));
      }
    }
    if (sum > 0) taxAmount = roundMoneyHalfUp(sum);
  }

  const lineTotal = addMoney(taxable, taxAmount);

  return {
    product_id: input.product_id ?? null,
    position,
    sku_snapshot: input.sku_snapshot ?? product?.sku ?? null,
    name_snapshot: (input.name_snapshot?.trim() || product?.name || 'Line item'),
    description_snapshot: input.description_snapshot ?? product?.description ?? null,
    unit_snapshot: input.unit_snapshot ?? product?.unit ?? 'each',
    quantity: qtyStr,
    unit_price: unitPrice,
    discount_amount: discountAmount,
    discount_percent: discountPercent,
    taxable_amount: taxable,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    line_total: lineTotal,
    tax_type: taxType,
    tax_breakup: taxBreakup,
    hsn_sac: input.hsn_sac ?? null,
    custom_fields: input.custom_fields ?? {},
  };
}

export function computeDocumentTotals(
  lineInputs: LineInput[],
  opts?: {
    documentDiscount?: unknown;
    placeOfSupply?: string | null;
    placeOfSupplyIntra?: boolean | null;
    taxScheme?: TaxScheme;
  },
): DocumentTotals {
  const lines = lineInputs.map((l, i) =>
    computeLine(l, i, { placeOfSupplyIntra: opts?.placeOfSupplyIntra ?? null }),
  );

  let subtotal = '0.00';
  let taxAmount = '0.00';
  let linesTotal = '0.00';
  const rollup = {
    scheme: opts?.taxScheme ?? 'in_gst',
    cgst: { amount: '0.00' },
    sgst: { amount: '0.00' },
    igst: { amount: '0.00' },
    place_of_supply: opts?.placeOfSupply ?? null,
  };

  for (const line of lines) {
    subtotal = addMoney(subtotal, line.taxable_amount);
    taxAmount = addMoney(taxAmount, line.tax_amount);
    linesTotal = addMoney(linesTotal, line.line_total);
    const b = line.tax_breakup;
    if (b?.cgst && typeof b.cgst === 'object') {
      rollup.cgst.amount = addMoney(
        rollup.cgst.amount,
        parseMoneyAmount((b.cgst as { amount?: unknown }).amount),
      );
    }
    if (b?.sgst && typeof b.sgst === 'object') {
      rollup.sgst.amount = addMoney(
        rollup.sgst.amount,
        parseMoneyAmount((b.sgst as { amount?: unknown }).amount),
      );
    }
    if (b?.igst && typeof b.igst === 'object') {
      rollup.igst.amount = addMoney(
        rollup.igst.amount,
        parseMoneyAmount((b.igst as { amount?: unknown }).amount),
      );
    }
  }

  const discountTotal = parseMoneyAmount(opts?.documentDiscount ?? 0);
  const discNum = Math.min(moneyToNumber(discountTotal), moneyToNumber(linesTotal));
  const disc = roundMoneyHalfUp(discNum);
  const total = roundMoneyHalfUp(moneyToNumber(linesTotal) - moneyToNumber(disc));

  return {
    subtotal,
    discount_total: disc,
    taxable_amount: subtotal,
    tax_amount: taxAmount,
    total,
    tax_breakup: rollup,
    lines,
  };
}
