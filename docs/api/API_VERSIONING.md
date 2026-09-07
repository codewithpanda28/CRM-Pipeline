# API_VERSIONING.md — ThinkAIQ

## 1. Purpose

Versioning policy for public and tenant APIs.

---

## 2. Policy

- URL versioning: `/api/v1`, `/api/v2`
- Additive non-breaking changes preferred within a version
- Breaking changes require new version
- Deprecation window communicated (minimum 90 days recommended)
- Sunset headers on deprecated endpoints

---

## 3. Compatibility rules

Breaking: removing fields, renaming, changing types/meanings, tightening validation unexpectedly  
Non-breaking: additive fields, new endpoints, new optional filters

---

## 4. Related documents

- [API_SPECIFICATION.md](./API_SPECIFICATION.md)
- [ERROR_HANDLING.md](./ERROR_HANDLING.md)
