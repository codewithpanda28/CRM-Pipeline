# RESPONSIVE_AND_MOBILE.md — ThinkAIQ CRM

| Field | Value |
|-------|-------|
| Status | Architecture guidance (identity locked; native framework deferred) |
| Product identity | **ThinkAIQ CRM** — [PLATFORM_IDENTITY_AND_BRANDING.md](./PLATFORM_IDENTITY_AND_BRANDING.md) |
| Native apps | Deferred — do not select framework in this document |

---

## 1. Purpose

Define how ThinkAIQ CRM presents on responsive web and future mobile clients **without** contradicting white-label or tenancy ADRs.

Primary surfaces today: responsive web application (desktop + mobile browser). Future: optional Android (Play Store) and possibly iOS clients sharing the same product identity.

---

## 2. Canonical identity on every form factor

| Client | Default product name |
|--------|----------------------|
| Responsive web | **ThinkAIQ CRM** |
| PWA / install metadata | **ThinkAIQ CRM** |
| Future Android / Play Store | **ThinkAIQ CRM** |
| Future iOS (if shipped) | **ThinkAIQ CRM** unless strategy changes |

Tenant white-label may override visible brand on **tenant** hosts per [ADR-018](../adr/ADR-018-TENANT-WHITE-LABEL-AND-THEME-RUNTIME.md). Platform Super Admin / control center stays ThinkAIQ-branded.

---

## 3. Responsive web requirements (branding)

When implementing or reviewing UI:

| Check | Requirement |
|-------|-------------|
| Logo scale | Primary logo ↔ compact / logo-mark at narrow widths |
| Product name | Remains readable in header / login |
| Sidebar / header | Branding usable on mobile navigation patterns |
| Favicon / title | ThinkAIQ CRM strategy across supported browsers |
| Login | Branding correct across breakpoints |
| Tenant branding | Must not break layout (overflow, clipped logos, unreadable contrast) |

Title format remains `{Page Name} · ThinkAIQ CRM` unless tenant WL overrides the product name portion.

---

## 4. PWA metadata

Default manifest / install identity:

```text
name / short_name: ThinkAIQ CRM
icons: ThinkAIQ app-icon set
```

Tenant-branded PWAs (if ever offered) follow ADR-018 host resolution — never global platform cache of a tenant skin.

---

## 5. Future Android / Play Store

| Item | Value |
|------|-------|
| Application display name | **ThinkAIQ CRM** |
| Launcher icon | ThinkAIQ app icon |
| Splash | ThinkAIQ CRM |
| Store listing identity | ThinkAIQ CRM |
| Deep-link / app-link identity | Align with ThinkAIQ CRM hosts |

Exact listing copy, screenshots, and package IDs are deferred. Native framework is **not** chosen here.

---

## 6. Deferred

- Native mobile framework (React Native, Flutter, Kotlin, etc.)
- Exact Play Store / App Store listings
- Offline-first mobile product scope
- Device push provider selection

---

## 7. Related documents

- [PLATFORM_IDENTITY_AND_BRANDING.md](./PLATFORM_IDENTITY_AND_BRANDING.md)
- [WHITE_LABEL_ARCHITECTURE.md](./WHITE_LABEL_ARCHITECTURE.md)
- [ADR-018](../adr/ADR-018-TENANT-WHITE-LABEL-AND-THEME-RUNTIME.md)
- [PRODUCT_REQUIREMENTS.md](../product/PRODUCT_REQUIREMENTS.md)
