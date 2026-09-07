# WHITE_LABEL_ARCHITECTURE.md — ThinkAIQ

## 1. Purpose

White-label is configuration-driven. Each tenant presents as its own product brand without a separate codebase or default separate deployment.

**Platform default identity (locked):** when no tenant white-label applies, the product is **ThinkAIQ CRM** under company **ThinkAIQ**. See [PLATFORM_IDENTITY_AND_BRANDING.md](./PLATFORM_IDENTITY_AND_BRANDING.md). Do not ship customer-facing Vencore branding.

**Canonical tenant runtime:** [ADR-018](../adr/ADR-018-TENANT-WHITE-LABEL-AND-THEME-RUNTIME.md) (ThemeSnapshot, `tenant_branding`, host → tenant → surface).

---

## 1.1 Precedence (must match ADR-018)

```text
Platform default (ThinkAIQ CRM)
→ reseller override (future)
→ tenant branding
→ surface-specific branding
```

| Context | Branding source |
|---------|-----------------|
| Unbranded / platform hosts & defaults | Platform branding → **ThinkAIQ CRM** |
| Tenant subdomain / custom domain | `tenant_branding` ThemeSnapshot |
| Platform Super Admin / Ops Center | **Always** ThinkAIQ platform identity — never a customer skin |
| Tenant business PDFs / quotes | Tenant branding (ADR-018 + ADR-022) |
| Platform system emails / docs | Platform identity |

---

## 2. Branding configuration

### 2.1 Platform branding (default product)

Owned by platform configuration / platform branding records — not `system_settings` as tenant SoT, and not a tenant’s ThemeSnapshot. Surfaces, logo system, favicon, titles, and email defaults: [PLATFORM_IDENTITY_AND_BRANDING.md](./PLATFORM_IDENTITY_AND_BRANDING.md).

### 2.2 Tenant branding (per tenant)

Per tenant independent (`tenant_branding`):

| Asset / setting | Notes |
|-----------------|-------|
| Company / brand name | Hero-level product name in UI |
| Logo | Light/dark variants recommended |
| Favicon | Browser tab identity |
| Primary color | Theme token |
| Secondary color | Theme token |
| Extended theme tokens | Optional: surface, accent, danger |
| Login screen | Background, headline, support copy |
| Email identity | From name, from address (domain-verified), reply-to |
| Support information | Email, phone, help URL |
| Domain / subdomain | Host mapping |
| Enabled modules | Affects navigation & features |
| Plan & limits | Commercial envelope |

Conceptual resolver: `PlatformBranding` → `TenantBranding` → `ResolvedBranding` (ADR-018 ThemeSnapshot at runtime).

---

## 3. Desired Super Admin flow

```
Create Tenant
→ Select Plan
→ Select Modules
→ Configure Branding
→ Configure Domain
→ Create Tenant Admin
→ Apply Settings
→ Tenant Ready
```

System automatically prepares the tenant environment (seed roles, defaults, theme CSS variables, domain record).

---

## 4. Domain system

### Supported host types

| Type | Example |
|------|---------|
| Platform subdomain | `app.thinkaiq.com` |
| Tenant subdomain | `client.thinkaiq.com` |
| Custom domain | `crm.clientdomain.com` |

### Mapping rules

- Domain → exactly one tenant (unique)
- Primary domain flagged; aliases optional later
- TLS/domain verification workflow must be architecture-supported even if Phase 1 ships subdomain-only

See [ADR-005](../decisions/ADR-005-custom-domain-ssl.md).

### Verification workflow (target)

1. Tenant/Super Admin adds custom domain
2. System issues DNS TXT (or CNAME) challenge
3. Verification job polls DNS
4. On success, issue/attach certificate
5. Activate routing
6. Audit `domain.verified` / `domain.activated`

States: `pending_dns` → `verifying` → `active` | `failed` | `expiring` | `disabled`

---

## 5. Theming runtime

1. Resolve tenant from host
2. Load branding config (cached)
3. Inject CSS variables / theme JSON into app shell
4. Apply logo/favicon/login assets from storage URLs
5. Module nav filtered by entitlements

Cache invalidation on branding update events.

---

## 6. Email identity

- **Platform emails:** ThinkAIQ CRM display identity (conceptual `support@thinkaiq...` — final domain deferred); never overwritten by a random tenant’s branding
- Tenant-configured From name/address when domain authenticated
- Fallback to platform relay with “via ThinkAIQ” or tenant display name policy (product decision; document in settings)
- SPF/DKIM/DMARC guidance for custom sending domains (P2)

Never send using another tenant’s verified domain.

---

## 7. Login experience

- Default / platform login chrome: **ThinkAIQ CRM**
- Tenant-branded login on tenant hosts
- Platform Super Admin login on platform admin host only (ThinkAIQ identity)
- Password policies from security config
- Optional SSO later (OAuth-ready architecture)
- Responsive breakpoints must keep logo + product name usable ([RESPONSIVE_AND_MOBILE.md](./RESPONSIVE_AND_MOBILE.md))

---

## 8. Assets storage

- **Platform** logos/favicons/OG/app icons under `platform/branding/...` — never inside a tenant prefix
- **Tenant** logos/favicons/login art under `tenants/{tenantId}/branding/...` (ADR-018)
- Stored via storage abstraction; public or signed URLs with cache headers
- Virus/content-type validation on upload
- Max size limits per plan
- Cache keys always include `tenantId` (or explicit platform key) — no global tenant skin blob

---

## 9. Permissions

| Action | Super Admin | Tenant Owner/Admin |
|--------|-------------|--------------------|
| Create tenant branding at provision | Yes | N/A |
| Edit branding | Yes (support) | Yes (manage branding permission) |
| Map custom domain | Yes | Yes if entitled |
| Edit platform defaults | Yes | No |

---

## 10. APIs (illustrative)

- `GET /tenant/branding`
- `PATCH /tenant/branding`
- `POST /tenant/branding/logo`
- `GET/POST /tenant/domains`
- `POST /tenant/domains/{id}/verify`

Platform:

- `POST /platform/tenants` (includes branding bootstrap)
- `PATCH /platform/tenants/{id}/branding`

---

## 11. Events & audit

- `branding.updated`
- `domain.created` / `domain.verified` / `domain.activated` / `domain.removed`
- Audit all domain and branding changes

---

## 12. Edge cases

- Broken logo URL → fallback mark
- Color contrast failures → warn in admin UI (non-blocking)
- Domain conflict across tenants
- Certificate renewal failure → notify Super Admin + Tenant Admin
- Suspended tenant still resolves branding for “account suspended” page

---

## 13. White-label commercial coupling

Plans may limit:

- Custom domain count
- Removal of platform mentions
- Email domain customization
- Advanced theme tokens

See [BILLING_SUBSCRIPTION.md](../modules/BILLING_SUBSCRIPTION.md).

---

## 14. Related documents

- [PLATFORM_IDENTITY_AND_BRANDING.md](./PLATFORM_IDENTITY_AND_BRANDING.md)
- [RESPONSIVE_AND_MOBILE.md](./RESPONSIVE_AND_MOBILE.md)
- [ADR-018](../adr/ADR-018-TENANT-WHITE-LABEL-AND-THEME-RUNTIME.md)
- [MULTI_TENANCY.md](./MULTI_TENANCY.md)
- [SUPER_ADMIN.md](../operations/SUPER_ADMIN.md)
- [SECURITY.md](../security/SECURITY.md)
- [STORAGE.md](../deployment/STORAGE.md)
