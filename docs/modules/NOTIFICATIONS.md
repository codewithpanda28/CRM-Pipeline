# NOTIFICATIONS.md — ThinkAIQ

## 1. Purpose

Multi-channel notification system for product events.

Priority: **P1** (baseline in `core`; channel fan-out expands with `communications`)

---

## 2. Notification catalog (minimum)

New lead · Lead assignment · New deal · Deal stage change · Client creation · Payment received · Invoice created · Invoice overdue · Task due · Task overdue · Ticket created/updated · Subscription expiring · Domain expiring · Document expiring · Usage limit warning

---

## 3. Channels

In-app · Email · WhatsApp · SMS (where supported)

User/tenant preferences control channel routing; critical security notifications may force email.

---

## 4. Architecture

Domain event → notification router → preference filter → channel adapters → delivery logs

Async via workers. Idempotent notification keys per event+user+type.

---

## 5. Data model

`notification_types`, `notification_preferences`, `notifications` (in-app), `notification_deliveries`

---

## 6. Permissions / APIs

Users manage own preferences; admins manage tenant defaults.  
`GET /notifications`, `POST /notifications/mark-read`, `PATCH /notification-preferences`

---

## 7. Related documents

- [COMMUNICATIONS.md](./COMMUNICATIONS.md)
- [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md)
- [BACKGROUND_JOBS.md](../operations/BACKGROUND_JOBS.md)
