# STORAGE.md — ThinkAIQ

## 1. Purpose

File storage abstraction. **Do not store file bytes as DB blobs.** Metadata in DB; bytes in object storage.

---

## 2. Targets

S3 · S3-compatible · other cloud object stores via adapter interface.

---

## 3. `files` metadata

tenant_id · bucket · object_key · filename · mime · size · checksum · visibility · created_by · created_at · deleted_at

Object key pattern: `tenants/{tenant_id}/{category}/{yyyy}/{mm}/{uuid}`

---

## 4. Access

- Private by default
- Short-lived signed URLs
- Public only for approved branding assets
- Permission check before sign

---

## 5. Related documents

- [DOCUMENT_MANAGEMENT.md](../modules/DOCUMENT_MANAGEMENT.md)
- [SECURITY.md](../security/SECURITY.md)
- [ENVIRONMENT_CONFIGURATION.md](./ENVIRONMENT_CONFIGURATION.md)
