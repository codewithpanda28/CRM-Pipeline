# SCHEDULER.md — ThinkAIQ

## 1. Purpose

Time-based execution: daily/weekly/monthly, specific date/time, relative dates.

---

## 2. Examples

- Morning overdue payment reminders
- Subscription expiry reminder 7 days before
- Monthly invoice generation
- Recurring tasks
- Domain/channel expiry checks
- Usage threshold scans

---

## 3. Design

- Scheduler definitions table + distributed lock / leader election
- Enqueue worker jobs; scheduler itself stays thin
- Tenant timezone support in settings

---

## 4. Related documents

- [BACKGROUND_JOBS.md](./BACKGROUND_JOBS.md)
- [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md)
- [FINANCE_SPECIFICATION.md](../modules/FINANCE_SPECIFICATION.md)
