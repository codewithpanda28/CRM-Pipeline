import { z } from 'zod';
import { sql, type Kysely } from 'kysely';
import type { Database, LeadStatus } from '@vencore/db';
import { randomUUID } from 'crypto';
import { assertLeadOwner } from './integrity';
import { displayLeadName, normalizeEmail } from './normalize';
import { findLeadDuplicates } from './duplicates';
import { onLeadCreated } from './events';

export const LEAD_IMPORT_MAX_ROWS = 1000;
export const LEAD_IMPORT_CHUNK = 100;
export const LEAD_EXPORT_MAX_ROWS = 5000;
export const LEAD_BULK_MAX_IDS = 100;

export const LEAD_CSV_HEADERS = [
  'name',
  'first_name',
  'last_name',
  'email',
  'phone',
  'alternate_phone',
  'company_name',
  'website',
  'source',
  'status',
  'rating',
  'owner_id',
  'notes',
] as const;

const importStatuses = ['new', 'contacted', 'qualified', 'unqualified', 'lost', 'abandoned'] as const;
const ratings = ['hot', 'warm', 'cold'] as const;

const importRowSchema = z.object({
  name: z.string().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal('')).transform((v) => (v === '' ? null : v)),
  phone: z.string().nullable().optional(),
  alternate_phone: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  status: z.enum(importStatuses).optional(),
  rating: z.enum(ratings).nullable().optional().or(z.literal('')).transform((v) => (v === '' ? null : v)),
  owner_id: z.string().uuid().optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v)),
  notes: z.string().nullable().optional(),
});

export type LeadImportNormalized = {
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  alternate_phone: string | null;
  company_name: string | null;
  website: string | null;
  source: string | null;
  status: LeadStatus;
  rating: 'hot' | 'warm' | 'cold' | null;
  owner_id: string;
  notes: string | null;
};

export type LeadImportPreviewRow = {
  index: number;
  status: 'ok' | 'error' | 'duplicate_warn';
  errors?: string[];
  duplicate_refs?: Array<{ kind: string; id: string; label?: string }>;
  /** True when an open lead email match exists — commit skips by default */
  email_open_lead_duplicate?: boolean;
  normalized?: LeadImportNormalized;
};

function emptyToNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

export function coerceImportRow(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of LEAD_CSV_HEADERS) {
    if (key in raw) out[key] = emptyToNull(raw[key]);
  }
  return out;
}

export async function previewLeadImport(
  db: Kysely<Database>,
  opts: {
    workspaceId: string;
    actorUserId: string;
    rows: Record<string, unknown>[];
  },
): Promise<{
  total: number;
  valid: number;
  invalid: number;
  duplicate_warnings: number;
  rows: LeadImportPreviewRow[];
}> {
  const previewRows: LeadImportPreviewRow[] = [];
  let valid = 0;
  let invalid = 0;
  let duplicate_warnings = 0;

  for (let index = 0; index < opts.rows.length; index++) {
    const coerced = coerceImportRow(opts.rows[index] ?? {});
    const parsed = importRowSchema.safeParse(coerced);
    if (!parsed.success) {
      invalid += 1;
      previewRows.push({
        index,
        status: 'error',
        errors: parsed.error.issues.map((i) => i.message),
      });
      continue;
    }

    const body = parsed.data;
    const name = displayLeadName(body);
    if (!name || name === 'Untitled lead') {
      // allow Untitled only if first/last/name all empty — treat as error
      if (!body.name?.trim() && !body.first_name?.trim() && !body.last_name?.trim()) {
        invalid += 1;
        previewRows.push({
          index,
          status: 'error',
          errors: ['name or first_name/last_name is required'],
        });
        continue;
      }
    }

    const ownerId = body.owner_id ?? opts.actorUserId;
    const ownerOk = await assertLeadOwner(db, opts.workspaceId, ownerId);
    if (ownerOk !== 'ok') {
      invalid += 1;
      previewRows.push({
        index,
        status: 'error',
        errors: ['owner_id not found in tenant'],
      });
      continue;
    }

    const email = normalizeEmail(body.email ?? null);
    const status = (body.status ?? 'new') as LeadStatus;
    const normalized: LeadImportNormalized = {
      name: displayLeadName({ ...body, name }),
      first_name: body.first_name ?? null,
      last_name: body.last_name ?? null,
      email,
      phone: body.phone ?? null,
      alternate_phone: body.alternate_phone ?? null,
      company_name: body.company_name ?? null,
      website: body.website ?? null,
      source: body.source ?? null,
      status,
      rating: body.rating ?? null,
      owner_id: ownerId,
      notes: body.notes ?? null,
    };

    const duplicates = await findLeadDuplicates(db, {
      workspaceId: opts.workspaceId,
      email: normalized.email,
      phone: normalized.phone,
      alternatePhone: normalized.alternate_phone,
      companyName: normalized.company_name,
      website: normalized.website,
    });

    const emailOpenLead = duplicates.some((d) => d.entity === 'lead' && d.reason === 'email');
    const duplicate_refs = duplicates.map((d) => ({
      kind: d.entity,
      id: d.id,
      label: d.label,
    }));

    if (duplicates.length > 0) {
      duplicate_warnings += 1;
      valid += 1;
      previewRows.push({
        index,
        status: 'duplicate_warn',
        duplicate_refs,
        email_open_lead_duplicate: emailOpenLead,
        normalized,
      });
    } else {
      valid += 1;
      previewRows.push({
        index,
        status: 'ok',
        email_open_lead_duplicate: false,
        normalized,
      });
    }
  }

  return {
    total: opts.rows.length,
    valid,
    invalid,
    duplicate_warnings,
    rows: previewRows,
  };
}

export async function commitLeadImport(
  db: Kysely<Database>,
  opts: {
    workspaceId: string;
    actorUserId: string;
    rows: Record<string, unknown>[];
    skipEmailDuplicates?: boolean;
  },
): Promise<{
  created: number;
  skipped: number;
  duplicate: number;
  failed: number;
  errors: string[];
}> {
  const skipEmailDuplicates = opts.skipEmailDuplicates !== false;
  const preview = await previewLeadImport(db, opts);

  let created = 0;
  let skipped = 0;
  let duplicate = 0;
  let failed = 0;
  const errors: string[] = [];

  const toInsert: LeadImportNormalized[] = [];

  for (const row of preview.rows) {
    if (row.status === 'error' || !row.normalized) {
      failed += 1;
      errors.push(`row ${row.index}: ${(row.errors ?? ['invalid']).join('; ')}`);
      continue;
    }

    if (row.email_open_lead_duplicate && skipEmailDuplicates) {
      duplicate += 1;
      skipped += 1;
      errors.push(`row ${row.index}: skipped open-lead email duplicate`);
      continue;
    }

    // Contact-only or soft matches: allow create (warn already in preview)
    toInsert.push(row.normalized);
  }

  for (let i = 0; i < toInsert.length; i += LEAD_IMPORT_CHUNK) {
    const chunk = toInsert.slice(i, i + LEAD_IMPORT_CHUNK);
    await db.transaction().execute(async (trx) => {
      for (const row of chunk) {
        // Re-check open-lead email dupe inside TX for race safety
        if (row.email && skipEmailDuplicates) {
          const existing = await trx
            .selectFrom('leads')
            .select('id')
            .where('workspace_id', '=', opts.workspaceId)
            .where('deleted_at', 'is', null)
            .where('status', '!=', 'converted')
            .where(sql`lower(email)`, '=', row.email)
            .executeTakeFirst();
          if (existing) {
            duplicate += 1;
            skipped += 1;
            errors.push(`skipped open-lead email duplicate: ${row.email}`);
            continue;
          }
        }

        const id = randomUUID();
        await trx
          .insertInto('leads')
          .values({
            id,
            workspace_id: opts.workspaceId,
            name: row.name,
            first_name: row.first_name,
            last_name: row.last_name,
            email: row.email,
            phone: row.phone,
            alternate_phone: row.alternate_phone,
            company_name: row.company_name,
            website: row.website,
            source: row.source,
            status: row.status,
            rating: row.rating,
            owner_id: row.owner_id,
            notes: row.notes,
            custom_fields: {} as never,
          })
          .execute();
        await onLeadCreated(trx, {
          workspaceId: opts.workspaceId,
          leadId: id,
          status: row.status,
        });
        created += 1;
      }
    });
  }

  return { created, skipped, duplicate, failed, errors };
}
