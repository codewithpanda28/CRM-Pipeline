import { describe, it, expect } from 'vitest';
import {
  PLATFORM_IDENTITY,
  resolvePlatformProductName,
  resolvePlatformLogoUrl,
  resolvePlatformFaviconUrl,
  resolvePlatformLogoMarkForChrome,
  formatProductPageTitle,
} from '../platform-identity';

describe('platform identity', () => {
  it('locks ThinkAIQ CRM as the canonical product name', () => {
    expect(PLATFORM_IDENTITY.productName).toBe('ThinkAIQ CRM');
    expect(PLATFORM_IDENTITY.companyName).toBe('ThinkAIQ');
  });

  it('maps legacy Vencore/Vantage names to ThinkAIQ CRM', () => {
    expect(resolvePlatformProductName('Vencore')).toBe('ThinkAIQ CRM');
    expect(resolvePlatformProductName('Vantage')).toBe('ThinkAIQ CRM');
    expect(resolvePlatformProductName(null)).toBe('ThinkAIQ CRM');
    expect(resolvePlatformProductName(undefined)).toBe('ThinkAIQ CRM');
  });

  it('preserves custom tenant/instance product names', () => {
    expect(resolvePlatformProductName('Acme CRM')).toBe('Acme CRM');
  });

  it('replaces legacy default logo paths with platform mark', () => {
    expect(resolvePlatformLogoUrl('/logo.png')).toBe(PLATFORM_IDENTITY.assets.logoMark);
    expect(resolvePlatformLogoUrl('/vencore-card.png')).toBe(PLATFORM_IDENTITY.assets.logoMark);
    expect(resolvePlatformLogoUrl('/custom/logo.svg')).toBe('/custom/logo.svg');
  });

  it('defaults favicon to platform asset', () => {
    expect(resolvePlatformFaviconUrl(null)).toBe(PLATFORM_IDENTITY.assets.favicon);
    expect(resolvePlatformFaviconUrl('/tenant/favicon.ico')).toBe('/tenant/favicon.ico');
  });

  it('formats page titles as {Page} · ThinkAIQ CRM', () => {
    expect(formatProductPageTitle()).toBe('ThinkAIQ CRM');
    expect(formatProductPageTitle('Dashboard')).toBe('Dashboard · ThinkAIQ CRM');
    expect(formatProductPageTitle('Contacts')).toBe('Contacts · ThinkAIQ CRM');
  });

  it('keeps platform assets outside tenant namespaces', () => {
    for (const url of Object.values(PLATFORM_IDENTITY.assets)) {
      expect(url.startsWith('/platform/branding/')).toBe(true);
      expect(url.includes('tenants/')).toBe(false);
    }
  });

  it('picks light vs dark official marks', () => {
    expect(resolvePlatformLogoMarkForChrome('light')).toBe(PLATFORM_IDENTITY.assets.logoMarkOnLight);
    expect(resolvePlatformLogoMarkForChrome('dark')).toBe(PLATFORM_IDENTITY.assets.logoMarkOnDark);
  });
});
