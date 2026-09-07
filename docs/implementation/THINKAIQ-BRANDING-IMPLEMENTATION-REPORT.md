 # THINKAIQ-BRANDING-IMPLEMENTATION-REPORT.md

**Date:** 2026-09-04  
**Task:** Phase 2B — ThinkAIQ CRM platform brand identity implementation  
**Status:** **Complete** (runtime browser-verified with official logo)

---

## Changed

### Config / identity source of truth
- `packages/config/src/platform-identity.ts` — canonical ThinkAIQ CRM identity + resolvers (+ light/dark mark picker)
- `packages/config/src/theme.ts` / `index.ts` — browser-safe exports
- `packages/config/src/read-config.ts` — SAFE_DEFAULTS → ThinkAIQ CRM
- `packages/config/src/config-schema.ts` — default logo → `/platform/branding/logo-mark.png`
- `packages/config/src/__tests__/platform-identity.test.ts`
- `packages/config/src/__tests__/read-config.test.ts`

### API
- `apps/api/src/routes/config.ts` — public config resolves legacy `Vencore`/`Vantage` → ThinkAIQ CRM
- `apps/api/src/routes/config-branding.test.ts`
- `apps/api/src/routes/invites.ts`, `auth.ts`, `setup.ts`, `plugins.ts`, `workspace-modules.ts`
- `apps/api/src/lib/send-alert-email.ts`, `update-check.ts`, `infra-db-client.ts`

### Frontend shell / auth / settings
- `apps/web/app/layout.tsx` — title template, OG/Twitter, icons, manifest
- `apps/web/modules/shared/components/PlatformBrandMark.tsx`
- `apps/web/modules/shared/components/Sidebar.tsx`, `Topbar.tsx`
- `apps/web/app/login/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`
- Setup: `SetupWizard.tsx`, `page.tsx`, `types.ts`, `StepBranding.tsx`, `StepAdminAccount.tsx`
- Settings: about, appearance, preferences, ssh, `ApiKeyTable.tsx`
- `apps/web/modules/shared/components/ui/AgentInstallInstructions.tsx` (display name only)
- `apps/web/app/icon.png`, `apps/web/public/favicon.ico`

### Platform assets (`/platform/branding/` — not tenant storage)
- `logo-mark-on-light.png` / `logo-mark-on-dark.png` — **official** ThinkAIQ marks
- `logo-mark.png`, `logo.png`, `favicon.ico`, `favicon.png`, `app-icon.png`, `og-image.png`
- `site.webmanifest`, `README.md`

### Packages (display names only; IDs stay foundation)
- `packages/modules/src/projects/hooks.ts`
- `packages/plugin-runtime/src/contracts.ts`

### Docs
- `docs/implementation/THINKAIQ-BRANDING-AUDIT.md`
- `.env.example` header → ThinkAIQ CRM

---

## Product identity

Confirmed: **ThinkAIQ CRM** (company **ThinkAIQ**).

Live `GET http://localhost:3001/api/config`:

```json
"name": "ThinkAIQ CRM",
"logoUrl": "/platform/branding/logo-mark.png",
"faviconUrl": "/platform/branding/favicon.ico",
"tagline": "Business CRM & Management Platform"
```

Platform vs tenant: resolvers only remap **legacy platform defaults**. Custom instance names and ADR-018 `tenant_branding` are untouched.

---

## Logo

**Official ThinkAIQ mark used** (user-supplied light + dark PNGs).

Temporary “TA” SVG placeholders were removed after official assets arrived.

| Asset | Use |
|-------|-----|
| `logo-mark-on-light.png` | Default shell / login (light chrome) |
| `logo-mark-on-dark.png` | Dark theme chrome |
| `logo-mark.png` / `logo.png` | Web-optimized defaults |

---

## Favicon

- `/platform/branding/favicon.ico` (+ `favicon.png`) derived from official light mark
- `app/icon.png` for Next metadata
- `apple` → `/platform/branding/app-icon.png`
- Manifest icons point at PNG/ICO platform assets

---

## Title / metadata

- Default title: **ThinkAIQ CRM**
- Template: `%s · {product}`
- Description / OG / Twitter / `applicationName` / manifest `name` + `short_name`: ThinkAIQ CRM
- Note: many CRM routes are client components without per-page metadata — tab often shows product default until routes export titles

---

## Vencore audit

See [THINKAIQ-BRANDING-AUDIT.md](./THINKAIQ-BRANDING-AUDIT.md).

| Bucket | Status |
|--------|--------|
| Customer-facing UI / emails / setup / about | Replaced with ThinkAIQ CRM |
| `@vencore/*`, cookies, plugin bridge, `X-Vencore-*` headers, provider IDs | Kept (DEPENDENCY / foundation) |
| LICENSE / audit docs | Kept (LEGAL / INTERNAL) |

---

## Responsive verification

| Width | Result |
|-------|--------|
| **390** | Official logo loads (`logo-mark-on-light.png`); title ThinkAIQ CRM; no Vencore text; **no overflow** |
| **768** | Brand readable; **no overflow** |
| **1280** | Sidebar ThinkAIQ CRM + official mark; board OK; **no overflow** |

---

## Tests

| Suite | Result |
|-------|--------|
| `@vencore/config` | **23/23 pass** |
| `@vencore/api` unit | **415/415 pass** (prior full run; branding tests included) |
| `@vencore/web` setup vitest | **19/19 pass** |
| `@vencore/web` type-check | **pass** |
| `@vencore/web` `next build` | **pass** |

---

## Runtime verification

| Item | Value |
|------|-------|
| Frontend URL | **http://localhost:3002** |
| Port | **3002** |
| Backend | **http://localhost:3001** |
| Browser title | **ThinkAIQ CRM** |
| Sidebar | ThinkAIQ CRM + official mark |
| Login | ThinkAIQ CRM + official mark + tagline |
| Dashboard shell | Pipeline board loads |
| Branding API | `/api/config` → ThinkAIQ CRM |
| Blank page | No |
| Branding API failures | None |
| Known noise | Pre-existing Sidebar hydration overlay; unrelated webhook-delivery worker errors |

---

## Remaining issues

1. Per-route `{Page} · ThinkAIQ CRM` titles not wired on most client CRM pages (template ready).  
2. Legacy `public/logo.png` / `vencore-card.png` still on disk (unused by default UI).  
3. Package/cookie/plugin IDs still `vencore*` (foundation — out of brand-only scope).  
4. Official PNGs are RGB (not true alpha); light/dark variants cover chrome backgrounds.  
5. Pre-existing React hydration warning on Sidebar.

---

**STOP** — branding task complete. Do not start another phase automatically.
