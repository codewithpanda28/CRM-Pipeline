# ADR-011 — White-Label Runtime Strategy

| Field | Value |
|-------|-------|
| Status | Proposed |
| Date | 2026-09-04 |

## Context

Many brands on one codebase without forks.

## Decision (proposed)

Host-based tenant resolution → load branding/config from DB (cached) → inject theme tokens + assets. Subdomains first; custom domains + SSL per ADR-005. No per-tenant deploy.

**Refined by [ADR-018](../adr/ADR-018-TENANT-WHITE-LABEL-AND-THEME-RUNTIME.md)** (ThemeSnapshot, token precedence, asset isolation, WL security).  
**Platform default product identity:** [PLATFORM_IDENTITY_AND_BRANDING.md](../architecture/PLATFORM_IDENTITY_AND_BRANDING.md) (**ThinkAIQ CRM**).
