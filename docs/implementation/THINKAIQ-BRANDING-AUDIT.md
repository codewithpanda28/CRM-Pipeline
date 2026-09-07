# THINKAIQ-BRANDING-AUDIT.md

**Date:** 2026-09-04  
**Scope:** Customer-facing ThinkAIQ CRM identity vs remaining Vencore foundation references  
**Related:** [PLATFORM_IDENTITY_AND_BRANDING.md](../architecture/PLATFORM_IDENTITY_AND_BRANDING.md) · [THINKAIQ-BRANDING-IMPLEMENTATION-REPORT.md](./THINKAIQ-BRANDING-IMPLEMENTATION-REPORT.md)

---

## Summary

Customer-facing product UI, metadata, login/setup/shell copy, and default `/api/config` branding now resolve to **ThinkAIQ CRM**.  
Package scopes (`@vencore/*`), cookies, plugin bridge APIs, and webhook signature headers remain Vencore-named as foundation/API contracts (ADR-014).

---

## Classification legend

| Class | Action |
|-------|--------|
| **CUSTOMER-FACING** | Must use ThinkAIQ CRM / platform assets |
| **LEGAL/ATTRIBUTION** | Keep when required |
| **INTERNAL/MIGRATION DOC** | May remain |
| **DEPENDENCY/THIRD-PARTY** | Do not rename unless app-facing |

---

## CUSTOMER-FACING — replaced this task

| Area | Before | After |
|------|--------|-------|
| Config defaults (`readConfig` SAFE_DEFAULTS) | `Vencore` + `/logo.png` | `ThinkAIQ CRM` + `/platform/branding/*` |
| `GET /api/config` | Raw DB/file name | Resolves legacy `Vencore`/`Vantage` → ThinkAIQ CRM |
| Root metadata / titles | Vencore marketing strings | ThinkAIQ CRM + `%s · {product}` template |
| Favicon / icons / manifest | Missing / Vencore logo.png | Platform SVG set + `site.webmanifest` |
| Sidebar brand | Config name + Vencore logo.png | `PlatformBrandMark` → ThinkAIQ CRM |
| Topbar fallback title | `Vencore` | ThinkAIQ CRM |
| Login / forgot / reset | Triangle / no product name | ThinkAIQ mark + product name |
| Setup wizard copy | Vencore Setup / instance | ThinkAIQ CRM Setup |
| Settings about / appearance / preferences / SSH / API keys | Vencore copy | ThinkAIQ CRM copy |
| Invite + alert + password-reset emails | Vencore | ThinkAIQ CRM |
| Update notification title | `Vencore {ver}` | `ThinkAIQ CRM {ver}` |
| Provider display names (CRM/messaging/infra) | Vencore CRM | ThinkAIQ CRM (IDs stay `vencore-*`) |

---

## DEPENDENCY / INTERNAL — intentionally kept

| Reference | Class | Why |
|-----------|-------|-----|
| `@vencore/*` package names | DEPENDENCY | Workspace package scope; ADR-014 selective foundation |
| Cookie `vencore_token` / `vencore_csrf` / `vencore_setup_done` | DEPENDENCY | Session contract; rename would break auth |
| `vencore_theme` / `vencore_token` localStorage keys | DEPENDENCY | Client persistence |
| Plugin bridge `makeVencore` / `__buildVencore` / `window` events `vencore:*` | DEPENDENCY | Plugin SDK surface |
| Webhook headers `X-Vencore-*` | DEPENDENCY | External webhook contract |
| Provider IDs `vencore-crm`, `vencore-messaging`, `vencore-infra` | DEPENDENCY | Stable provider keys |
| Agent binary/env `vencore-agent`, `VENCORE_*` | DEPENDENCY | Install agent package names |
| GHCR / GitHub release URLs under vencorehq | DEPENDENCY | Update channel |
| Type alias `VencoreConfig` | INTERNAL | Config type name |
| Log prefixes `[Vencore]` in seed helpers | INTERNAL | Operator logs |
| Docs under `docs/audit/VENCORE_*`, ADR-014 | INTERNAL/MIGRATION / LEGAL | Audit + attribution |
| `public/logo.png`, `public/vencore-card.png` files | INTERNAL leftover assets | No longer referenced by default UI; keep until asset purge PR |

---

## LEGAL / ATTRIBUTION

- Repository `LICENSE` / MIT notices for upstream Vencore remain.  
- About page points to LICENSE/ATTRIBUTION rather than Vencore marketing links.

---

## Static QA checklist (release)

```text
[ ] No customer-facing "Vencore" in shell, login, setup, about, settings copy
[ ] Favicon is ThinkAIQ mark (not Vencore VC logo)
[ ] document.title is ThinkAIQ CRM (or {Page} · ThinkAIQ CRM)
[ ] /api/config returns name ThinkAIQ CRM when DB still has legacy Vencore
[ ] Sidebar shows ThinkAIQ CRM + platform mark
[ ] Attribution/LICENSE still intact
```

---

## Counts (approx., this workspace)

| Bucket | Notes |
|--------|-------|
| Customer-facing UI strings replaced | ~25+ files in this change |
| Remaining `Vencore` in `apps/web` | Mostly `@vencore` imports, cookies, plugin bridge (~internal) |
| Remaining product UI string hits | Comment in `PlatformBrandMark` only (documents legacy resolver) |

Automated “zero Vencore in apps/web” is **not** appropriate until package rename — would false-fail on `@vencore/*`.
