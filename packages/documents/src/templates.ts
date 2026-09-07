import type { DocumentDocType } from './types';

const SHARED_STYLES = `
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    font-size: 11pt;
    color: #1a1a1a;
    margin: 0;
    padding: 24px 28px;
  }
  .header { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
  .brand { max-width: 55%; }
  .brand-name { font-size: 18pt; font-weight: 700; color: {{primaryColor}}; margin: 0 0 4px; }
  .muted { color: #555; font-size: 9pt; line-height: 1.4; }
  .doc-meta { text-align: right; }
  .doc-title { font-size: 16pt; font-weight: 700; margin: 0 0 6px; letter-spacing: 0.04em; }
  .parties { display: flex; gap: 32px; margin-bottom: 22px; }
  .party { flex: 1; }
  .party h3 { margin: 0 0 6px; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.06em; color: #666; }
  table.lines { width: 100%; border-collapse: collapse; margin: 12px 0 18px; }
  table.lines th {
    background: #f3f4f6;
    text-align: left;
    padding: 8px 6px;
    font-size: 8.5pt;
    border-bottom: 1px solid #d1d5db;
  }
  table.lines td { padding: 7px 6px; border-bottom: 1px solid #e5e7eb; font-size: 9pt; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .totals { width: 280px; margin-left: auto; }
  .totals tr td { padding: 4px 0; }
  .totals .grand td { font-weight: 700; font-size: 11pt; border-top: 1px solid #111; padding-top: 8px; }
  .tax-breakup { margin: 12px 0; font-size: 9pt; }
  .tax-breakup table { border-collapse: collapse; }
  .tax-breakup td, .tax-breakup th { padding: 3px 10px 3px 0; text-align: left; }
  .notes { margin-top: 20px; font-size: 9pt; }
  .footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 8pt; color: #666; }
`;

function docShell(title: string, bodyExtra: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{{documentNumber}} — ${title}</title>
  <style>${SHARED_STYLES}</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      {{#if brandingSnapshot.logo_url}}
        <img src="{{brandingSnapshot.logo_url}}" alt="" style="max-height:48px;max-width:180px;margin-bottom:8px;" />
      {{/if}}
      <p class="brand-name">{{sellerName}}</p>
      <div class="muted">
        {{#if brandingSnapshot.gstin}}GSTIN: {{brandingSnapshot.gstin}}<br/>{{/if}}
        {{#if brandingSnapshot.tax_id}}Tax ID: {{brandingSnapshot.tax_id}}<br/>{{/if}}
        {{sellerAddressHtml}}
        {{#if brandingSnapshot.email}}{{brandingSnapshot.email}}<br/>{{/if}}
        {{#if brandingSnapshot.phone}}{{brandingSnapshot.phone}}{{/if}}
      </div>
    </div>
    <div class="doc-meta">
      <p class="doc-title">${title}</p>
      <div class="muted">
        <strong>#{{documentNumber}}</strong><br/>
        Issue date: {{issueDate}}<br/>
        ${bodyExtra}
        {{#if placeOfSupply}}Place of supply: {{placeOfSupply}}<br/>{{/if}}
      </div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Bill to</h3>
      <div class="muted">
        <strong>{{buyerName}}</strong><br/>
        {{#if buyerGstin}}GSTIN: {{buyerGstin}}<br/>{{/if}}
        {{buyerAddressHtml}}
      </div>
    </div>
  </div>

  <table class="lines">
    <thead>
      <tr>
        <th style="width:28px">#</th>
        <th>Item</th>
        <th>HSN/SAC</th>
        <th class="num">Qty</th>
        <th class="num">Rate</th>
        <th class="num">Tax</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      {{#each lines}}
      <tr>
        <td>{{position}}</td>
        <td>
          <strong>{{name}}</strong>
          {{#if description}}<div class="muted">{{description}}</div>{{/if}}
        </td>
        <td>{{hsnSac}}</td>
        <td class="num">{{quantity}} {{unit}}</td>
        <td class="num">{{unitPrice}}</td>
        <td class="num">{{taxAmount}}{{#if taxRate}} ({{taxRate}}%){{/if}}</td>
        <td class="num">{{lineTotal}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td class="num">{{totals.currency}} {{totals.subtotal}}</td></tr>
    <tr><td>Discount</td><td class="num">{{totals.currency}} {{totals.discountTotal}}</td></tr>
    <tr><td>Taxable</td><td class="num">{{totals.currency}} {{totals.taxableAmount}}</td></tr>
    <tr><td>Tax</td><td class="num">{{totals.currency}} {{totals.taxAmount}}</td></tr>
    {{#if totals.amountPaid}}
    <tr><td>Paid</td><td class="num">{{totals.currency}} {{totals.amountPaid}}</td></tr>
    {{/if}}
    {{#if totals.amountDue}}
    <tr><td>Amount due</td><td class="num">{{totals.currency}} {{totals.amountDue}}</td></tr>
    {{/if}}
    <tr class="grand"><td>Total</td><td class="num">{{totals.currency}} {{totals.total}}</td></tr>
  </table>

  {{#if taxBreakupRows}}
  <div class="tax-breakup">
    <strong>Tax breakup</strong>
    <table>
      <thead><tr><th>Component</th><th>Amount</th></tr></thead>
      <tbody>
        {{#each taxBreakupRows}}
        <tr><td>{{label}}</td><td>{{amount}}</td></tr>
        {{/each}}
      </tbody>
    </table>
  </div>
  {{/if}}

  {{#if reason}}
  <div class="notes"><strong>Reason:</strong> {{reason}}</div>
  {{/if}}
  {{#if notes}}
  <div class="notes"><strong>Notes:</strong> {{notes}}</div>
  {{/if}}
  {{#if terms}}
  <div class="notes"><strong>Terms:</strong> {{terms}}</div>
  {{/if}}

  <div class="footer">
    {{#if brandingSnapshot.footer_note}}{{brandingSnapshot.footer_note}}{{else}}Thank you for your business.{{/if}}
  </div>
</body>
</html>`;
}

export const DEFAULT_TEMPLATES: Record<DocumentDocType, string> = {
  quote: docShell('QUOTE', '{{#if expiryDate}}Valid until: {{expiryDate}}<br/>{{/if}}'),
  invoice: docShell('TAX INVOICE', '{{#if dueDate}}Due date: {{dueDate}}<br/>{{/if}}'),
  credit_note: docShell('CREDIT NOTE', ''),
  debit_note: docShell('DEBIT NOTE', ''),
};

export function getDefaultTemplate(docType: DocumentDocType): string {
  return DEFAULT_TEMPLATES[docType];
}
