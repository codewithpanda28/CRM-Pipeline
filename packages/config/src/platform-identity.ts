/**
 * Canonical ThinkAIQ platform product identity.
 * Source of truth for default (non–tenant-white-label) branding.
 * See docs/architecture/PLATFORM_IDENTITY_AND_BRANDING.md
 */

export const PLATFORM_IDENTITY = {
  companyName: 'ThinkAIQ',
  productName: 'ThinkAIQ CRM',
  productCategory: 'Business CRM & Management Platform',
  description:
    'Business CRM & Management Platform — multi-tenant SaaS for CRM, sales, finance, team, and automation.',
  /**
   * Official ThinkAIQ mark assets under /platform/branding/
   * - on-light: white background (default shell / login)
   * - on-dark: dark background (dark chrome)
   */
  assets: {
    logo: '/platform/branding/logo.png',
    logoMark: '/platform/branding/logo-mark.png',
    logoMarkOnLight: '/platform/branding/logo-mark-on-light.png',
    logoMarkOnDark: '/platform/branding/logo-mark-on-dark.png',
    favicon: '/platform/branding/favicon.ico',
    appleTouchIcon: '/platform/branding/app-icon.png',
    ogImage: '/platform/branding/og-image.png',
  },
} as const;

/** Names that are foundation leftovers — treat as unset platform default. */
export const LEGACY_PLATFORM_PRODUCT_NAMES = new Set([
  'Vencore',
  'Vantage',
]);

/** Default logo paths that still point at old marks / temporary placeholders. */
export const LEGACY_DEFAULT_LOGO_URLS = new Set([
  '/logo.png',
  '/vencore-card.png',
  '/platform/branding/logo-mark.svg',
  '/platform/branding/logo.svg',
  '/platform/branding/favicon.svg',
]);

export function resolvePlatformProductName(name: string | null | undefined): string {
  if (!name || LEGACY_PLATFORM_PRODUCT_NAMES.has(name)) {
    return PLATFORM_IDENTITY.productName;
  }
  return name;
}

export function resolvePlatformLogoUrl(logoUrl: string | null | undefined): string {
  if (!logoUrl || LEGACY_DEFAULT_LOGO_URLS.has(logoUrl)) {
    return PLATFORM_IDENTITY.assets.logoMark;
  }
  return logoUrl;
}

export function resolvePlatformFaviconUrl(faviconUrl: string | null | undefined): string {
  if (!faviconUrl || faviconUrl.endsWith('/favicon.svg') || faviconUrl.includes('logo-mark.svg')) {
    return PLATFORM_IDENTITY.assets.favicon;
  }
  return faviconUrl;
}

/** Pick light vs dark official mark for chrome background. */
export function resolvePlatformLogoMarkForChrome(
  chrome: 'light' | 'dark' = 'light',
): string {
  return chrome === 'dark'
    ? PLATFORM_IDENTITY.assets.logoMarkOnDark
    : PLATFORM_IDENTITY.assets.logoMarkOnLight;
}

/** `{Page} · ThinkAIQ CRM` when pageName is set; otherwise product name alone. */
export function formatProductPageTitle(
  pageName?: string | null,
  productName: string = PLATFORM_IDENTITY.productName,
): string {
  const page = pageName?.trim();
  if (!page) return productName;
  return `${page} · ${productName}`;
}
