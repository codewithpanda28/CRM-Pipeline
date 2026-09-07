# DOCUMENT_MANAGEMENT.md — ThinkAIQ

## 1. Purpose

Central document repository for proposals, quotes, invoices, agreements, contracts, KYC, GST docs, receipts, scripts, and attachments — with ACL, versioning, preview, and search.

Module code: `documents` · Priority: **P2**

---

## 2. Features

Categories · Search · Access control · Attachment relationships · Version history · Download · Preview

Files stored via [STORAGE.md](../deployment/STORAGE.md); DB holds metadata only.

---

## 3. User flows

Upload → classify category → link to entity → set ACL → version on replace → preview/download with audit

Document expiring (KYC/contracts) → notification `document.expiring`

---

## 4. Business rules

- Permission required on related entity to attach
- Version immutability of prior blobs
- Virus/content scanning hook
- Retention per [DATA_RETENTION.md](../security/DATA_RETENTION.md)

---

## 5. Data model

`documents`, `document_versions`, `document_links`, `document_acls`, `document_categories`

---

## 6. Permissions / APIs / Events

`documents.*` including `share`  
APIs: upload, list, get, version, ACL update  
Events: `document.uploaded` · `document.versioned` · `document.expiring`

---

## 7. Related documents

- [STORAGE.md](../deployment/STORAGE.md)
- [SECURITY.md](../security/SECURITY.md)
- [CRM_SPECIFICATION.md](./CRM_SPECIFICATION.md)
