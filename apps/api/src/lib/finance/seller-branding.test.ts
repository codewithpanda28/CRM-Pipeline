import { describe, expect, it } from 'vitest';

describe('seller branding logo URL guard', () => {
  it('rejects ThinkAIQ platform branding paths', async () => {
    // Mirror optionalLogoUrl rules used in seller-branding.ts
    function optionalLogoUrl(theme: unknown): string | null {
      const t = theme && typeof theme === 'object' && !Array.isArray(theme) ? (theme as Record<string, unknown>) : {};
      const url = t['logo_url'] ?? t['logoUrl'];
      if (typeof url !== 'string') return null;
      const s = url.trim();
      if (!s) return null;
      if (s.includes('/platform/branding/')) return null;
      return s;
    }

    expect(optionalLogoUrl({ logo_url: '/platform/branding/logo-mark.png' })).toBeNull();
    expect(optionalLogoUrl({ logoUrl: 'https://cdn.example.com/tenants/abc/logo.png' })).toBe(
      'https://cdn.example.com/tenants/abc/logo.png',
    );
  });
});
