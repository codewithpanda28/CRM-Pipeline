import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import { generateTheme, appearanceSchema, type Appearance } from '@vencore/config/theme';
import {
  PLATFORM_IDENTITY,
  resolvePlatformProductName,
  resolvePlatformFaviconUrl,
  formatProductPageTitle,
} from '@vencore/config/theme';
import { AuthProvider } from '@/modules/shared/lib/AuthContext';
import { ThemeProvider } from '@/modules/shared/contexts/ThemeContext';
import { Providers } from '@/modules/shared/components/Providers';
import './globals.css';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

interface Branding {
  name: string;
  tagline: string | null;
  faviconUrl: string;
  appearance: Appearance;
}

async function getBranding(): Promise<Branding> {
  const apiUrl = process.env['API_URL'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
  try {
    const res = await fetch(`${apiUrl}/api/config`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    const json = await res.json() as {
      data?: { app?: { name?: string; tagline?: string | null; faviconUrl?: string | null; appearance?: Appearance } };
    };
    const app = json.data?.app;
    const name = resolvePlatformProductName(app?.name ?? null);
    return {
      name,
      tagline: app?.tagline ?? (name === PLATFORM_IDENTITY.productName ? PLATFORM_IDENTITY.productCategory : null),
      faviconUrl: resolvePlatformFaviconUrl(app?.faviconUrl ?? null),
      appearance: app?.appearance ?? appearanceSchema.parse({}),
    };
  } catch {
    return {
      name: PLATFORM_IDENTITY.productName,
      tagline: PLATFORM_IDENTITY.productCategory,
      faviconUrl: PLATFORM_IDENTITY.assets.favicon,
      appearance: appearanceSchema.parse({}),
    };
  }
}

function themeStyle(appearance: Appearance): string {
  const toBlock = (sel: string, vars: Record<string, string>) =>
    `${sel}{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')}}`;
  const light = generateTheme(appearance.accentColor, 'light');
  const dark = generateTheme(appearance.accentColor, 'dark');
  return toBlock(':root', light) + toBlock('[data-theme="dark"]', dark);
}

export async function generateMetadata(): Promise<Metadata> {
  const { name, tagline, faviconUrl } = await getBranding();
  const description = tagline ?? PLATFORM_IDENTITY.description;

  return {
    title: {
      default: formatProductPageTitle(undefined, name),
      template: `%s · ${name}`,
    },
    description,
    applicationName: name,
    icons: {
      icon: faviconUrl,
      apple: PLATFORM_IDENTITY.assets.appleTouchIcon,
    },
    openGraph: {
      title: name,
      description,
      siteName: name,
      images: [{ url: PLATFORM_IDENTITY.assets.ogImage }],
    },
    twitter: {
      card: 'summary',
      title: name,
      description,
      images: [PLATFORM_IDENTITY.assets.ogImage],
    },
    manifest: '/platform/branding/site.webmanifest',
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { appearance } = await getBranding();

  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
      data-radius={appearance.radius}
      data-density={appearance.density}
      data-nav={appearance.sidebarStyle}
      suppressHydrationWarning
    >
      <head>
        <style id="brand-theme" dangerouslySetInnerHTML={{ __html: themeStyle(appearance) }} />
      </head>
      <body suppressHydrationWarning>
        <div id="app-root">
          <Providers>
            <AuthProvider>
              <ThemeProvider>{children}</ThemeProvider>
            </AuthProvider>
          </Providers>
        </div>
      </body>
    </html>
  );
}
