# CRM Field Ownership & Sync Contracts (Round A)

Canonical ownership for Sales Workflow Core. **No arbitrary two-way sync.**

| Field | Source of truth | Readable on | Editable on | Sync direction | Event | Conflict rule |
|-------|-----------------|-------------|-------------|----------------|-------|---------------|
| Name (pre-party) | `leads.name` | LeadRecord, search | LeadRecord | Convert → seed contact/company/party | `crm.lead@v1` convert | After convert: lead name display-only |
| Display name (post-party) | Contact/Company → `customer_parties.display_name` | PartyRecord, Deal card, search | Identity (contact/company) | One-way refresh party display_name | party/identity update | Identity wins |
| Phone | Lead (pre) / Contact (post) | Record, search | Lead / Contact | One-way to search index | identity update | Mode owner wins |
| Email | Lead (pre) / Contact (post) | Record, search | Lead / Contact | One-way to search index | identity update | Mode owner wins |
| Company | `leads.company_name` / `companies.name` | Record | Lead / Company | Convert creates/links company | convert | No independent Deal company name |
| Owner | `leads.owner_id` / `deals.owner_id` | Cards, lists | Lead / Deal editors | Task assignee ≠ deal owner | assign APIs | Explicit assign only |
| Source | `leads.source`; Deal copy-on-create | Record | Lead primarily | Deal.source set at create only | deal create | Lead historical source not overwritten |
| Stage | `deals.stage_id` | Pipeline, DealContext | DnD / stage picker | Dual-write `pipeline_items.stage_id` | stage_changed | Deal SoR |
| Probability | `deals.probability` | Pipeline, Deal | Deal; stage `default_probability` on enter | Projection to board display | stage enter / deal patch | Deal wins |
| Amount / currency | `deals.amount` / `currency` | Pipeline, Finance links | Deal | Projection to `pipeline_items` | deal update | Deal wins |
| Expected close | `deals.expected_close_at` | Deal, forecasts | Deal | — | deal update | Deal wins |
| Custom fields (canonical) | `crm_field_values` | Record sections | Section forms | No cross-entity dual-write | field write | Definition + ownership map |
| Legacy JSONB | `leads/deals/parties.custom_fields` | Legacy only | Legacy paths | Do not dual-write with `crm_field_values` | — | Prefer `crm_field_values` for new defs |
| Pipeline board fields | `pipeline_fields` + item `field_values` | Cards/Compact | Board secondary only | Projection / board cache | item update | Not SoR for deal amount/stage |

## Projection policy

`pipeline_items.field_values` is a **read-model / board cache**. Canonical commercial opportunity columns live on `deals`. Writers: deal ↔ pipeline projection helpers only.

## Customization SoR

- Metadata: `crm_record_sections`, `crm_field_definitions`, `crm_field_options` (tenant-scoped)
- Values: `crm_field_values` (entity_type + entity_id + field_key)
- Do **not** invent a second identity, deal, or task system
