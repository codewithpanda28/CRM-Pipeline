# PHASE-3A-4-PRODUCTS-QUOTES-PLAN.md

**Phase:** 3A.4 — Products + Quotes  
**Wave:** Implementation **COMPLETE** (see [IMPLEMENTATION-REPORT](./PHASE-3A-4-PRODUCTS-QUOTES-IMPLEMENTATION-REPORT.md))  
**Date:** 2026-09-05  
**Audit:** [PHASE-3A-4-PRODUCTS-QUOTES-AUDIT.md](./PHASE-3A-4-PRODUCTS-QUOTES-AUDIT.md)  
**ADR:** [ADR-026](../adr/ADR-026-PRODUCTS-AND-QUOTES.md) (CRM catalog + Quote ownership, snapshots, lifecycle)  
**Related:** ADR-016/022 (PDF later), ADR-019 (outbox), ADR-024/025 (CRM domain / CustomerParty)  

**Constraint:** Finance, PDF renderer, WhatsApp, Voice, Deal line items remain out of scope.

---

## 1. Goal

Ship (in a future implementation wave) a production-grade **Product/Service catalog** and **Quote** system that:

- Integrates with Lead (indirect), Contact, Company, CustomerParty, Deal  
- Preserves historical commercial truth via **line snapshots**  
- Is GST-ready without owning the Finance tax engine  
- Emits outbox events for automation / future invoice handoff  
- Stays tenant-safe and RBAC-scoped  

---

## 2. Canonical Product / Service model

### 2.1 Decision — one table, discriminator

**Table:** `products` (name kept even for services — industry-standard catalog noun).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `workspace_id` | UUID NOT NULL | Tenant scope (≡ tenant today) |
| `kind` | enum | `product` \| `service` \| `package` \| `plan` |
| `sku` | text NOT NULL | Unique per workspace among non-deleted |
| `name` | text NOT NULL | |
| `description` | text NULL | |
| `category` | text NULL | Soft category string (no M:N categories table in 3A.4) |
| `unit` | text NOT NULL | e.g. `each`, `hour`, `month`, `license` |
| `list_price` | NUMERIC(18,2) NOT NULL | Catalog list price |
| `currency` | CHAR(3) NOT NULL | ISO-4217 |
| `cost` | NUMERIC(18,2) NULL | Optional internal cost (not on quote PDF by default) |
| `tax_category_code` | text NULL | Finance lookup key later |
| `tax_metadata` | JSONB NOT NULL DEFAULT `{}` | Extensible: HSN/SAC hint, default rate key, country packs |
| `billing_model` | text NULL | `one_time` \| `recurring` \| `usage` (metadata only) |
| `is_active` | boolean NOT NULL DEFAULT true | |
| `custom_fields` | JSONB NOT NULL DEFAULT `{}` | |
| `deleted_at` | timestamptz NULL | Soft delete |
| `created_at` / `updated_at` | timestamptz | |
| `created_by` | UUID NULL | |

**Product vs Service:** same row shape; `kind` distinguishes. Packages/plans are catalog composition **metadata** in 3A.4 (no BOM/child SKU graph yet).

**Not in 3A.4:** price books, multi-currency price lists, price history table, platform `tenants.plan_id` coupling.

### 2.2 Pricing

- Catalog stores **current** `list_price` only.  
- **No price history table** in 3A.4 — historical truth lives on **Quote line snapshots**.  
- Changing product price does not mutate past quotes.  
- Optional later: `product_price_changes` audit if ops demand it (not required for gate).

### 2.3 SKU uniqueness

`UNIQUE (workspace_id, sku) WHERE deleted_at IS NULL`  
Cross-tenant SKUs may collide; must reject cross-tenant FK use.

### 2.4 Soft delete

Soft-delete hides from default list; existing quote lines keep `product_id` nullable FK + snapshots so history survives.

---

## 3. Canonical Quote model

### 3.1 Header — `quotes`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `workspace_id` | UUID NOT NULL | |
| `quote_number` | text NOT NULL | Unique per workspace |
| `version` | int NOT NULL DEFAULT 1 | Revision number |
| `root_quote_id` | UUID NULL | Points to v1 / lineage root (self for v1) |
| `supersedes_quote_id` | UUID NULL | Prior revision when versioning |
| `status` | enum | See §4 |
| `customer_party_id` | UUID NOT NULL | Canonical party (ADR-025) |
| `contact_id` | UUID NULL | Bill-to / buyer contact |
| `company_id` | UUID NULL | Org context |
| `deal_id` | UUID NULL | Optional; same-tenant Deal |
| `issue_date` | date NOT NULL | |
| `expiry_date` | date NULL | |
| `currency` | CHAR(3) NOT NULL | Document currency |
| `subtotal` | NUMERIC(18,2) NOT NULL | Sum of line taxable bases (pre-tax) after line discounts |
| `discount_total` | NUMERIC(18,2) NOT NULL DEFAULT 0 | Document-level discount if any |
| `taxable_amount` | NUMERIC(18,2) NOT NULL | |
| `tax_amount` | NUMERIC(18,2) NOT NULL | |
| `total` | NUMERIC(18,2) NOT NULL | |
| `tax_breakup` | JSONB NOT NULL DEFAULT `{}` | Extensible + GST fields (§7) |
| `place_of_supply` | text NULL | GST-ready |
| `notes` | text NULL | |
| `terms` | text NULL | |
| `party_snapshot` | JSONB NOT NULL DEFAULT `{}` | Bill-to name, address, GSTIN, etc. at issue/send |
| `custom_fields` | JSONB NOT NULL DEFAULT `{}` | |
| `created_by` | UUID NOT NULL | |
| `sent_at` / `sent_by` | | |
| `viewed_at` | | |
| `accepted_at` / `accepted_by` | | Actor + optional external acceptor meta |
| `rejected_at` / `rejected_by` / `rejection_reason` | | |
| `cancelled_at` / `cancelled_by` / `cancel_reason` | | |
| `expired_at` | | System or job-set |
| `deleted_at` | | Soft delete |
| `created_at` / `updated_at` | | |

**Quote without Deal:** **Allowed.** Deal link optional; if present, same workspace + Deal not deleted.

**CustomerParty:** **Required.** On create: accept `customer_party_id` or ensure/reuse from Contact/Company (company preferred when both), aligning with Deal P3 rules — do not invent a second customer model.

**Lead:** No direct `lead_id` on Quote in 3A.4. Converted leads already have Contact/Company/Deal/Party links.

### 3.2 Line items — `quote_line_items`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `workspace_id` | UUID NOT NULL | Denormalized for isolation |
| `quote_id` | UUID NOT NULL | |
| `position` | int NOT NULL | Stable order |
| `product_id` | UUID NULL | Soft ref; may be null for ad-hoc lines |
| **Snapshots** | | |
| `sku_snapshot` | text NULL | |
| `name_snapshot` | text NOT NULL | |
| `description_snapshot` | text NULL | |
| `unit_snapshot` | text NOT NULL | |
| `quantity` | NUMERIC(18,4) NOT NULL | Qty precision > money |
| `unit_price` | NUMERIC(18,2) NOT NULL | Snapshot price |
| `discount_amount` | NUMERIC(18,2) NOT NULL DEFAULT 0 | Or percent+amount — pick amount for persistence clarity; percent optional in metadata |
| `discount_percent` | NUMERIC(8,4) NULL | Informational |
| `taxable_amount` | NUMERIC(18,2) NOT NULL | |
| `tax_rate` | NUMERIC(8,4) NULL | Percent |
| `tax_amount` | NUMERIC(18,2) NOT NULL | |
| `line_total` | NUMERIC(18,2) NOT NULL | taxable + tax (policy §8) |
| `tax_type` | text NULL | e.g. `gst`, `vat`, `none` |
| `tax_breakup` | JSONB NOT NULL DEFAULT `{}` | CGST/SGST/IGST etc. |
| `hsn_sac` | text NULL | |
| `custom_fields` | JSONB NOT NULL DEFAULT `{}` | |
| `created_at` / `updated_at` | | |

No float. All money NUMERIC.

---

## 4. Quote lifecycle

### 4.1 Statuses (server-validated)

```
draft → sent → viewed → accepted
                  ↘ rejected
                  ↘ expired
       → cancelled   (from draft|sent|viewed)
```

| Status | Meaning |
|--------|---------|
| `draft` | Mutable |
| `sent` | Issued; controlled revision only |
| `viewed` | Optional; may be set when tracking exists or manually |
| `accepted` | Terminal commercial accept |
| `rejected` | Terminal reject |
| `expired` | Past expiry (job or on-read transition) |
| `cancelled` | Voided |

**Not a normal PATCH field.** Transitions only via:

| Action | From | To | Permission |
|--------|------|-----|------------|
| `POST .../send` | draft | sent | `quotes:send` |
| `POST .../accept` | sent \| viewed | accepted | `quotes:accept` |
| `POST .../reject` | sent \| viewed | rejected | `quotes:reject` |
| `POST .../cancel` | draft \| sent \| viewed | cancelled | `quotes:cancel` |
| system expire | sent \| viewed | expired | internal |

`converted` (to invoice) is **out of 3A.4 write path** — reserve status or flag later when Finance lands; emit readiness via `crm.quote.accepted` for automation.

### 4.2 Accept must not silently win Deal

Accept updates Quote metadata + outbox only. Optional future automation may move Deal — **not** in Quote domain TX by default.

---

## 5. Snapshot strategy (normative)

**When lines are written (create/patch draft):**

1. If `product_id` set: load product in same tenant; copy name, sku, description, unit, list_price → line snapshots (caller may override unit_price).  
2. Persist **only** snapshot columns for commercial display/math.  
3. Never re-resolve product price on GET of a non-draft quote.

**After send:** line commercial fields immutable on that row. Edits require **new revision** (§9).

**Product rename/price change:** affects catalog + future drafts only.

---

## 6. Customer / Deal relationships

```
CustomerParty (required)
    ↑
  Quote ──optional──► Deal
    │
    ├── Contact?  (buyer / primary)
    └── Company?  (B2B context)
```

| Rule | Decision |
|------|----------|
| Quote without Deal | **Yes** |
| Quote with Deal | Same workspace; Deal exists; prefer Deal’s `customer_party_id` match or allow explicit party with validation |
| Conflicting party vs Deal party | Reject or require explicit override reason — **reject mismatch** in MVP |
| Duplicate customer models | Forbidden |
| Lead FK | Not in 3A.4 |

---

## 7. Tax / GST readiness

**Do not implement Finance tax engine.**

Store on header + lines:

- `taxable_amount`, `tax_amount`, `tax_rate`, `tax_type`  
- `tax_breakup` JSONB example:

```json
{
  "scheme": "in_gst",
  "cgst": { "rate": "9.00", "amount": "90.00" },
  "sgst": { "rate": "9.00", "amount": "90.00" },
  "igst": { "rate": "0.00", "amount": "0.00" },
  "place_of_supply": "27",
  "hsn_sac_rollups": []
}
```

- `place_of_supply`, `hsn_sac` on lines  
- `party_snapshot.gstin` / seller gstin from tenant profile when available  

Architecture: `scheme` discriminator (`in_gst`, `vat`, `none`, …). India pack first **as data**, not as sole code path.

**Server** recomputes totals on draft save from lines; reject client totals that disagree beyond rounding tolerance.

---

## 8. Money / currency

| Rule | Value |
|------|-------|
| Persistence | `NUMERIC(18,2)` money; qty `NUMERIC(18,4)` |
| API wire | Decimal **strings** (same as Deal) |
| Quote currency | Required; all lines in document currency (no FX in 3A.4) |
| Product currency | Required; warn/block if product currency ≠ quote currency unless converted manually by user override of unit_price |
| Rounding | Per-line round half-up to 2dp; document totals = sum of rounded lines (document discount applied then re-round — document in impl tests) |
| Shared util | Prefer promote `parseMoneyAmount` / `normalizeCurrency` to shared CRM money module |

No float in DB or domain arithmetic beyond parse.

---

## 9. Versioning / immutability

| State | Edit policy |
|-------|-------------|
| `draft` | Full mutate header + replace lines |
| `sent` / `viewed` | **No in-place commercial mutate.** `PATCH` rejected for money/lines. |
| Need changes after send | Create **new quote row**: `version+1`, `supersedes_quote_id`, copy snapshots, status `draft`, same `root_quote_id` / `quote_number` series policy |

**Numbering policy (recommended):** keep same human `quote_number` across revisions with `version` displayed (`Q-1042` v2), **or** allocate new number per revision — **lock in impl to: same `quote_number`, increment `version`** (cleaner customer conversation). Unique constraint: `(workspace_id, quote_number, version)` among non-deleted.

Terminal quotes (`accepted|rejected|expired|cancelled`): no revision from them except cancel rules already applied; accepted quotes are immutable.

---

## 10. API contract (plan only)

### Products — session

```
GET    /api/products
POST   /api/products
GET    /api/products/:id
PATCH  /api/products/:id
DELETE /api/products/:id
```

Query: `q`, `kind`, `is_active`, pagination.

### Quotes — session

```
GET    /api/quotes
POST   /api/quotes
GET    /api/quotes/:id          # includes lines
PATCH  /api/quotes/:id         # draft only (or metadata-limited)
DELETE /api/quotes/:id         # soft; draft or admin policy
POST   /api/quotes/:id/send
POST   /api/quotes/:id/accept
POST   /api/quotes/:id/reject
POST   /api/quotes/:id/cancel
POST   /api/quotes/:id/revise   # optional explicit; else revise via PATCH policy returning 409 + hint
```

Public `/v1/products`, `/v1/quotes` + same actions with API-key scopes.

**Out of 3A.4:** `POST .../pdf`, `POST .../convert-invoice` (stub 501 or omit).

List filters: status, customer_party_id, deal_id, q (number/name).

---

## 11. PDF / document strategy (plan only)

Align ADR-016/022:

- Template type `quote`  
- Payload: branding, party_snapshot, quote_number/version, dates, lines, tax_breakup, totals, terms, acceptance block  
- Async `document.render` job later  
- Send in 3A.4 may mark `sent` without PDF artifact  

**Do not build PDF in 3A.4 implementation until Documents wave — unless product explicitly expands scope later.**

---

## 12. RBAC

Seed under CRM module:

```
products:view | create | edit | delete
quotes:view | create | edit | delete | send | accept | reject | cancel
```

Submodules: `crm:products`, `crm:quotes` for nav entitlements.

Default roles: mirror deals (member view/create/edit/send; admin delete/cancel; accept/reject member+admin — tune in impl tests).

Tenant-scoped checks on every query (`workspace_id`).

---

## 13. Events / outbox

| Event | When |
|-------|------|
| `crm.product.created` | Insert |
| `crm.product.updated` | Patch |
| `crm.product.deleted` | Soft delete |
| `crm.quote.created` | Insert |
| `crm.quote.updated` | Draft patch / revise create |
| `crm.quote.sent` | send |
| `crm.quote.accepted` | accept |
| `crm.quote.rejected` | reject |
| `crm.quote.cancelled` | cancel |
| `crm.quote.expired` | expire transition (optional job) |

Jobs: `crm.product.record`, `crm.quote.record` (ack-only), same as Deal/Lead.  
**No** domain BullMQ. **No** duplicate pipeline automation.

---

## 14. Automation readiness (future — do not implement)

| Trigger | Example |
|---------|---------|
| `crm.quote.sent` | Follow-up task in 3 days |
| `crm.quote.accepted` | Create project / invoice draft command |
| `crm.quote.expired` | Notify owner |
| `crm.quote.rejected` | Lost-reason task on Deal |

---

## 15. Future Finance compatibility

Preserve on accepted Quote for invoice conversion:

- party_snapshot + customer_party_id  
- currency, all money totals, tax_breakup  
- every line snapshot (sku, name, qty, unit_price, discounts, tax, hsn_sac)  
- quote_number/version, accept metadata  
- deal_id if present  

Handoff: event/command `finance.invoice.create_from_quote` (name TBD) — **not** local invoice tables in 3A.4.

---

## 16. UI / responsive plan

| Route | Purpose |
|-------|---------|
| `/crm/products` | List, search, kind/active filters, create/edit |
| `/crm/products/[id]` | Detail |
| `/crm/quotes` | List, filters |
| `/crm/quotes/new` + `/crm/quotes/[id]` | Builder + detail |
| Actions | Send / Accept / Reject / Cancel / Revise |

**Builder:** form + line table; add/remove/reorder via buttons (no desktop-only DnD required).  
Breakpoints: **390 / 768 / 1280** — no horizontal overflow; tap targets ≥40px; no hover-only critical actions.  
ThinkAIQ branding. B2B/B2C via CustomerParty type presentation.

360: add quotes list on CustomerParty detail when Quote exists.

---

## 17. Migration strategy

```
expand (products, quotes, quote_line_items, sequences)
→ backfill = EMPTY (document PRODUCTION DATA = NONE)
→ dual-read = N/A
→ validate (tests + isolation)
→ contract = N/A
```

Additive only. No drops. Optional: `quote_number_sequences` table or workspace settings counter (like pipeline auto-number).

Deal: **no migration** beyond optional FK from `quotes.deal_id` → `deals(id)`.

---

## 18. Implementation checklist

- [x] Migrations + schema types  
- [x] Product CRUD + uniqueness  
- [x] Quote CRUD + line snapshots + totals engine  
- [x] Lifecycle actions + revision  
- [x] RBAC + `/v1`  
- [x] Outbox events + worker ack  
- [x] UI list/builder/detail  
- [x] Live isolation tests  
- [x] Customer 360 quotes slice  
- [x] Implementation report  
- [x] Explicit STOP — no Finance/PDF engine  

---

## 19. Product decisions (locked)

| ID | Decision |
|----|----------|
| L1–L10 | As in ADR-026 / original plan |
| O1 | Auto-ensure party (company > contact) — **shipped** |
| O2 | `viewed` via POST action — **shipped** |

---

## 20. Explicit non-goals

Finance invoices/payments/tax engine · PDF Playwright · WhatsApp/Voice/Support · Activity redesign · M:N company contacts · Price books/FX · Deal line items · Platform SaaS plan catalog

---

## 21. Planning / implementation gate

```
PHASE 3A.4 PLANNING = COMPLETE
PHASE 3A.4 MAIN IMPLEMENTATION = COMPLETE
READY FOR FINAL VERIFICATION = YES
NO CODE EXPANSION INTO FINANCE / PDF / WHATSAPP / VOICE
```
