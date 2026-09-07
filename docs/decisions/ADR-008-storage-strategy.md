# ADR-008 — Object Storage Strategy

| Field | Value |
|-------|-------|
| Status | Proposed |
| Date | 2026-09-04 |

## Context

Invoices, logos, attachments, WhatsApp media, voice recordings must not live as DB blobs.

## Decision (proposed)

S3-compatible object storage; DB stores metadata only; private objects via signed URLs; keys namespaced `tenants/{tenant_id}/...`.
