import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

export async function recordSecurityAudit(
  db: Kysely<Database>,
  event: {
    tenant_id?: string | null;
    actor_type: string;
    actor_id?: string | null;
    action: string;
    entity_type?: string | null;
    entity_id?: string | null;
    ip?: string | null;
    user_agent?: string | null;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await db
      .insertInto('security_audit_events')
      .values({
        tenant_id: event.tenant_id ?? null,
        actor_type: event.actor_type,
        actor_id: event.actor_id ?? null,
        action: event.action,
        entity_type: event.entity_type ?? null,
        entity_id: event.entity_id ?? null,
        ip: event.ip ?? null,
        user_agent: event.user_agent ?? null,
        meta: event.meta ?? {},
      })
      .execute();
  } catch {
    // Table may not exist pre-migration — never break request path
  }
}
