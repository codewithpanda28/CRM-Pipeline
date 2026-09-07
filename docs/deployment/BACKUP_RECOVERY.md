# BACKUP_RECOVERY.md — ThinkAIQ

## 1. Purpose

Define backup, restore, and disaster recovery expectations.

---

## 2. Backup scope

- PostgreSQL (full + WAL/PITR preferred)
- Object storage versioning/replication
- Secrets/config backups (secured)
- Not required: ephemeral cache/queue (rebuildable), though DLQ snapshots optional

---

## 3. Targets (initial proposals — finalize pre-prod)

| Metric | Target proposal |
|--------|-----------------|
| RPO | ≤ 1 hour (PITR better) |
| RTO | ≤ 4 hours for primary region restore |

---

## 4. Restore drills

Quarterly restore test documented with results. Tenant-level restore is hard on shared DB — prefer PITR + selective export; document limitations.

---

## 5. Related documents

- [SECURITY.md](../security/SECURITY.md)
- [DATA_RETENTION.md](../security/DATA_RETENTION.md)
- [DEPLOYMENT.md](./DEPLOYMENT.md)
