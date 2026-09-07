'use client';

import { useContext } from 'react';
import {
  PLATFORM_IDENTITY,
  resolvePlatformLogoMarkForChrome,
  resolvePlatformProductName,
} from '@vencore/config/theme';
import { ThemeContext } from '@/modules/shared/contexts/ThemeContext';

type PlatformBrandMarkProps = {
  /** Compact mark (default) or full wordmark */
  variant?: 'mark' | 'logo';
  /** Override from config; legacy paths resolve to platform defaults */
  logoUrl?: string | null;
  productName?: string | null;
  size?: number;
  showName?: boolean;
  nameStyle?: React.CSSProperties;
  /** Force light/dark mark; default follows app theme */
  chrome?: 'light' | 'dark' | 'auto';
};

/**
 * Platform (ThinkAIQ CRM) brand lockup for shell / auth surfaces.
 * Uses official on-light / on-dark marks. Does not apply tenant white-label.
 */
export function PlatformBrandMark({
  variant = 'mark',
  logoUrl,
  productName,
  size = 30,
  showName = false,
  nameStyle,
  chrome = 'auto',
}: PlatformBrandMarkProps) {
  const themeCtx = useContext(ThemeContext);
  const name = resolvePlatformProductName(productName);
  const chromeTone: 'light' | 'dark' =
    chrome === 'auto'
      ? (themeCtx?.theme === 'dark' ? 'dark' : 'light')
      : chrome;

  const customLogo =
    logoUrl &&
    !logoUrl.startsWith('/platform/branding/') &&
    logoUrl !== '/logo.png' &&
    logoUrl !== '/vencore-card.png'
      ? logoUrl
      : null;

  const src =
    variant === 'logo'
      ? PLATFORM_IDENTITY.assets.logo
      : customLogo ?? resolvePlatformLogoMarkForChrome(chromeTone);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        minWidth: 0,
        maxWidth: '100%',
      }}
    >
      <img
        src={src}
        alt={name}
        width={variant === 'logo' ? undefined : size}
        height={size}
        style={{
          width: variant === 'logo' ? 'auto' : size,
          height: size,
          maxWidth: variant === 'logo' ? 180 : size,
          objectFit: 'contain',
          flexShrink: 0,
          display: 'block',
          borderRadius: variant === 'mark' ? 6 : 0,
        }}
      />
      {showName && (
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 19,
            fontWeight: 600,
            letterSpacing: '-0.4px',
            color: 'var(--nav-fg, var(--text))',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
            ...nameStyle,
          }}
        >
          {name}
        </span>
      )}
    </span>
  );
}
