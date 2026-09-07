# BACKGROUND_JOBS.md — ThinkAIQ

## 1. Purpose

Async processing for emails, notifications, automation, imports/exports, reports, invoice generation, reminders, webhooks, voice processing.

---

## 2. Principles

- Every job payload includes `tenant_id` when tenant-scoped
- Idempotent handlers
- Retries with backoff + DLQ
- Correlation IDs
- Observability metrics

---

## 3. Job catalog (minimum)

`email.send` · `notification.dispatch` · `automation.step` · `import.run` · `export.run` · `report.generate` · `invoice.pdf` · `reminder.dispatch` · `webhook.deliver` · `voice.process` · `usage.aggregate` · `tenant.provision`

---

## 4. Related documents

- [SCHEDULER.md](./SCHEDULER.md)
- [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md)
- [OBSERVABILITY.md](./OBSERVABILITY.md)
- [ERROR_HANDLING.md](../api/ERROR_HANDLING.md)
