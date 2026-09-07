'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { apiFetch } from '@/modules/shared/lib/api';
import {
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  LabeledInput,
  LabeledSelect,
  LabeledTextarea,
  formGrid,
  formSpanFull,
  panelStyle,
  sectionTitleStyle,
  helperStyle,
} from '@/modules/crm/shared/ui';
import { getFinanceProfile, updateFinanceProfile } from '../../lib/api';

type Branding = {
  brand_name?: string | null;
  legal_name?: string | null;
  logo_file_id?: string | null;
  primary_color?: string | null;
  theme?: Record<string, unknown>;
  support?: Record<string, unknown>;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const maxBytes = 600_000;
    const accepted = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!accepted.includes(file.type) && !file.name.match(/\.(png|jpe?g|webp|gif|svg)$/i)) {
      reject(
        new Error(
          `Unsupported format (${file.type || 'unknown'}). Accepted: PNG, JPEG, WebP, GIF, SVG.`,
        ),
      );
      return;
    }
    if (file.size > maxBytes) {
      const kb = Math.round(file.size / 1024);
      reject(
        new Error(
          `Image must be under 600KB (your file is ${kb}KB / ${(file.size / 1024 / 1024).toFixed(2)}MB). Compress or resize, then try again.`,
        ),
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function FinanceSettingsBoard() {
  const getToken = useApiToken();
  const { user, hasPermission } = useAuth();
  const qc = useQueryClient();
  const canEdit = hasPermission('finance:settings');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Business
  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postal, setPostal] = useState('');
  const [country, setCountry] = useState('IN');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [gstin, setGstin] = useState('');
  const [taxScheme, setTaxScheme] = useState('in_gst');
  const [currency, setCurrency] = useState('INR');
  const [placeOfSupply, setPlaceOfSupply] = useState('');

  // Bank / UPI
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [accountType, setAccountType] = useState('');
  const [branch, setBranch] = useState('');
  const [upiId, setUpiId] = useState('');

  // Defaults / footer
  const [invoicePrefix, setInvoicePrefix] = useState('INV');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [defaultTerms, setDefaultTerms] = useState('');
  const [footerNote, setFooterNote] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [supportPhone, setSupportPhone] = useState('');

  // Branding
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrLabel, setQrLabel] = useState('');

  const profileQ = useQuery({
    queryKey: ['finance-profile'],
    queryFn: async () => getFinanceProfile(await getToken()),
    enabled: Boolean(user),
  });

  const brandingQ = useQuery({
    queryKey: ['tenant-branding'],
    queryFn: async () =>
      apiFetch<{ data: Branding; error: null }>('/api/tenant/branding', { token: await getToken() }),
    enabled: Boolean(user),
  });

  useEffect(() => {
    const p = profileQ.data?.data;
    if (!p) return;
    setLegalName(p.legal_name ?? '');
    setTradeName(p.trade_name ?? '');
    setGstin(p.gstin ?? '');
    setTaxScheme(p.default_tax_scheme ?? 'in_gst');
    setCurrency(p.default_currency ?? 'INR');
    setPlaceOfSupply(p.place_of_supply_default ?? '');
    setInvoicePrefix(p.invoice_prefix ?? 'INV');
    setPaymentTerms(p.default_payment_terms ?? '');
    const addr = (p.address ?? {}) as Record<string, unknown>;
    setLine1(String(addr['line1'] ?? addr['street'] ?? ''));
    setLine2(String(addr['line2'] ?? ''));
    setCity(String(addr['city'] ?? ''));
    setState(String(addr['state'] ?? ''));
    setPostal(String(addr['postal_code'] ?? addr['zip'] ?? ''));
    setCountry(String(addr['country'] ?? 'IN'));
    setEmail(String(addr['email'] ?? (p.metadata as Record<string, unknown> | undefined)?.['email'] ?? ''));
    setPhone(String(addr['phone'] ?? (p.metadata as Record<string, unknown> | undefined)?.['phone'] ?? ''));
    setWebsite(String(addr['website'] ?? ''));
    const bank = (p.bank_details ?? {}) as Record<string, unknown>;
    setBankName(String(bank['bank_name'] ?? ''));
    setAccountName(String(bank['account_name'] ?? ''));
    setAccountNumber(String(bank['account_number'] ?? ''));
    setIfsc(String(bank['ifsc'] ?? ''));
    setAccountType(String(bank['account_type'] ?? ''));
    setBranch(String(bank['branch'] ?? ''));
    setUpiId(String(bank['upi_id'] ?? ''));
    const meta = (p.metadata ?? {}) as Record<string, unknown>;
    setDefaultTerms(String(meta['default_terms'] ?? ''));
    setFooterNote(String(meta['footer_note'] ?? meta['invoice_footer'] ?? ''));
    setSupportEmail(String(meta['support_email'] ?? ''));
    setSupportPhone(String(meta['support_phone'] ?? ''));
    const qr = (meta['payment_qr'] ?? {}) as Record<string, unknown>;
    setQrUrl(typeof qr['url'] === 'string' ? qr['url'] : null);
    setQrLabel(String(qr['label'] ?? ''));
  }, [profileQ.data]);

  useEffect(() => {
    const b = brandingQ.data?.data;
    if (!b) return;
    const theme = b.theme ?? {};
    const url = theme['logo_url'] ?? theme['logoUrl'];
    if (typeof url === 'string' && !url.includes('/platform/branding/')) setLogoUrl(url);
    const support = b.support ?? {};
    if (typeof support['email'] === 'string' && support['email']) setSupportEmail(support['email']);
    if (typeof support['phone'] === 'string' && support['phone']) setSupportPhone(support['phone']);
    if (!legalName && b.legal_name) setLegalName(b.legal_name);
    if (!tradeName && b.brand_name) setTradeName(b.brand_name);
  }, [brandingQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMut = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const address = {
        line1,
        line2,
        city,
        state,
        postal_code: postal,
        country,
        email,
        phone,
        website,
      };
      const bank_details = {
        bank_name: bankName,
        account_name: accountName,
        account_number: accountNumber,
        ifsc,
        account_type: accountType,
        branch,
        upi_id: upiId,
      };
      const metadata = {
        email,
        phone,
        support_email: supportEmail,
        support_phone: supportPhone,
        default_terms: defaultTerms,
        footer_note: footerNote,
        payment_qr: qrUrl ? { url: qrUrl, label: qrLabel || upiId || null } : null,
      };
      await updateFinanceProfile(token, {
        legal_name: legalName || null,
        trade_name: tradeName || null,
        gstin: gstin || null,
        address,
        bank_details,
        default_currency: currency,
        default_tax_scheme: taxScheme,
        default_payment_terms: paymentTerms || null,
        place_of_supply_default: placeOfSupply || null,
        invoice_prefix: invoicePrefix || 'INV',
        metadata,
      });
      const theme = { ...(brandingQ.data?.data?.theme ?? {}) };
      if (logoUrl) theme['logo_url'] = logoUrl;
      else delete theme['logo_url'];
      await apiFetch('/api/tenant/branding', {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          brand_name: tradeName || legalName || 'Business',
          legal_name: legalName || null,
          theme,
          support: { email: supportEmail || null, phone: supportPhone || null },
        }),
      });
    },
    onSuccess: () => {
      setError(null);
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ['finance-profile'] });
      void qc.invalidateQueries({ queryKey: ['tenant-branding'] });
      void qc.invalidateQueries({ queryKey: ['invoice-seller-preview'] });
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (e: Error) => setError(e.message),
  });

  async function onLogoFile(file: File | null) {
    if (!file || !canEdit) return;
    try {
      setLogoUrl(await readFileAsDataUrl(file));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Logo upload failed');
    }
  }

  async function onQrFile(file: File | null) {
    if (!file || !canEdit) return;
    try {
      setQrUrl(await readFileAsDataUrl(file));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'QR upload failed');
    }
  }

  if (!canEdit) {
    return (
      <div style={panelStyle}>
        <PageHeader title="Finance settings" subtitle="You need finance:settings permission to manage invoice branding." />
      </div>
    );
  }

  return (
    <div style={{ minWidth: 0, width: '100%' }}>
      <PageHeader
        title="Finance settings"
        subtitle="Tenant seller identity and invoice branding for your customers (World 2). ThinkAIQ platform logo is never used on customer invoices."
        actions={
          <>
            {saved ? <span style={{ fontSize: 13, color: 'var(--accent)' }}>Saved</span> : null}
            <PrimaryButton type="button" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              Save settings
            </PrimaryButton>
          </>
        }
      />

      {error ? (
        <p role="alert" style={{ color: 'var(--red)', marginBottom: 12 }}>
          {error}
        </p>
      ) : null}

      <section style={{ ...panelStyle, marginBottom: 16 }}>
        <h2 style={sectionTitleStyle}>Business / seller profile</h2>
        <p style={helperStyle}>Appears on invoices issued to your customers.</p>
        <div style={formGrid(200)}>
          <LabeledInput label="Legal / business name" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          <LabeledInput label="Trade / display name" value={tradeName} onChange={(e) => setTradeName(e.target.value)} />
          <LabeledInput label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <LabeledInput label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <LabeledInput label="Website" value={website} onChange={(e) => setWebsite(e.target.value)} />
          <LabeledInput label="GSTIN" value={gstin} onChange={(e) => setGstin(e.target.value)} />
          <LabeledSelect label="Default tax scheme" value={taxScheme} onChange={(e) => setTaxScheme(e.target.value)}>
            <option value="none">None</option>
            <option value="in_gst">India GST</option>
            <option value="vat">VAT</option>
            <option value="other">Other</option>
          </LabeledSelect>
          <LabeledSelect label="Default currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="INR">INR</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="AED">AED</option>
          </LabeledSelect>
          <LabeledInput label="Default place of supply" value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} />
          <div style={formSpanFull()}>
            <div style={formGrid(200)}>
              <LabeledInput label="Address line 1" value={line1} onChange={(e) => setLine1(e.target.value)} />
              <LabeledInput label="Address line 2" value={line2} onChange={(e) => setLine2(e.target.value)} />
              <LabeledInput label="City" value={city} onChange={(e) => setCity(e.target.value)} />
              <LabeledInput label="State" value={state} onChange={(e) => setState(e.target.value)} />
              <LabeledInput label="Postal code" value={postal} onChange={(e) => setPostal(e.target.value)} />
              <LabeledInput label="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
          </div>
        </div>
      </section>

      <section style={{ ...panelStyle, marginBottom: 16 }}>
        <h2 style={sectionTitleStyle}>Logo</h2>
        <p style={helperStyle}>
          Tenant logo only — never the ThinkAIQ platform mark. Max 600KB. Formats: PNG, JPEG, WebP,
          GIF, SVG.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Tenant logo"
              style={{ width: 96, height: 96, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg)' }}
            />
          ) : (
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: 12,
                border: '1px dashed var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text3)',
                fontSize: 12,
              }}
            >
              No logo
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => void onLogoFile(e.target.files?.[0] ?? null)}
            />
            <LabeledInput
              label="Or logo URL"
              value={logoUrl && !logoUrl.startsWith('data:') ? logoUrl : ''}
              onChange={(e) => setLogoUrl(e.target.value || null)}
              placeholder="https://…"
            />
            <SecondaryButton type="button" onClick={() => setLogoUrl(null)}>
              Remove logo
            </SecondaryButton>
          </div>
        </div>
      </section>

      <section style={{ ...panelStyle, marginBottom: 16 }}>
        <h2 style={sectionTitleStyle}>Payment details</h2>
        <div style={formGrid(200)}>
          <LabeledInput label="Bank name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
          <LabeledInput label="Account name" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
          <LabeledInput label="Account number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
          <LabeledInput label="IFSC" value={ifsc} onChange={(e) => setIfsc(e.target.value)} />
          <LabeledInput label="Account type" value={accountType} onChange={(e) => setAccountType(e.target.value)} placeholder="Current / Savings" />
          <LabeledInput label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
          <LabeledInput label="UPI ID" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
        </div>
      </section>

      <section style={{ ...panelStyle, marginBottom: 16 }}>
        <h2 style={sectionTitleStyle}>Payment QR</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrUrl}
              alt="Payment QR"
              style={{ width: 120, height: 120, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 12, background: '#fff' }}
            />
          ) : (
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: 12,
                border: '1px dashed var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text3)',
                fontSize: 12,
              }}
            >
              No QR
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220 }}>
            <input type="file" accept="image/*" onChange={(e) => void onQrFile(e.target.files?.[0] ?? null)} />
            <LabeledInput label="UPI / QR label" value={qrLabel} onChange={(e) => setQrLabel(e.target.value)} />
            <SecondaryButton type="button" onClick={() => setQrUrl(null)}>
              Remove QR
            </SecondaryButton>
          </div>
        </div>
      </section>

      <section style={{ ...panelStyle, marginBottom: 16 }}>
        <h2 style={sectionTitleStyle}>Invoice defaults</h2>
        <div style={formGrid(200)}>
          <LabeledInput label="Invoice prefix / series" value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} />
          <LabeledInput label="Default payment terms" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Net 15" />
        </div>
      </section>

      <section style={panelStyle}>
        <h2 style={sectionTitleStyle}>Footer / terms</h2>
        <div style={formGrid(200)}>
          <div style={formSpanFull()}>
            <LabeledTextarea
              label="Terms & conditions"
              value={defaultTerms}
              onChange={(e) => setDefaultTerms(e.target.value)}
              rows={4}
            />
          </div>
          <div style={formSpanFull()}>
            <LabeledTextarea label="Footer note" value={footerNote} onChange={(e) => setFooterNote(e.target.value)} rows={3} />
          </div>
          <LabeledInput label="Support email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} />
          <LabeledInput label="Support phone" value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} />
        </div>
      </section>
    </div>
  );
}
