/**
 * CRM record customization (ADR-013 hybrid) — Round A.
 * Canonical custom values live in crm_field_values (not dual-written into JSONB).
 * Parent JSONB custom_fields remain for legacy/ad-hoc keys only.
 */
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database, CrmFieldType, CrmRecordEntityType } from '@vencore/db';
import { recordSecurityAudit } from '../security-audit';

export const CRM_ENTITY_TYPES = ['lead', 'customer_party', 'deal'] as const;
export const CRM_FIELD_TYPES = [
  'text',
  'long_text',
  'number',
  'currency',
  'date',
  'datetime',
  'phone',
  'email',
  'url',
  'single_select',
  'multi_select',
  'checkbox',
  'user_ref',
] as const;

export const fieldKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, 'field_key must be snake_case starting with a letter');

export const sectionKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, 'section_key must be snake_case starting with a letter');

export async function listCrmSections(
  db: Kysely<Database>,
  workspaceId: string,
  entityType: CrmRecordEntityType,
  includeArchived = false,
) {
  let q = db
    .selectFrom('crm_record_sections')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('entity_type', '=', entityType)
    .orderBy('position', 'asc');
  if (!includeArchived) q = q.where('archived_at', 'is', null);
  return q.execute();
}

export async function createCrmSection(
  db: Kysely<Database>,
  input: {
    workspaceId: string;
    entityType: CrmRecordEntityType;
    sectionKey: string;
    label: string;
    position?: number;
    actorUserId: string;
  },
) {
  const row = await db
    .insertInto('crm_record_sections')
    .values({
      workspace_id: input.workspaceId,
      entity_type: input.entityType,
      section_key: input.sectionKey,
      label: input.label,
      position: input.position ?? 0,
    })
    .onConflict((oc) => oc.columns(['workspace_id', 'entity_type', 'section_key']).doNothing())
    .returningAll()
    .executeTakeFirst();

  const created =
    row ??
    (await db
      .selectFrom('crm_record_sections')
      .selectAll()
      .where('workspace_id', '=', input.workspaceId)
      .where('entity_type', '=', input.entityType)
      .where('section_key', '=', input.sectionKey)
      .executeTakeFirstOrThrow());

  await recordSecurityAudit(db, {
    tenant_id: input.workspaceId,
    actor_type: 'user',
    actor_id: input.actorUserId,
    action: 'crm.customization.section.create',
    entity_type: 'crm_record_section',
    entity_id: created.id,
    meta: { entity_type: input.entityType, section_key: input.sectionKey },
  });

  return created;
}

export async function updateCrmSection(
  db: Kysely<Database>,
  input: {
    workspaceId: string;
    sectionId: string;
    label?: string;
    position?: number;
    archive?: boolean;
    actorUserId: string;
  },
) {
  const patch: Record<string, unknown> = { updated_at: new Date() };
  if (input.label !== undefined) patch['label'] = input.label;
  if (input.position !== undefined) patch['position'] = input.position;
  if (input.archive === true) patch['archived_at'] = new Date();
  if (input.archive === false) patch['archived_at'] = null;

  const row = await db
    .updateTable('crm_record_sections')
    .set(patch)
    .where('id', '=', input.sectionId)
    .where('workspace_id', '=', input.workspaceId)
    .returningAll()
    .executeTakeFirst();
  if (!row) return null;

  await recordSecurityAudit(db, {
    tenant_id: input.workspaceId,
    actor_type: 'user',
    actor_id: input.actorUserId,
    action: 'crm.customization.section.update',
    entity_type: 'crm_record_section',
    entity_id: row.id,
    meta: { archive: input.archive ?? null },
  });
  return row;
}

export async function reorderCrmSections(
  db: Kysely<Database>,
  workspaceId: string,
  entityType: CrmRecordEntityType,
  ids: string[],
  actorUserId: string,
) {
  await Promise.all(
    ids.map((id, i) =>
      db
        .updateTable('crm_record_sections')
        .set({ position: i, updated_at: new Date() })
        .where('id', '=', id)
        .where('workspace_id', '=', workspaceId)
        .where('entity_type', '=', entityType)
        .execute(),
    ),
  );
  await recordSecurityAudit(db, {
    tenant_id: workspaceId,
    actor_type: 'user',
    actor_id: actorUserId,
    action: 'crm.customization.section.reorder',
    entity_type: 'crm_record_section',
    meta: { entity_type: entityType, count: ids.length },
  });
}

export async function listCrmFields(
  db: Kysely<Database>,
  workspaceId: string,
  entityType: CrmRecordEntityType,
  includeArchived = false,
) {
  let q = db
    .selectFrom('crm_field_definitions')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('entity_type', '=', entityType)
    .orderBy('position', 'asc');
  if (!includeArchived) q = q.where('archived_at', 'is', null);
  return q.execute();
}

export async function createCrmField(
  db: Kysely<Database>,
  input: {
    workspaceId: string;
    entityType: CrmRecordEntityType;
    sectionId?: string | null;
    fieldKey: string;
    label: string;
    fieldType: CrmFieldType;
    required?: boolean;
    defaultJson?: Record<string, unknown> | null;
    validationJson?: Record<string, unknown> | null;
    position?: number;
    searchable?: boolean;
    actorUserId: string;
  },
) {
  if (input.sectionId) {
    const section = await db
      .selectFrom('crm_record_sections')
      .select('id')
      .where('id', '=', input.sectionId)
      .where('workspace_id', '=', input.workspaceId)
      .where('entity_type', '=', input.entityType)
      .executeTakeFirst();
    if (!section) throw Object.assign(new Error('SECTION_NOT_FOUND'), { code: 'SECTION_NOT_FOUND' });
  }

  const existing = await db
    .selectFrom('crm_field_definitions')
    .select('id')
    .where('workspace_id', '=', input.workspaceId)
    .where('entity_type', '=', input.entityType)
    .where('field_key', '=', input.fieldKey)
    .executeTakeFirst();
  if (existing) throw Object.assign(new Error('FIELD_KEY_EXISTS'), { code: 'FIELD_KEY_EXISTS' });

  const row = await db
    .insertInto('crm_field_definitions')
    .values({
      workspace_id: input.workspaceId,
      entity_type: input.entityType,
      section_id: input.sectionId ?? null,
      field_key: input.fieldKey,
      label: input.label,
      field_type: input.fieldType,
      required: input.required ?? false,
      default_json: input.defaultJson ?? null,
      validation_json: input.validationJson ?? null,
      position: input.position ?? 0,
      searchable: input.searchable ?? false,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  await recordSecurityAudit(db, {
    tenant_id: input.workspaceId,
    actor_type: 'user',
    actor_id: input.actorUserId,
    action: 'crm.customization.field.create',
    entity_type: 'crm_field_definition',
    entity_id: row.id,
    meta: { entity_type: input.entityType, field_key: input.fieldKey, field_type: input.fieldType },
  });
  return row;
}

export async function updateCrmField(
  db: Kysely<Database>,
  input: {
    workspaceId: string;
    fieldId: string;
    label?: string;
    required?: boolean;
    defaultJson?: Record<string, unknown> | null;
    validationJson?: Record<string, unknown> | null;
    position?: number;
    searchable?: boolean;
    sectionId?: string | null;
    archive?: boolean;
    fieldType?: CrmFieldType;
    actorUserId: string;
  },
) {
  const current = await db
    .selectFrom('crm_field_definitions')
    .selectAll()
    .where('id', '=', input.fieldId)
    .where('workspace_id', '=', input.workspaceId)
    .executeTakeFirst();
  if (!current) return { ok: false as const, fail: 'not_found' as const };

  if (input.fieldType && input.fieldType !== current.field_type) {
    const hasValues = await db
      .selectFrom('crm_field_values')
      .select('id')
      .where('workspace_id', '=', input.workspaceId)
      .where('entity_type', '=', current.entity_type)
      .where('field_key', '=', current.field_key)
      .where('value_json', 'is not', null)
      .limit(1)
      .executeTakeFirst();
    if (hasValues) return { ok: false as const, fail: 'type_change_blocked' as const };
  }

  const patch: Record<string, unknown> = { updated_at: new Date() };
  if (input.label !== undefined) patch['label'] = input.label;
  if (input.required !== undefined) patch['required'] = input.required;
  if (input.defaultJson !== undefined) patch['default_json'] = input.defaultJson;
  if (input.validationJson !== undefined) patch['validation_json'] = input.validationJson;
  if (input.position !== undefined) patch['position'] = input.position;
  if (input.searchable !== undefined) patch['searchable'] = input.searchable;
  if (input.sectionId !== undefined) patch['section_id'] = input.sectionId;
  if (input.fieldType !== undefined) patch['field_type'] = input.fieldType;
  if (input.archive === true) patch['archived_at'] = new Date();
  if (input.archive === false) patch['archived_at'] = null;

  const row = await db
    .updateTable('crm_field_definitions')
    .set(patch)
    .where('id', '=', input.fieldId)
    .where('workspace_id', '=', input.workspaceId)
    .returningAll()
    .executeTakeFirstOrThrow();

  await recordSecurityAudit(db, {
    tenant_id: input.workspaceId,
    actor_type: 'user',
    actor_id: input.actorUserId,
    action: 'crm.customization.field.update',
    entity_type: 'crm_field_definition',
    entity_id: row.id,
    meta: { archive: input.archive ?? null },
  });
  return { ok: true as const, field: row };
}

export async function listCrmOptions(db: Kysely<Database>, workspaceId: string, fieldId: string, includeArchived = false) {
  let q = db
    .selectFrom('crm_field_options')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('field_id', '=', fieldId)
    .orderBy('position', 'asc');
  if (!includeArchived) q = q.where('archived_at', 'is', null);
  return q.execute();
}

export async function createCrmOption(
  db: Kysely<Database>,
  input: {
    workspaceId: string;
    fieldId: string;
    optionValue: string;
    label: string;
    position?: number;
    actorUserId: string;
  },
) {
  const field = await db
    .selectFrom('crm_field_definitions')
    .select(['id', 'field_type'])
    .where('id', '=', input.fieldId)
    .where('workspace_id', '=', input.workspaceId)
    .executeTakeFirst();
  if (!field) throw Object.assign(new Error('FIELD_NOT_FOUND'), { code: 'FIELD_NOT_FOUND' });
  if (field.field_type !== 'single_select' && field.field_type !== 'multi_select') {
    throw Object.assign(new Error('OPTIONS_NOT_ALLOWED'), { code: 'OPTIONS_NOT_ALLOWED' });
  }

  const row = await db
    .insertInto('crm_field_options')
    .values({
      workspace_id: input.workspaceId,
      field_id: input.fieldId,
      option_value: input.optionValue,
      label: input.label,
      position: input.position ?? 0,
    })
    .onConflict((oc) => oc.columns(['field_id', 'option_value']).doNothing())
    .returningAll()
    .executeTakeFirst();

  const created =
    row ??
    (await db
      .selectFrom('crm_field_options')
      .selectAll()
      .where('field_id', '=', input.fieldId)
      .where('option_value', '=', input.optionValue)
      .executeTakeFirstOrThrow());

  await recordSecurityAudit(db, {
    tenant_id: input.workspaceId,
    actor_type: 'user',
    actor_id: input.actorUserId,
    action: 'crm.customization.option.create',
    entity_type: 'crm_field_option',
    entity_id: created.id,
    meta: { field_id: input.fieldId, option_value: input.optionValue },
  });
  return created;
}

export async function updateCrmOption(
  db: Kysely<Database>,
  input: {
    workspaceId: string;
    optionId: string;
    label?: string;
    position?: number;
    archive?: boolean;
    actorUserId: string;
  },
) {
  const patch: Record<string, unknown> = { updated_at: new Date() };
  if (input.label !== undefined) patch['label'] = input.label;
  if (input.position !== undefined) patch['position'] = input.position;
  if (input.archive === true) patch['archived_at'] = new Date();
  if (input.archive === false) patch['archived_at'] = null;

  const row = await db
    .updateTable('crm_field_options')
    .set(patch)
    .where('id', '=', input.optionId)
    .where('workspace_id', '=', input.workspaceId)
    .returningAll()
    .executeTakeFirst();
  if (!row) return null;

  await recordSecurityAudit(db, {
    tenant_id: input.workspaceId,
    actor_type: 'user',
    actor_id: input.actorUserId,
    action: 'crm.customization.option.update',
    entity_type: 'crm_field_option',
    entity_id: row.id,
    meta: {},
  });
  return row;
}

export async function reorderCrmOptions(
  db: Kysely<Database>,
  workspaceId: string,
  fieldId: string,
  ids: string[],
  actorUserId: string,
) {
  await Promise.all(
    ids.map((id, i) =>
      db
        .updateTable('crm_field_options')
        .set({ position: i, updated_at: new Date() })
        .where('id', '=', id)
        .where('workspace_id', '=', workspaceId)
        .where('field_id', '=', fieldId)
        .execute(),
    ),
  );
  await recordSecurityAudit(db, {
    tenant_id: workspaceId,
    actor_type: 'user',
    actor_id: actorUserId,
    action: 'crm.customization.option.reorder',
    entity_type: 'crm_field_option',
    meta: { field_id: fieldId, count: ids.length },
  });
}
