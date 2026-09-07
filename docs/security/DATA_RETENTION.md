# DATA_RETENTION.md — ThinkAIQ

## 1. Purpose

Retention, deletion, anonymization, and export policies.

---

## 2. Policies (configurable defaults)

| Data class | Default retention idea |
|------------|------------------------|
| Soft-deleted business records | 30–90 days then purge |
| Audit logs | 1–7 years (jurisdiction) |
| Auth logs | 1 year+ |
| Voice recordings | Tenant policy / plan limit |
| Cancelled tenant | Grace period then export window then purge |
| Backups | Per BACKUP_RECOVERY |

---

## 3. Legal holds

Tenant-level legal hold flag blocks purge.

---

## 4. Account export

Async export job produces archive of tenant data for Owner/Admin and Super Admin support flows.

---

## 5. Related documents

- [BACKUP_RECOVERY.md](../deployment/BACKUP_RECOVERY.md)
- [SECURITY.md](./SECURITY.md)
- [MULTI_TENANCY.md](../architecture/MULTI_TENANCY.md)
