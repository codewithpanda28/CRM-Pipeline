'use client';

import type {
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ComponentProps,
} from 'react';
import { FormField, Input, Select, Textarea } from '@/modules/shared/components/ui/FormField';
import { Button } from '@/modules/shared/components/ui/Button';

/** Matches Contacts page content width: full app shell width, no max-width squeeze. */
export const pageShellStyle: CSSProperties = {
  padding: 0,
  width: '100%',
  boxSizing: 'border-box',
  minWidth: 0,
  overflowX: 'hidden',
};

export const panelStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: '20px 20px 16px',
  boxSizing: 'border-box',
  minWidth: 0,
  width: '100%',
};

export const sectionTitleStyle: CSSProperties = {
  margin: '0 0 12px',
  fontSize: 14,
  fontWeight: 650,
  letterSpacing: '-0.01em',
  color: 'var(--text)',
};

export const helperStyle: CSSProperties = {
  margin: '0 0 16px',
  fontSize: 13,
  lineHeight: 1.45,
  color: 'var(--text2)',
};

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 18,
        minWidth: 0,
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 220px' }}>
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 650,
            letterSpacing: '-0.03em',
            color: 'var(--text)',
            wordBreak: 'break-word',
          }}
        >
          {title}
        </h1>
        {subtitle ? <p style={{ ...helperStyle, margin: '6px 0 0' }}>{subtitle}</p> : null}
      </div>
      {actions ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{actions}</div>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        ...panelStyle,
        textAlign: 'center',
        padding: '40px 24px',
        background: 'color-mix(in srgb, var(--surface) 88%, var(--bg))',
      }}
    >
      <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 650 }}>{title}</h2>
      <p style={{ ...helperStyle, margin: '0 auto 18px', maxWidth: 420 }}>{description}</p>
      {action}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'accepted' || status === 'active'
      ? { bg: 'color-mix(in srgb, var(--accent) 14%, transparent)', fg: 'var(--accent)' }
      : status === 'rejected' || status === 'cancelled' || status === 'inactive' || status === 'merged'
        ? { bg: 'var(--red-bg, #fee2e2)', fg: 'var(--red, #b91c1c)' }
        : status === 'sent' || status === 'viewed'
          ? { bg: 'color-mix(in srgb, #2563eb 12%, transparent)', fg: '#1d4ed8' }
          : { bg: 'var(--surface2)', fg: 'var(--text2)' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 28,
        padding: '0 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        textTransform: 'capitalize',
        background: tone.bg,
        color: tone.fg,
      }}
    >
      {status}
    </span>
  );
}

export function LabeledInput(props: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const { label, error, id, ...rest } = props;
  const fieldId = id ?? `f-${label.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-_]/g, '')}`;
  return (
    <FormField label={label} error={error}>
      <Input id={fieldId} aria-label={label} {...rest} style={{ minHeight: 40, ...rest.style }} />
    </FormField>
  );
}

export function LabeledSelect(props: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string }) {
  const { label, error, id, children, ...rest } = props;
  const fieldId = id ?? `f-${label.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-_]/g, '')}`;
  return (
    <FormField label={label} error={error}>
      <Select id={fieldId} aria-label={label} {...rest} style={{ minHeight: 40, ...rest.style }}>
        {children}
      </Select>
    </FormField>
  );
}

export function LabeledTextarea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string },
) {
  const { label, error, id, ...rest } = props;
  const fieldId = id ?? `f-${label.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-_]/g, '')}`;
  return (
    <FormField label={label} error={error}>
      <Textarea id={fieldId} aria-label={label} {...rest} />
    </FormField>
  );
}

export function PrimaryButton(props: ComponentProps<typeof Button>) {
  return <Button variant="primary" {...props} style={{ minHeight: 40, ...props.style }} />;
}

export function SecondaryButton(props: ComponentProps<typeof Button>) {
  return <Button variant="secondary" {...props} style={{ minHeight: 40, ...props.style }} />;
}

export function DangerButton(props: ComponentProps<typeof Button>) {
  return <Button variant="danger" {...props} style={{ minHeight: 40, ...props.style }} />;
}

export function GhostButton(props: ComponentProps<typeof Button>) {
  return <Button variant="ghost" {...props} style={{ minHeight: 40, ...props.style }} />;
}

export function twoColGrid(): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '4px 16px',
    minWidth: 0,
  };
}

/** Responsive form grid — prefer 2–4 columns on desktop, stack on narrow. */
export function formGrid(minColPx = 200): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${minColPx}px), 1fr))`,
    gap: '12px 16px',
    minWidth: 0,
    width: '100%',
  };
}

export function formSpanFull(): CSSProperties {
  return { gridColumn: '1 / -1', minWidth: 0 };
}
