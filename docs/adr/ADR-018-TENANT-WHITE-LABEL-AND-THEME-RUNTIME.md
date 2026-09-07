# ADR-018 — Tenant White-Label & Theme Runtime

| Field | Value |
|-------|-------|
| Status | **Accepted** (Phase 1D planning) |
| Date | 2026-09-04 |
| Relates to | ADR-005 (domains/SSL), ADR-008 (storage), ADR-011 (WL strategy), ADR-016 (PDF branding), ADR-017 (tenancy/host), [WHITE_LABEL_ARCHITECTURE.md](../architecture/WHITE_LABEL_ARCHITECTURE.md), [PLATFORM_IDENTITY_AND_BRANDING.md](../architecture/PLATFORM_IDENTITY_AND_BRANDING.md), [VENCORE_WHITE_LABEL.md](../audit/VENCORE_WHITE_LABEL.md) |
| Scope | Per-tenant branding, theme tokens, assets, domain UX, WL security |

**Constraint:** Architecture only — no implementation in this phase.

---

## 1. Context

Vencore white-label is **instance-level** (`vencore.config.json` + `system_settings`) — one brand per install ([VENCORE_WHITE_LABEL.md](../audit/VENCORE_WHITE_LABEL.md)).

ThinkAIQ requires **tenant-level** white-label: each customer looks like their own product on shared infrastructure.

ADR-011 remains directionally correct (host → branding → tokens) and is **refined** here into a concrete runtime model. ADR-005 remains the domain/TLS workflow; this ADR owns branding + theme + asset isolation.

---

## 2. Per-tenant configuration surface

Each tenant may independently configure:

| Area | Examples |
|------|----------|
| Identity | Company name, legal name |
| Visual | Logo (light/dark), favicon, colors, typography |
| Email | From name/address (verified domain), reply-to, support contact |
| Hosting | Subdomain, custom domain (ADR-005/017) |
| Surfaces | Login branding, invoice/document branding, customer portal branding |
| Commercial | Enabled modules, plan, feature limits (entitlements — ADR-017) |

Platform Super Admin can set/override for support; tenant Owner/Admin can edit within plan entitlements (custom domain often Pro/Enterprise-gated).

---

## 3. Runtime model (no cross-tenant leak)

```text
Request Host
  → tenantId (ADR-017)
  → load branding source (DB + cache)
  → resolve ThemeSnapshot (tokens + asset URLs)
  → attach to server RequestContext
       ├→ frontend theme tokens / CSS variables
       ├→ email template context
       ├→ PDF DocumentTemplate context (ADR-016)
       └→ portal shell
```

**Hard rules**

1. Branding load is always keyed by **resolved `tenantId`**, never by “whatever is in the JWT” alone on tenant hosts.  
2. Cache keys: `theme:v{version}:{tenantId}` — no shared global brand blob for tenants.  
3. Asset URLs include tenant namespace or signed capability for that tenant.  
4. PDF/email workers reload branding by `tenantId` from job context — never reuse another job’s ThemeSnapshot.  
5. Suspended/archived tenants: show safe suspended page or deny; do not serve another tenant’s skin as fallback.

---

## 4. Theme architecture — design tokens

Prefer **CSS variables / design tokens**, not forked CSS per tenant.

### Layers & precedence (highest wins)

```text
1. Platform defaults          (ThinkAIQ CRM base theme / platform branding — see PLATFORM_IDENTITY_AND_BRANDING.md)
2. Reseller overrides         (optional, deferred — when reseller product ships)
3. Tenant overrides           (tenant_branding.theme)
4. Module-level overrides     (rare; e.g. finance document chrome only)
5. Runtime surface slice      (login vs app shell vs portal — same tokens, different layout)
```

Platform-default **product name / logo / favicon / titles** are **ThinkAIQ CRM**, not Vencore. This ADR’s precedence model is unchanged; platform default *content* is locked in [PLATFORM_IDENTITY_AND_BRANDING.md](../architecture/PLATFORM_IDENTITY_AND_BRANDING.md).
### Token groups (conceptual)

| Group | Examples |
|-------|----------|
| Color | `--color-primary`, `--color-secondary`, surface, danger, text |
| Typography | `--font-sans`, `--font-display` (allowlisted font families only) |
| Brand chrome | logo URLs, favicon, app display name |
| Email | header logo, footer legal |
| Document | invoice header/footer, GSTIN block placement metadata |

Invalid/unsafe values (arbitrary `url()`, remote CSS injection) are rejected at write time. Fonts: allowlist or tenant-uploaded font files stored under tenant prefix (validated MIME).

---

## 5. Assets — tenant-safe storage

| Asset | Key pattern (conceptual) |
|-------|--------------------------|
| Logos | `tenants/{tenantId}/branding/logo-{variant}.{ext}` |
| Favicons | `tenants/{tenantId}/branding/favicon.{ext}` |
| Email assets | `tenants/{tenantId}/branding/email/...` |
| Document assets | `tenants/{tenantId}/branding/documents/...` |
| Fonts | `tenants/{tenantId}/branding/fonts/...` |

**Platform** brand assets use a separate namespace (`platform/branding/...`) — never under a tenant prefix. See [PLATFORM_IDENTITY_AND_BRANDING.md](../architecture/PLATFORM_IDENTITY_AND_BRANDING.md).

Aligned with ADR-008. Metadata in `files` + `tenant_branding` FKs (tenant) / platform branding records (platform).

**Access**

- Public read only for deliberately public brand assets (logo/favicon) via CDN with tenant-specific paths — still no listing of sibling tenants.  
- Or signed URLs with short TTL for private art.  
- Upload: authz = tenant admin + content-type + size limits + malware scan policy.  
- **Never** serve `tenants/{B}/...` when context is A.

---

## 6. Custom domains & subdomains

| Host | Example | Phase |
|------|---------|-------|
| Tenant subdomain | `acme.thinkaiq.com` | Phase 1 |
| Custom domain | `crm.acme.com` | Phase 2 entitlement (architecture ready now) |
| Platform | `app.thinkaiq.com`, admin host | Platform shell / Super Admin |

### Architecture (no implementation here)

| Concern | Design |
|---------|--------|
| DNS | CNAME/ALIAS to platform edge; TXT for verification |
| TLS | Wildcard for `*.thinkaiq.com`; automated certs for custom (ADR-005 open tool choice) |
| Verification | State machine on `tenant_domains` |
| Activation | Only `verification_status=active` + `ssl_status=ready` routes traffic |
| Fallback | Failed verify → subdomain remains; custom not served |
| Collision | `host` UNIQUE globally |
| Suspended tenant | Custom + subdomain resolve to suspended interstitial; no business API |

---

## 7. White-label security

| Topic | Control |
|-------|---------|
| Host header | ADR-017 trusted resolution only |
| CORS | Allowlist origins = active domains for that tenant + platform; never `*` with credentials |
| Cookies | Host-only / `__Host-` where possible; `Secure`; `SameSite`; cookie domain must not span unrelated tenants |
| CSP | Per-response CSP; `img-src`/`font-src` limited to platform + tenant asset origins |
| Asset URLs | Tenant-prefixed paths; no open redirect into other tenants |
| Email links | Absolute URLs built from **that tenant’s** primary host |
| Signed URLs | Capability bound to object key (implies tenant); expiry |
| Cached pages | `Vary: Host` / cache key includes tenantId; CDN must not cache HTML across hosts without host in key |
| CDN | Brand assets cacheable; HTML app shell careful; purge on `tenant.branding_updated` |

---

## 8. Surfaces consuming theme

| Surface | Consumer |
|---------|----------|
| App shell / login | Next (or chosen) frontend injects CSS variables |
| Transactional email | Renderer receives ThemeSnapshot + tenant locale |
| PDF invoices/quotes | DocumentRenderer (ADR-016) — tenant logo, colors, GSTIN, footer |
| Portal | Same token pipeline, portal layout |
| Ops Center | **Platform** theme — never a customer’s brand for Super Admin chrome |

---

## 9. Decision

# DECISION: Host-resolved per-tenant ThemeSnapshot from `tenant_branding` + token CSS variables; S3-namespaced assets; subdomain-first domains

**Implementation boundary**

- **In:** `tenant_branding`, theme cache, asset upload pipeline, Host→theme injection, email/PDF context builders.  
- **Out:** Instance-only `system_settings` as the brand source of truth; per-tenant code forks; arbitrary CSS blobs.  
- **Refines ADR-011**; **depends on ADR-017** resolution; **feeds ADR-016** document context.  
- Reseller theme layer deferred until reseller product ADR.

**Status:** Accepted for Phase 1D planning.
