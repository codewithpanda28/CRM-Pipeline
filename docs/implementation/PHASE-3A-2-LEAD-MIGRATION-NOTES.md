# PHASE-3A-2-LEAD-MIGRATION-NOTES.md

**Phase:** 3A.2 Canonical Lead  
**Migration:** `packages/db/migrations/20260905_003_canonical_leads.ts`  
**Strategy:** expand → (no backfill) → dual-read N/A → validate → contract later

---

## Production data

**No existing Lead table or Lead rows.** Backfill is a no-op. Explicitly documented: **PRODUCTION LEAD DATA = NONE**.

---

## Expand

1. Create `leads` (workspace-scoped, soft-delete, status CHECK).  
2. Create `lead_conversion_links` (lineage).  
3. Indexes: workspace+status, workspace+owner, lower(email) non-unique, phone digits expression optional.  
4. **Do not** drop contacts/companies/deals/pipeline_items.  
5. **Do not** alter frozen Deal schema except using existing FKs from Lead → deal_id.

---

## Dual-read / dual-write

Not applicable — greenfield Lead. Contacts remain separate. No dual-write with contact-as-lead widgets.

---

## Rollback

`down()`: drop `lead_conversion_links`, then `leads`. Contact/Company/Deal rows created by conversion **remain** (intentional — commercial records survive Lead rollback).

---

## Safety

- Tenant indexes only — no global unique email.  
- Contact email unique still enforced on convert create path.  
- Idempotent convert via status + links unique.
