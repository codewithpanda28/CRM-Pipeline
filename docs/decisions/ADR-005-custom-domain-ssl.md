# ADR-005 — Custom Domain & SSL Workflow

| Field | Value |
|-------|-------|
| Status | Proposed |
| Date | 2026-09-04 |

## Context

White-label requires tenant subdomains and custom domains with SSL verification. Phase 1 may ship subdomains only, but architecture must not paint into a corner.

## Decision (proposed)

1. **Phase 1:** Platform wildcard cert for `*.thinkaiq.com` tenant subdomains  
2. **Phase 2:** Custom domain DNS TXT/CNAME verification + automated certificates (ACM/Caddy/Traefik/cert-manager — choose with deploy stack)  
3. Persist domain verification state machine in `tenant_domains`

## Consequences

- Early tenants get WL via subdomain quickly
- Custom domains become entitlement-gated Pro/Enterprise feature
- Need operational alerts for cert renewal failures

## Open choice

Exact ingress controller / cert automation tool deferred to deployment stack ratification (ties to ADR-002/DEPLOYMENT).
