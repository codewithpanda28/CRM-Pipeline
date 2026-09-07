# ThinkAIQ Documentation — Phase 0 Index

**Phase:** 0 — Documentation-first architecture (no production implementation)  
**North star:** Automate as much as safely possible → [product/MASTER_PRINCIPLES.md](./product/MASTER_PRINCIPLES.md)  
**Model:** ONE CODEBASE → ONE PLATFORM → MANY TENANTS → MANY PLANS → MANY MODULES → MANY BRANDS

---

## Hierarchy

```
docs/
├── README.md                 ← you are here
├── PHASE_0_SUMMARY.md        ← Phase 0 review deliverable
├── product/                  ← vision, requirements, packaging, plan, traceability
├── architecture/             ← system, tenancy, WL, identity, responsive, modules, plugins, scale
├── modules/                  ← CRM, Sales, Finance, WhatsApp, Voice, …
├── database/                 ← schema + ERD
├── security/                 ← security, RBAC, audit, retention
├── api/                      ← REST, webhooks, events, errors, versioning
├── automation/               ← advanced automation engine
├── integrations/             ← provider integrations
├── operations/               ← Super Admin, ops center, jobs, metering, observability
├── deployment/               ← deploy, env, storage, backup
├── testing/                  ← test strategy
├── decisions/                ← ADRs
├── roadmap/                  ← phased roadmap
└── diagrams/                 ← future ERD exports
```

---

## Start reading (order)

1. [product/MASTER_PRINCIPLES.md](./product/MASTER_PRINCIPLES.md)  
2. [product/PRODUCT_VISION.md](./product/PRODUCT_VISION.md)  
3. [product/PRODUCT_REQUIREMENTS.md](./product/PRODUCT_REQUIREMENTS.md)  
4. [architecture/SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md)  
5. [architecture/MULTI_TENANCY.md](./architecture/MULTI_TENANCY.md)  
5b. [architecture/PLATFORM_IDENTITY_AND_BRANDING.md](./architecture/PLATFORM_IDENTITY_AND_BRANDING.md) · [WHITE_LABEL_ARCHITECTURE.md](./architecture/WHITE_LABEL_ARCHITECTURE.md) · [RESPONSIVE_AND_MOBILE.md](./architecture/RESPONSIVE_AND_MOBILE.md)  
6. [operations/SUPER_ADMIN.md](./operations/SUPER_ADMIN.md) + [PLATFORM_OPS_CENTER.md](./operations/PLATFORM_OPS_CENTER.md)  
7. [automation/AUTOMATION_ENGINE.md](./automation/AUTOMATION_ENGINE.md)  
8. [database/DATABASE_SCHEMA.md](./database/DATABASE_SCHEMA.md) + [DATABASE_ERD.md](./database/DATABASE_ERD.md)  
9. [product/REQUIREMENTS_TRACEABILITY.md](./product/REQUIREMENTS_TRACEABILITY.md)  
10. [PHASE_0_SUMMARY.md](./PHASE_0_SUMMARY.md)  

---

## Area map (required Phase 0 coverage)

| # | Area | Document(s) |
|---|------|-------------|
| Audit | Vencore foundation assessment | [`audit/VENCORE_AUDIT.md`](./audit/VENCORE_AUDIT.md) |
| 1B | Open-source component radar | [`implementation/OPEN-SOURCE-COMPONENT-RADAR.md`](./implementation/OPEN-SOURCE-COMPONENT-RADAR.md) |
| 1C | Queue + PDF ADRs | [`adr/`](./adr/) · [`implementation/PHASE-1C-DECISIONS.md`](./implementation/PHASE-1C-DECISIONS.md) |
| 1D | Tenancy, WL, outbox | [`adr/ADR-017`](./adr/ADR-017-MULTI-TENANT-PROVISIONING-AND-HOST-RESOLUTION.md) · [`ADR-018`](./adr/ADR-018-TENANT-WHITE-LABEL-AND-THEME-RUNTIME.md) · [`ADR-019`](./adr/ADR-019-TRANSACTIONAL-OUTBOX-AND-BULLMQ-PUBLISHER.md) · [`implementation/PHASE-1D-TENANCY-AND-OUTBOX-PLAN.md`](./implementation/PHASE-1D-TENANCY-AND-OUTBOX-PLAN.md) |
| 1E | Doc sync + P0 gate | [`implementation/PHASE-1E-FINAL-FOUNDATION-GATE.md`](./implementation/PHASE-1E-FINAL-FOUNDATION-GATE.md) · ADR-020…023 |
| 2A | Tenant foundation (code) | [`implementation/PHASE-2A-CODE-PLAN.md`](./implementation/PHASE-2A-CODE-PLAN.md) · [`PHASE-2A-IMPLEMENTATION-REPORT.md`](./implementation/PHASE-2A-IMPLEMENTATION-REPORT.md) |
| 2B | Live isolation + outbox/BullMQ (**plan**) | [`implementation/PHASE-2B-PLAN.md`](./implementation/PHASE-2B-PLAN.md) |
| 1–3 | Product / system / module architecture | `architecture/*`, `product/*`, `architecture/MODULE_SYSTEM.md` |
| 4–5 | Multi-tenant + white-label + platform identity | `MULTI_TENANCY.md`, `WHITE_LABEL_ARCHITECTURE.md`, `PLATFORM_IDENTITY_AND_BRANDING.md`, `RESPONSIVE_AND_MOBILE.md`, ADR-001/011/018 |
| 6–7 | Super Admin + RBAC | `operations/SUPER_ADMIN.md`, `security/RBAC_PERMISSIONS.md` |
| 8–9 | Database + ERD | `database/*` |
| 10–14 | CRM / Sales / Finance / Billing / Automation | `modules/*`, `automation/*` |
| 15–17 | Comms / WhatsApp / Voice | `COMMUNICATIONS.md`, `WHATSAPP.md`, `VOICE_AI.md`, ADR-012 |
| 18–20 | API / Webhooks / Integrations | `api/*`, `integrations/*`, ADR-009 |
| 21–23 | Metering / entitlements / reseller | `USAGE_METERING.md`, `MODULE_SYSTEM.md`, `RESELLER_SYSTEM.md` |
| 24–28 | Security / audit / backup / observability / incidents | `security/*`, `BACKUP_RECOVERY.md`, `operations/*` |
| 29–33 | Storage / jobs / scheduler / notifications / reporting | `STORAGE.md`, `BACKGROUND_JOBS.md`, `SCHEDULER.md`, `NOTIFICATIONS.md`, `REPORTING_ANALYTICS.md` |
| 36 | Customization / plugins / testing / deploy / env / scale / errors / retention / versioning / extensibility | `CUSTOMIZATION.md`, `PLUGIN_SYSTEM.md`, `testing/*`, `deployment/*`, `SCALABILITY.md`, … |

---

## Mandatory gates (every future feature)

**A. Architecture gate** + **B. Autonomous OS gate** — see [MASTER_PRINCIPLES.md](./product/MASTER_PRINCIPLES.md) and checklist in [PHASE_0_SUMMARY.md](./PHASE_0_SUMMARY.md).

---

## ADRs

All under [decisions/](./decisions/) (ADR-001 … ADR-014).

---

## Status

Documentation Phase 0 complete for review. **Do not begin full production coding until this phase is approved.**
