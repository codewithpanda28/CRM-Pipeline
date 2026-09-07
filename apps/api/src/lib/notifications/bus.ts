/**
 * Notification bus — idempotent in-app + email delivery.
 * Does NOT call automation engines.
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { SmtpConfig } from '@vencore/config';
import { notify } from '../notify';
import { logger } from '../logger';
import type { NotificationChannel, NotificationSeverity } from './catalog';

export interface DeliverNotificationParams {
  workspaceId: string;
  userId: string;
  eventType: string;
  title: string;
  body: string;
  channel: NotificationChannel;
  severity?: NotificationSeverity;
  resourceType?: string;
  resourceId?: string;
  /** Required for idempotency — unique per workspace */
  deliveryKey: string;
  /** Optional SMTP override (else workspace/setup config) */
  smtp?: SmtpConfig | null;
}

async function resolveSmtp(
  db: Kysely<Database>,
  workspaceId: string,
  override?: SmtpConfig | null,
): Promise<{ smtp: SmtpConfig | null; fromName: string | null; fromAddress: string | null }> {
  if (override) {
    return { smtp: override, fromName: null, fromAddress: null };
  }

  const branding = await db
    .selectFrom('tenant_branding')
    .select(['email_from_name', 'email_from_address'])
    .where('tenant_id', '=', workspaceId)
    .executeTakeFirst();

  // Workspace IMAP/SMTP-ish settings live in workspace_imap_config for mail module;
  // platform SMTP from env is the relay fallback.
  const host = process.env['SMTP_HOST'];
  const port = process.env['SMTP_PORT'] ? Number(process.env['SMTP_PORT']) : 587;
  const user = process.env['SMTP_USER'] ?? '';
  const password = process.env['SMTP_PASSWORD'] ?? '';
  const from =
    branding?.email_from_address ||
    process.env['SMTP_FROM'] ||
    process.env['EMAIL_FROM'] ||
    '';

  if (!host || !from) {
    return {
      smtp: null,
      fromName: branding?.email_from_name ?? null,
      fromAddress: branding?.email_from_address ?? null,
    };
  }

  return {
    smtp: {
      host,
      port,
      secure: process.env['SMTP_SECURE'] === '1' || port === 465,
      user,
      password,
      from: branding?.email_from_name
        ? `${branding.email_from_name} <${from}>`
        : from,
    },
    fromName: branding?.email_from_name ?? null,
    fromAddress: branding?.email_from_address ?? from,
  };
}

export async function deliverNotification(
  db: Kysely<Database>,
  params: DeliverNotificationParams,
): Promise<{ status: 'delivered' | 'skipped' | 'failed'; deliveryId: string | null }> {
  const severity = params.severity ?? 'info';
  const deliveryKey = params.deliveryKey;

  const existing = await db
    .selectFrom('notification_deliveries')
    .select(['id', 'status'])
    .where('workspace_id', '=', params.workspaceId)
    .where('delivery_key', '=', deliveryKey)
    .executeTakeFirst();

  if (existing && (existing.status === 'delivered' || existing.status === 'skipped')) {
    return { status: existing.status, deliveryId: existing.id };
  }

  let deliveryId = existing?.id ?? null;
  if (!deliveryId) {
    try {
      const row = await db
        .insertInto('notification_deliveries')
        .values({
          workspace_id: params.workspaceId,
          user_id: params.userId,
          event_type: params.eventType,
          channel: params.channel,
          severity,
          title: params.title,
          body: params.body,
          resource_type: params.resourceType ?? null,
          resource_id: params.resourceId ?? null,
          delivery_key: deliveryKey,
          status: 'pending',
          attempts: 0,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      deliveryId = row.id;
    } catch (err) {
      // Unique race — treat as skip if already delivered
      const again = await db
        .selectFrom('notification_deliveries')
        .select(['id', 'status'])
        .where('workspace_id', '=', params.workspaceId)
        .where('delivery_key', '=', deliveryKey)
        .executeTakeFirst();
      if (again && (again.status === 'delivered' || again.status === 'skipped')) {
        return { status: again.status, deliveryId: again.id };
      }
      logger.error({ err, deliveryKey }, '[notification-bus] insert failed');
      return { status: 'failed', deliveryId: again?.id ?? null };
    }
  }

  await db
    .updateTable('notification_deliveries')
    .set((eb) => ({
      attempts: eb('attempts', '+', 1),
      updated_at: new Date(),
    }))
    .where('id', '=', deliveryId)
    .execute();

  try {
    let notificationId: string | null = null;

    if (params.channel === 'in_app') {
      await notify(db, {
        workspaceId: params.workspaceId,
        userId: params.userId,
        type: params.eventType,
        title: params.title,
        body: params.body,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        severity,
        deliveryKey,
      });

      const n = await db
        .selectFrom('notifications')
        .select(['id'])
        .where('workspace_id', '=', params.workspaceId)
        .where('delivery_key', '=', deliveryKey)
        .executeTakeFirst();
      notificationId = n?.id ?? null;
    } else if (params.channel === 'email') {
      const user = await db
        .selectFrom('users')
        .select(['email', 'name', 'is_active'])
        .where('id', '=', params.userId)
        .where('workspace_id', '=', params.workspaceId)
        .executeTakeFirst();

      if (!user?.is_active || !user.email) {
        await db
          .updateTable('notification_deliveries')
          .set({
            status: 'skipped',
            error_message: 'user inactive or missing email',
            updated_at: new Date(),
          })
          .where('id', '=', deliveryId)
          .execute();
        return { status: 'skipped', deliveryId };
      }

      const { smtp } = await resolveSmtp(db, params.workspaceId, params.smtp);
      if (!smtp) {
        await db
          .updateTable('notification_deliveries')
          .set({
            status: 'failed',
            error_message: 'SMTP not configured',
            updated_at: new Date(),
          })
          .where('id', '=', deliveryId)
          .execute();
        return { status: 'failed', deliveryId };
      }

      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.default.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
      });

      await transporter.sendMail({
        from: smtp.from,
        to: user.email,
        subject: params.title,
        text: params.body,
      });
    }

    await db
      .updateTable('notification_deliveries')
      .set({
        status: 'delivered',
        notification_id: notificationId,
        delivered_at: new Date(),
        error_message: null,
        updated_at: new Date(),
      })
      .where('id', '=', deliveryId)
      .execute();

    return { status: 'delivered', deliveryId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, deliveryKey }, '[notification-bus] deliver failed');
    await db
      .updateTable('notification_deliveries')
      .set({
        status: 'failed',
        error_message: msg.slice(0, 2000),
        updated_at: new Date(),
      })
      .where('id', '=', deliveryId)
      .execute();
    return { status: 'failed', deliveryId };
  }
}
