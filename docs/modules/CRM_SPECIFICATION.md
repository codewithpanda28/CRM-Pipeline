# CRM_SPECIFICATION.md — ThinkAIQ

## 1. Purpose

CRM is the system of record for leads, contacts, companies/accounts, clients, activities, notes, tags, custom fields, and attachments — with a Customer 360 view and timeline.

Module code: `crm` · Priority: **P1**

---

## 2. User roles

| Role | Typical access |
|------|----------------|
| Sales User | Leads/contacts/deals-related CRM ops |
| Manager | Team scope + reporting |
| Tenant Admin/Owner | Configure fields, sources, statuses |
| Finance/Support | View client 360 as permitted |

---

## 3. Entities

### 3.1 Lead

Fields (minimum): name/company hint, email, phone, source, owner, status, score, qualification flags, tags, custom fields, notes, attachments, duplicate keys.

**Sources:** Website, Referral, Cold Outreach, WhatsApp, Social Media, Ads, Partners, Import, Custom.

**Features:** capture, assignment/reassignment, duplicate detection, bulk import/export/actions, filters, saved views, activity timeline.

### 3.2 Contact

Name, email, phone, designation, department, company, address, notes, tags.

### 3.3 Company / Account

Company name, industry, website, address, GSTIN, contacts, owner, source, status.

Multiple contacts per company required.

### 3.4 Client

Converted/active customer record used by Customer 360 and finance/support links.

### 3.5 Activities / Notes / Tags / Custom Fields / Attachments

Shared CRM primitives; attachments use storage abstraction.

---

## 4. Lead conversion & commercial lifecycle (no history loss)

```
Lead → Contact → Company → Deal → Client
```

**Lifecycle alignment (status/pipeline):**

New → Contacted → Qualified → Demo → Proposal → Negotiation → Won/Lost → Onboarding → Active

Rules:

- Conversion creates linked records and preserves lead id lineage
- Timeline merges: lead events remain visible on resulting client/contact
- Partial conversion allowed (e.g., contact only) with explicit steps
- Idempotent conversion guards against double-convert
- Prefer automation for onboarding tasks after Won ([MASTER_PRINCIPLES.md](../product/MASTER_PRINCIPLES.md))
- WhatsApp-origin leads deep-link to conversations ([WHATSAPP.md](./WHATSAPP.md))

---

## 5. Customer 360

Unified client profile includes:

Basic details · Contacts · Leads · Deals · Quotes · Orders · Subscriptions · Invoices · Payments · Tasks · Meetings · Emails · WhatsApp · Calls · Documents · Tickets · Notes · Activities · Automation history · Optional Voice AI data

Tabs/modules appear only if entitled + permitted. Customer 360 is a **connected OS view** (not a static form) — events and automations remain visible in history.

---

## 6. User flows

### Create lead

1. Manual / import / API / webform / WhatsApp ingest
2. Validate required fields + duplicate check warning
3. Assign owner (round-robin rules optional via automation)
4. Emit `lead.created`
5. Timeline entry + notifications

### Convert lead

1. User selects Convert
2. Map fields to Contact/Company/Deal/Client
3. Confirm duplicates
4. Persist links + status `converted`
5. Emit conversion events

### Bulk import

Upload → Map fields → Validate → Preview → Duplicate check → Import → Result report  
(Async job; see [BACKGROUND_JOBS.md](../operations/BACKGROUND_JOBS.md))

---

## 7. Business rules

- Tenant-scoped uniqueness strategies for email/phone (configurable strictness)
- Soft-delete default; hard delete only with permission + audit
- Owner mandatory for assignment-based workflows (or queue unassigned)
- Custom fields validated against field definitions
- Saved views are per-user or shareable with `share` permission

---

## 8. Data model (summary)

Tables: `leads`, `contacts`, `companies`, `company_contacts`, `clients`, `notes`, `tags`, `taggings`, `custom_field_definitions`, `custom_field_values`, `attachments`, `activities`, `lead_conversion_links`, `saved_views`

All include `tenant_id`, timestamps, soft delete where appropriate.

Full columns: [DATABASE_SCHEMA.md](../database/DATABASE_SCHEMA.md).

---

## 9. Permissions

Examples: `crm.leads.*`, `crm.contacts.*`, `crm.companies.*`, `crm.clients.*`, `crm.notes.*`, `crm.import`, `crm.export`, `crm.configure`

Scopes: own/team/all.

---

## 10. APIs

- `POST/GET/PATCH/DELETE /leads`
- `POST /leads/{id}/assign`
- `POST /leads/{id}/convert`
- `POST /leads/import`, `GET /leads/export`
- CRUD for contacts, companies, clients
- Notes/tags/attachments nested routes
- `GET /clients/{id}/360`

Pagination, filter, sort required.

---

## 11. Events / webhooks / automation

| Event | Automation use |
|-------|----------------|
| `lead.created` | Assign, task, email |
| `lead.updated` | Score/status flows |
| `lead.status_changed` | Branching |
| `lead.assigned` | Notify owner |
| `lead.converted` | Downstream sales/finance |
| `contact.created` | Welcome sequences |
| `client.created` | Onboarding |

---

## 12. Notifications

New lead · assignment · conversion · duplicate conflict on import (to actor)

---

## 13. Validation & edge cases

- Missing email AND phone on lead (policy: allow with warning or require one)
- Converted lead edits restricted
- Company without contacts allowed
- GSTIN format validation when India tax enabled
- Attachment malware/type rejection

---

## 14. Reporting impact

Lead source · conversion · client growth · churn (with billing data) · owner performance

---

## 15. Future extension points

- Lead scoring models/plugins
- Enrichment providers
- Form builder module
- Dedup ML assist

---

## 16. Related documents

- [SALES_SPECIFICATION.md](./SALES_SPECIFICATION.md)
- [CUSTOMIZATION.md](../architecture/CUSTOMIZATION.md)
- [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md)
- [API_SPECIFICATION.md](../api/API_SPECIFICATION.md)
