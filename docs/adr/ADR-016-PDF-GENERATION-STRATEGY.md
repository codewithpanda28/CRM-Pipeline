# ADR-016 — PDF Generation Strategy

| Field | Value |
|-------|-------|
| Status | **Accepted** (Phase 1C) |
| Date | 2026-09-04 |
| Relates to | Finance/billing specs, STORAGE.md, ADR-015 (async jobs), [OPEN-SOURCE-COMPONENT-RADAR.md](../implementation/OPEN-SOURCE-COMPONENT-RADAR.md) |
| Scope | ThinkAIQ document/PDF generation for finance and business docs |

---

## 1. Context

ThinkAIQ must generate **tenant-branded** PDFs for:

Invoices · quotations · credit notes · debit notes · receipts · statements · reports · future agreements/certificates

Requirements include: GST-ready Indian layouts (HSN/SAC, CGST/SGST/IGST tables), logos, addresses, GSTIN, footers, numbering, custom fields, multilingual text, tables, page breaks, headers/footers, QR (UPI/payment), optional barcodes, template versioning, preview, secure storage, email attachment — **with zero cross-tenant leakage**.

Generation must integrate with the job runtime (ADR-015): heavy render work is **async**.

---

## 2. Options evaluated

| Option | Strengths | Weaknesses | GST/HTML layouts | Ops |
|--------|-----------|------------|------------------|-----|
| **PDFKit** | MIT, streaming, Node-native, deterministic drawing | Manual layout; weak HTML/CSS; slow to match designer templates | Painful for complex tax tables | Light |
| **pdf-lib** | MIT; merge/stamp/fill existing PDFs | Not ideal as primary “design from scratch” for rich invoices | Better as post-process | Light |
| **Playwright** | Excellent HTML/CSS; Tailwind/brand tokens; page breaks; fonts; screenshot-quality | Heavier memory; needs Chromium in worker image | **Best** for branded GST docs | Medium |
| **Puppeteer** | Same class as Playwright | Older API; Playwright preferred for maintainability | Same | Medium |
| **@react-pdf/renderer** | React components; no browser | Weaker CSS; limited layout vs HTML invoice designs | Mediocre for dense GST tables | Light |

Stars were not used as the decision driver — layout fidelity + tenant branding + ops fit were.

---

## 3. Strategies

| ID | Strategy |
|----|----------|
| **A** | HTML/CSS → Playwright only |
| **B** | PDFKit structured generation only |
| **C** | **Hybrid** — HTML/CSS → Playwright primary; pdf-lib for stamp/merge/watermark; PDFKit optional niche |
| **D** | @react-pdf primary |

---

## 4. ThinkAIQ document abstraction (mandatory)

Finance/CRM modules must **not** import Playwright/PDFKit directly.

### Conceptual model

```text
DocumentTemplate
  id, tenantId, type (invoice|quote|credit_note|…),
  version, engine (html_playwright|pdfkit|…),
  body (HTML/Handlebars or structured AST),
  locale, paperSize, status (draft|published)

DocumentRenderer  // port
  render(request: RenderRequest): Promise<DocumentArtifact>

RenderRequest
  tenantId, templateId|type, dataPayload,
  brandingSnapshot, locale, idempotencyKey

DocumentRenderJob
  enqueued via JobQueue (jobName=document.render)
  tenantId, request, priority

DocumentArtifact
  id, tenantId, sha256, storageKey, mime=application/pdf,
  bytes|null, pageCount, templateVersionId,
  createdAt, expiresAt?

DocumentVersion
  immutable template revision; artifacts pin version used
```

### Flow

```text
Business action (invoice finalized)
  → persist invoice + branding_snapshot + template_version_id
  → enqueue document.render (tenantId, invoiceId, idempotencyKey)
  → Worker: DocumentRenderer.render
       load template + data (tenant-scoped)
       render PDF bytes
       put object storage: tenants/{tenantId}/documents/{artifactId}.pdf
       insert artifact row
  → downstream: email attach / download signed URL / portal
```

---

## 5. Tenant branding & isolation

Renderer inputs **must** include an explicit branding snapshot (or load strictly by `tenantId`):

- logo URL (tenant storage only)  
- colors / CSS variables  
- legal name, address, GSTIN, bank details  
- footer, QR payload  
- numbering series already allocated on invoice row  

**Isolation rules**

1. Every query in render path filters `tenant_id`.  
2. Object keys always under `tenants/{tenantId}/…`.  
3. Template HTML may not fetch arbitrary remote URLs (SSRF): allowlist tenant storage + static asset CDN.  
4. No shared browser context reuse across tenants without clearing storage/cookies (prefer fresh context per job or hardened pool with reset).  
5. Logs store artifact id + tenant id — not full PDF PII dumps.

---

## 6. Decision analysis

**PDFKit-only (B)** fails ThinkAIQ’s need for designer-friendly, multilingual, dense GST tables and rapid WL template iteration.

**@react-pdf (D)** is cleaner DX for simple docs but fights complex CSS/print layouts Indian invoices need.

**Playwright-only (A)** is almost right but needs **pdf-lib** for merge/stamp (e.g., “PAID” overlay, combine statement packs) without re-rendering.

### Chosen: **C — Hybrid**

| Role | Tool |
|------|------|
| Primary financial/business docs | **HTML/CSS templates → Playwright** |
| Post-process (merge, watermark, stamp) | **pdf-lib** |
| Escape hatch (simple system receipts, tiny tickets) | **PDFKit** optional later — not required Day 1 |
| Puppeteer | **Not selected** (Playwright preferred) |
| @react-pdf | **Not primary** |

**Why not convenience-only:** Pixel/layout control for GST + tenant CSS tokens outweighs lighter PDFKit DX. Async workers absorb Chromium cost (ADR-015).

---

## 7. Performance architecture

| Mode | When |
|------|------|
| **Synchronous** | Avoid for final invoices. Optional: tiny preview thumbnail or draft HTML preview in browser (not PDF). |
| **Asynchronous (default)** | `document.render` via BullMQ `documents` queue; user sees “Generating…” then download. |
| **Cached artifacts** | Artifact keyed by `(tenantId, docType, sourceId, templateVersionId, dataHash)`. Reuse if unchanged. |
| **Regeneration** | New template version or corrected invoice → new artifact; old retained for audit (soft-obsolete). |
| **Concurrency** | Limit Chromium concurrency per worker (e.g. 1–2 pages parallel); scale workers horizontally. Queue priority: user-waiting invoice > bulk statement runs. |
| **Memory** | Isolate browser per job or strict pool reset; fail job on OOM → retry on fresh worker. |

Email attachment: wait for artifact ready (or attach after webhook/event `document.ready`).

Storage: S3-compatible; DB holds metadata only.

---

## 8. Template versioning & preview

- Draft templates editable in Settings; **publish** creates immutable `DocumentVersion`.  
- Preview: render with sample/fixture data in sandbox job or dedicated preview queue (watermark “PREVIEW”).  
- Production documents pin `template_version_id` for legal reproducibility.

---

## 9. Security

- Chromium in worker image only — not on public API nodes if avoidable.  
- Disable dangerous browser features; block file:// and internal IP navigation (SSRF).  
- Fonts: ship licensed fonts in image or tenant-uploaded fonts scanned/validated.  
- QR libraries: prefer MIT (e.g. `qrcode`) drawn into HTML before print.

---

## 10. Final recommendation

# DECISION: Hybrid C — Playwright (HTML/CSS) primary + pdf-lib post-process

**Abstraction boundary**

- **In:** `DocumentRenderer` port, HTML template engine, Playwright adapter, pdf-lib adapter, `document.render` jobs, artifact storage.  
- **Out:** Finance modules calling Playwright; sync PDF in API request path for final docs.  
- **Deferred:** PDFKit adapter until a concrete low-level need appears; @react-pdf not adopted as primary.

**Status:** Accepted for Phase 1C planning. Implementation starts only after Phase 1 foundation gate.

**Follow-on:** Template bind language locked in [ADR-022](./ADR-022-DOCUMENT-TEMPLATE-DSL.md) (HTML/CSS + strict Handlebars). ADR-016’s Playwright hybrid decision is unchanged.
