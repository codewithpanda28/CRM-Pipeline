# PLATFORM_IDENTITY_AND_BRANDING.md — ThinkAIQ CRM

| Field | Value |
|-------|-------|
| Status | **Locked** — cross-cutting / platform-wide |
| Scope | Default SaaS product identity, brand surfaces, logo/favicon/metadata, white-label precedence, release QA |
| Does not change | Accepted ADRs (esp. [ADR-018](../adr/ADR-018-TENANT-WHITE-LABEL-AND-THEME-RUNTIME.md), [ADR-022](../adr/ADR-022-DOCUMENT-TEMPLATE-DSL.md), [ADR-011](../decisions/ADR-011-white-label-strategy.md)) |
| Implementation | Documentation lock only — no code in this phase |

**Related:** [WHITE_LABEL_ARCHITECTURE.md](./WHITE_LABEL_ARCHITECTURE.md) · [RESPONSIVE_AND_MOBILE.md](./RESPONSIVE_AND_MOBILE.md) · [PRODUCT_VISION.md](../product/PRODUCT_VISION.md) · [PRODUCT_REQUIREMENTS.md](../product/PRODUCT_REQUIREMENTS.md)

---

## 1. Canonical product identity

The default ThinkAIQ SaaS product identity is:

| Layer | Value |
|-------|-------|
| **Product name** | **ThinkAIQ CRM** |
| **Company / platform** | **ThinkAIQ** |
| **Product category** | Business CRM & Management Platform / Business SaaS Platform |

Browser chrome, login, application shell, metadata, and default public-facing product surfaces use **ThinkAIQ CRM** unless a specific tenant has enabled white-label branding per ADR-018.

**Do not** leave Vencore branding anywhere in the final ThinkAIQ customer-facing product. Vencore may remain only where legally/technically required (ATTRIBUTION, LICENSE, internal migration/audit docs) — never as the product UI brand.

---

## 2. Branding surfaces (must use ThinkAIQ CRM by default)

### 2.1 Application

| Surface | Default identity |
|---------|------------------|
| Sidebar / header product name | ThinkAIQ CRM |
| Login page | ThinkAIQ CRM |
| Signup / onboarding | ThinkAIQ CRM |
| Setup screens | ThinkAIQ CRM |
| Dashboard | ThinkAIQ CRM |
| Loading screen | ThinkAIQ CRM |
| Empty states that show product name | ThinkAIQ CRM |
| Error pages | ThinkAIQ CRM |
| 404 / 500 pages where branding exists | ThinkAIQ CRM |

### 2.2 Browser / web

| Surface | Default identity |
|---------|------------------|
| `<title>` / default page titles | ThinkAIQ CRM (see §5) |
| Favicon | ThinkAIQ mark |
| Apple touch icon | ThinkAIQ mark |
| Web app manifest | ThinkAIQ CRM |
| Open Graph title / image | ThinkAIQ CRM defaults |
| Twitter/X card title / image | ThinkAIQ CRM defaults |
| Metadata / canonical product name | ThinkAIQ CRM |
| PWA / install metadata | ThinkAIQ CRM |

### 2.3 Email

| Surface | Default identity |
|---------|------------------|
| Sender display name | ThinkAIQ CRM (platform emails) |
| Default reply identity | Platform reply policy (conceptual) |
| Email header / footer branding | ThinkAIQ platform assets |
| Password reset / invitation / notification / system emails | ThinkAIQ CRM |

Tenant-configured sender identity applies only to that tenant’s outbound mail (ADR-018), never as an accidental global override.

### 2.4 Documents

| Document class | Branding source |
|----------------|-----------------|
| Platform-generated / platform default templates | ThinkAIQ CRM / platform assets |
| Default invoice / quotation templates (no tenant override) | ThinkAIQ CRM defaults |
| PDF metadata where appropriate | ThinkAIQ CRM or tenant legal name per context |
| **Tenant business documents** (invoices, quotes, etc.) | **Tenant branding** — ADR-018 ThemeSnapshot + ADR-022 template context |

### 2.5 Mobile (future)

Native mobile framework remains **deferred**. When an Android / Play Store app ships:

| Surface | Default identity |
|---------|------------------|
| Application display name | **ThinkAIQ CRM** |
| Launcher icon | ThinkAIQ app icon |
| Splash branding | ThinkAIQ CRM |
| App / store metadata | ThinkAIQ CRM |
| Deep-link / app-link identity | ThinkAIQ CRM (where applicable) |

Future iOS may use the same identity unless product strategy changes via a later ADR.

---

## 3. Logo system

Canonical ThinkAIQ logo system (asset variants):

| Variant | Purpose |
|---------|---------|
| Primary logo | Full wordmark / lockup |
| Compact / logo-mark | Narrow chrome, mobile header |
| Light-background version | Light shells |
| Dark-background version | Dark shells |
| Monochrome fallback | Constrained print / email |
| Favicon / icon mark | Browser tabs, bookmarks |
| App icon | PWA / future mobile launcher |

### Storage separation

Platform brand assets **must not** live inside tenant storage namespaces. Conceptual layout:

```text
platform/
  branding/
    logo
    logo-mark
    favicon
    app-icon
    og-image

tenants/
  {tenantId}/
    branding/
      ...
```

Tenant assets remain governed by ADR-018 (`tenants/{tenantId}/branding/...`) and ADR-008 storage rules.

---

## 4. Favicon

The default favicon represents **ThinkAIQ CRM**, not Vencore.

Required uses (formats as needed by the target surface — do not invent unnecessary exact pixel matrices here):

| Use | Requirement |
|-----|-------------|
| Favicon / browser tab icon | ThinkAIQ mark |
| Apple touch icon | ThinkAIQ mark |
| Android / PWA icon | ThinkAIQ mark |
| Future mobile launcher icon | ThinkAIQ app icon |

Exact production asset files are deferred; the **identity** is locked now.

---

## 5. Page title / metadata strategy

**Base product title:** ThinkAIQ CRM

**Recommended format:**

```text
{Page Name} · ThinkAIQ CRM
```

**Examples:**

```text
Dashboard · ThinkAIQ CRM
Contacts · ThinkAIQ CRM
Companies · ThinkAIQ CRM
Settings · ThinkAIQ CRM
```

Tenant white-label may override the visible product identity per ADR-018 and plan/platform rules. Avoid stale Vencore strings in titles, manifests, or meta tags.

---

## 6. White-label precedence (aligned with ADR-018)

```text
Platform default
→ reseller override (future)
→ tenant branding
→ surface-specific branding
```

| Layer | Identity |
|-------|----------|
| Platform default | **ThinkAIQ CRM** |
| Reseller override | Deferred until reseller product ships |
| Tenant branding | Configured company/product identity (`tenant_branding`) |
| Surface-specific | Login vs app shell vs portal vs documents (same ThemeSnapshot, different layout) |

A normal ThinkAIQ tenant may display its own configured identity under white-label rules.

**Hard rule:** Platform Super Admin / ThinkAIQ control center retains **ThinkAIQ** platform identity and **must not** inherit a tenant’s branding (ADR-018 §8 Ops Center).

This document does **not** change ADR-018 theme token precedence; it locks the **content** of the platform-default layer.

---

## 7. Configuration model

### Canonical sources

| Concern | Source of truth |
|---------|-----------------|
| Platform identity | Platform configuration / platform branding records |
| Tenant branding | `tenant_branding` (ADR-018) |

### Do not use

- Hardcoded Vencore strings in customer-facing UI
- Arbitrary frontend constants scattered across components as the brand source of truth
- `system_settings` as tenant branding source of truth (Vencore instance pattern — rejected for ThinkAIQ SaaS)
- Tenant branding as platform branding source of truth

### Resolver (conceptual)

```text
PlatformBranding
TenantBranding
ResolvedBranding
```

Runtime remains host → tenant → ThemeSnapshot / ResolvedBranding → surface (ADR-018).

---

## 8. No vendor / foundation brand leak

ThinkAIQ uses Vencore **selectively** as engineering foundation ([ADR-014](../decisions/ADR-014-vencore-selective-foundation.md)). The shipped product must not expose Vencore branding accidentally.

### Pre-production release requirement

Search the entire repository for:

- `Vencore`
- Old product names
- Old logos / favicons
- Old titles / metadata
- Old email display names
- Old URLs / environment branding strings

| Classification | Action |
|----------------|--------|
| ATTRIBUTION / LICENSE / legal notices | May remain when required |
| Internal migration / audit documentation | May remain (clearly non-customer-facing) |
| Customer-facing product UI, emails, docs, store listings | **Must** use ThinkAIQ branding |

---

## 9. SEO / social metadata (platform defaults)

| Field | Default |
|-------|---------|
| Title | ThinkAIQ CRM (or `{Page} · ThinkAIQ CRM`) |
| Description | Describes ThinkAIQ CRM as the product (final marketing copy deferred) |
| Favicon | ThinkAIQ mark |
| Open Graph title | ThinkAIQ CRM |
| Open Graph description | Platform product description |
| Open Graph image | Platform `og-image` asset |

Tenant public / portal pages may use tenant identity per white-label rules. Final SEO copy and marketing content are deferred.

---

## 10. Email domain / identity

| Identity | Scope |
|----------|-------|
| **Platform email identity** | ThinkAIQ platform emails (resets, invitations when platform-owned, system notices) |
| **Tenant email identity** | Tenant configuration + verified domains only |

Conceptual platform identity (not a final production address):

```text
ThinkAIQ CRM
support@thinkaiq...
```

Do **not** invent a final production mailbox in this document. Tenant email branding must never unexpectedly rewrite platform-wide sender identity.

---

## 11. PWA / future mobile app

Responsive web and future native clients share the same canonical product identity: **ThinkAIQ CRM**.

Native framework selection is **out of scope** here — see [RESPONSIVE_AND_MOBILE.md](./RESPONSIVE_AND_MOBILE.md).

---

## 12. Responsive compatibility

Identity requirements must remain compatible with responsive / mobile UX:

- ThinkAIQ logo scales correctly (primary ↔ compact mark)
- Product name remains readable at supported breakpoints
- Sidebar / header branding works on mobile
- Favicon / title work across supported browsers
- Login branding works across breakpoints
- Tenant branding must not break responsive layout

---

## 13. Acceptance / QA (production release)

### Visual

- ThinkAIQ logo where expected
- Correct favicon
- Correct product name
- No Vencore branding in customer-facing UI

### Browser

- Correct tab title strategy
- Favicon and page metadata correct

### Email

- Correct default platform sender branding
- Correct tenant sender branding where configured

### Documents

- Platform documents → ThinkAIQ default
- Tenant documents → tenant branding (ADR-018 / ADR-022)

### Mobile / responsive

- App identity ThinkAIQ CRM (when shipped)
- Responsive web uses ThinkAIQ CRM identity
- Future mobile client can reuse the same identity

---

## 14. Branding test requirement

Add automated / static QA checks where practical:

```text
No customer-facing "Vencore" string
No old Vencore favicon
No old Vencore app title
No stale Vencore product metadata
```

Do not break legitimate attribution / license references. Where automation is unreliable, use a release checklist (same items as §13–§14).

---

## 15. Security / tenancy

Branding remains tenant-safe. Never allow:

```text
Tenant A branding
→ cached globally
→ displayed for Tenant B
```

Follow ADR-018:

```text
Host
→ tenant
→ ThemeSnapshot / ResolvedBranding
→ surface
```

Platform Super Admin remains platform-branded.

---

## 16. Final lock

### Locked (cross-cutting / platform-wide)

- Canonical product name: **ThinkAIQ CRM**
- Company / platform identity: **ThinkAIQ**
- ThinkAIQ logo system (variant set)
- ThinkAIQ favicon identity
- Browser / page title strategy
- App / PWA metadata identity
- Email platform identity (conceptual)
- Future mobile / Play Store app identity
- No customer-facing Vencore branding
- Tenant white-label remains separate and tenant-scoped
- Responsive / mobile compatibility of branding

### Deferred

- Final visual logo artwork variants
- Exact production asset files
- Play Store listing copy / assets
- Native mobile framework
- Platform email provider / production domain
- Final SEO copy
- Final marketing content

**STOP** — no application code, packages, or migrations in this documentation phase.
