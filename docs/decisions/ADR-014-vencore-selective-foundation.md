# ADR-014 — Vencore as Selective Foundation

| Field | Value |
|-------|-------|
| Status | Proposed |
| Date | 2026-09-04 |
| Based on | [VENCORE_AUDIT.md](../audit/VENCORE_AUDIT.md) |

## Context

ThinkAIQ needs a modular TS SaaS core. Vencore is an MIT self-hosted company OS with real CRM, RBAC, plugins, and API keys — but single-workspace setup, no finance, weak automation vs ThinkAIQ, instance-level white-label.

## Decision (proposed)

**Option B:** Use Vencore **selectively** — adopt monorepo/CRM/auth/module/plugin/API/worker patterns and packages; build ThinkAIQ platform layers (multi-tenant SaaS, Super Admin ops, finance, advanced automation, tenant WL, WhatsApp, metering) as new modules/packages.

## Consequences

- Faster CRM start; attribution to Vencore MIT required  
- Must not pretend Vencore is already multi-tenant SaaS  
- Security hardening mandatory before public SaaS  
- Adaptation work tracked under ThinkAIQ ADRs/phases  

## Alternatives rejected

- **A** Primary foundation as-is — unsafe/incomplete for ThinkAIQ SaaS  
- **C** Other OSS — no inspected better fit yet  
- **D** Fully independent — wastes verified CRM/plugin value  
