/** Notification event type catalog (Phase 5). */
export const NOTIFICATION_EVENT_TYPES = {
  // CRM
  DEAL_STAGE_CHANGED: 'deal.stage_changed',
  QUOTE_SENT: 'quote.sent',
  QUOTE_ACCEPTED: 'quote.accepted',
  QUOTE_EXPIRING: 'quote.expiring',
  QUOTE_EXPIRED: 'quote.expired',
  TASK_DUE: 'task.due',
  TASK_OVERDUE: 'task.overdue',
  // Finance
  INVOICE_ISSUED: 'finance.invoice.issued',
  INVOICE_DUE: 'finance.invoice.due',
  INVOICE_OVERDUE: 'finance.invoice.overdue',
  PAYMENT_RECEIVED: 'finance.payment.received',
  PAYMENT_REFUNDED: 'finance.payment.refunded',
  // Automation (catalog only — delivery still via this bus, not automation engine)
  AUTOMATION_APPROVAL_REQUIRED: 'automation.approval_required',
  AUTOMATION_RUN_FAILED: 'automation.run_failed',
} as const;

export type NotificationEventType =
  (typeof NOTIFICATION_EVENT_TYPES)[keyof typeof NOTIFICATION_EVENT_TYPES];

export type NotificationChannel = 'in_app' | 'email';
export type NotificationSeverity = 'info' | 'warning' | 'critical';
