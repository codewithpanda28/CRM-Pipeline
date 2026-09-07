# ADR-022 — Document Template DSL

| Field | Value |
|-------|-------|
| Status | **Accepted** (Phase 1E) |
| Date | 2026-09-04 |
| Relates to | ADR-016 (PDF hybrid Playwright + pdf-lib), ADR-018 (branding), ADR-015 (async render jobs) |
| Scope | Safe template language & packaging for finance/business PDFs |

---

## 1. Context

ADR-016 locks **Playwright HTML/CSS → PDF** (plus pdf-lib post-process) behind `DocumentRenderer`. It left the **template DSL** open (Handlebars / Liquid / React-like).

ThinkAIQ needs tenant-safe templates for invoices, quotes, credit/debit notes, receipts, statements, reports, future agreements — with variables, conditionals, loops, tables, branding, locale, currency, tax, custom fields, controlled helpers, header/footer/page concepts, versioning, preview, publish, rollback.

Finance must only call:

```text
DocumentRenderer.render(request)
```

---

## 2. Options

| Option | Pros | Cons | Server code exec risk |
|--------|------|------|------------------------|
| **Handlebars** | Familiar; helpers; no arbitrary JS in templates if helpers allowlisted | Logic-less limits; need discipline on helpers | Low if no `eval` helpers |
| **Liquid** | Safe-by-culture; Shopify heritage; good for untrusted authors | Slightly less Node-native ecosystem | Low |
| **JSX / React templates** | Great DX for engineers | Easy to smuggle privileged imports; harder to sandbox tenant-authored templates | **High** for tenant-authored |
| **HTML/CSS + restricted context** (chosen engine underneath) | Matches Playwright; designers work in HTML | Still need a bind language for `{{ }}` | Depends on binder |

---

## 3. Security requirements (non-negotiable)

Templates **must not**:

- Execute arbitrary server code  
- Access filesystem or network  
- Read another tenant’s data  
- Call privileged internal APIs  
- Execute arbitrary JavaScript on the server  

**Safe template context** (only):

```text
TemplateContext
  document: { type, number, dates, lines[], totals, tax_breakup, … }
  party: { bill_to, ship_to, … }          // already loaded for this tenant
  tenant: { legal_name, gstin, address, … } // from branding snapshot
  brand: ThemeSnapshot tokens + asset URLs  // ADR-018
  locale, currency, timezone
  custom_fields: map                    // only fields defined for this tenant/entity
  helpers: allowlisted only             // formatMoney, formatDate, formatGstin, qrDataUrl?, …
```

Platform-default document chrome (when no tenant brand applies) uses **ThinkAIQ CRM** platform assets — [PLATFORM_IDENTITY_AND_BRANDING.md](../architecture/PLATFORM_IDENTITY_AND_BRANDING.md). Tenant business documents always bind `brand` from that tenant’s ThemeSnapshot (never another tenant).

No `process`, `require`, `fetch`, `db`, `tenantId` switching, or raw HTML from untrusted custom fields without escaping policy.

---

## 4. Decision — hybrid packaging + Handlebars binder

### Strategy: **HTML/CSS source + Handlebars (strict) → Playwright**

| Layer | Choice |
|-------|--------|
| Authoring format | **HTML/CSS templates** (design fidelity for GST tables, headers/footers via print CSS) |
| Bind language | **Handlebars** with **allowlisted helpers only**; `noEscape` disabled by default; strict mode |
| Structured schema | Optional **template metadata** (paper size, margins, required variables) — not a second full layout DSL |
| React/JSX as primary tenant DSL | **Rejected** for tenant-authored templates |
| Liquid | Acceptable alternative later if Handlebars helper surface proves unsafe — would need new ADR |

**Why not Liquid first:** Handlebars is already common in Node stacks and sufficient if helpers are locked; Playwright path wants HTML strings. Safety comes from **sandbox policy**, not brand of mustache.

**Why not pure structured schema only:** Pixel/GST layout control is worse than HTML for Phase 1 finance docs (ADR-016 rationale).

### Template artifact model

```text
DocumentTemplate
  id, tenantId (null = platform default), type, name
  status: draft | published | archived
  engine: html_handlebars_playwright   // fixed for Phase 1–4

DocumentTemplateVersion
  templateId, version, immutable
  html_source
  css_source (or embedded)
  metadata: { paper, margins, locale_default }
  helper_allowlist_ref
  created_at, created_by, changelog

Publish / rollback = point “published” head at a version; artifacts pin version id (ADR-016).
```

Preview = same renderer with watermark flag; still tenant-scoped; async or sync-short timeout for draft only — **finals stay async** (ADR-016).

---

## 5. Features mapping

| Need | Approach |
|------|----------|
| Variables / conditionals / loops | Handlebars `{{ }}`, `{{#if}}`, `{{#each}}` |
| Tables | HTML tables + CSS; each over `document.lines` |
| Branding | `brand.*` from ThemeSnapshot — never from another tenant |
| Locale / currency / tax | Helpers + precomputed tax_breakup in context |
| Custom fields | `custom_fields.key` only |
| Header/footer / page breaks | CSS `@page`, print headers; optional pdf-lib stamp |
| Versioning / publish / rollback | Version rows + published pointer |
| QR / barcode | Allowlisted helper producing data-URL or SVG from **provided** payload strings |

---

## 6. Abstraction boundary

```text
Finance domain
  → DocumentRenderer.render({ tenantId, templateType|id, entityId, idempotencyKey })
Infrastructure
  → load version + build TemplateContext (tenant-scoped queries)
  → Handlebars.compile(allowlisted)
  → Playwright PDF
  → pdf-lib post-process if needed
  → storage + DocumentArtifact
```

Finance **must not** import Handlebars or Playwright.

---

## 7. Platform vs tenant templates

- Platform ships default GST-ready templates (`tenant_id` null).  
- Tenants clone → own versions (copy-on-write).  
- Entitlement may lock custom HTML to higher plans — product packaging, not architecture block.

---

# DECISION: HTML/CSS templates + strict allowlisted Handlebars → Playwright (ADR-016); DocumentRenderer port only; no tenant JSX; no arbitrary server JS

**Status:** Accepted for Phase 1E planning.
