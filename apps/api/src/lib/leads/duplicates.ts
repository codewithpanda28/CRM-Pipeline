import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { sql } from 'kysely';
import { normalizeEmail, normalizePhoneDigits, normalizeWebsiteHost } from './normalize';

export type DuplicateEntity = 'contact' | 'company' | 'lead';

export interface DuplicateCandidate {
  entity: DuplicateEntity;
  id: string;
  reason: string;
  label?: string;
}

export async function findLeadDuplicates(
  db: Kysely<Database>,
  opts: {
    workspaceId: string;
    email?: string | null;
    phone?: string | null;
    alternatePhone?: string | null;
    companyName?: string | null;
    website?: string | null;
    /** Exclude this lead id when editing */
    excludeLeadId?: string;
  },
): Promise<DuplicateCandidate[]> {
  const out: DuplicateCandidate[] = [];
  const email = normalizeEmail(opts.email);
  const phones = [
    normalizePhoneDigits(opts.phone),
    normalizePhoneDigits(opts.alternatePhone),
  ].filter((p): p is string => Boolean(p));
  const host = normalizeWebsiteHost(opts.website);
  const companyName = opts.companyName?.trim().toLowerCase() || null;

  if (email) {
    const contact = await db
      .selectFrom('contacts')
      .select(['id', 'name', 'email'])
      .where('workspace_id', '=', opts.workspaceId)
      .where('deleted_at', 'is', null)
      .where(sql`lower(email)`, '=', email)
      .executeTakeFirst();
    if (contact) {
      out.push({
        entity: 'contact',
        id: contact.id,
        reason: 'email',
        label: contact.name,
      });
    }

    let leadQ = db
      .selectFrom('leads')
      .select(['id', 'name', 'email'])
      .where('workspace_id', '=', opts.workspaceId)
      .where('deleted_at', 'is', null)
      .where('status', '!=', 'converted')
      .where(sql`lower(email)`, '=', email);
    if (opts.excludeLeadId) leadQ = leadQ.where('id', '!=', opts.excludeLeadId);
    const lead = await leadQ.executeTakeFirst();
    if (lead) {
      out.push({ entity: 'lead', id: lead.id, reason: 'email', label: lead.name });
    }
  }

  for (const digits of phones) {
    const contactPhone = await db
      .selectFrom('contacts')
      .select(['id', 'name', 'phone'])
      .where('workspace_id', '=', opts.workspaceId)
      .where('deleted_at', 'is', null)
      .where(sql`regexp_replace(coalesce(phone, ''), '\\D', '', 'g')`, '=', digits)
      .executeTakeFirst();
    if (contactPhone && !out.some((d) => d.entity === 'contact' && d.id === contactPhone.id)) {
      out.push({
        entity: 'contact',
        id: contactPhone.id,
        reason: 'phone',
        label: contactPhone.name,
      });
    }

    let leadPhoneQ = db
      .selectFrom('leads')
      .select(['id', 'name'])
      .where('workspace_id', '=', opts.workspaceId)
      .where('deleted_at', 'is', null)
      .where('status', '!=', 'converted')
      .where(({ eb, or }) =>
        or([
          eb(sql`regexp_replace(coalesce(phone, ''), '\\D', '', 'g')`, '=', digits),
          eb(sql`regexp_replace(coalesce(alternate_phone, ''), '\\D', '', 'g')`, '=', digits),
        ]),
      );
    if (opts.excludeLeadId) leadPhoneQ = leadPhoneQ.where('id', '!=', opts.excludeLeadId);
    const leadPhone = await leadPhoneQ.executeTakeFirst();
    if (leadPhone && !out.some((d) => d.entity === 'lead' && d.id === leadPhone.id)) {
      out.push({ entity: 'lead', id: leadPhone.id, reason: 'phone', label: leadPhone.name });
    }
  }

  if (host || companyName) {
    // Targeted lookup — never load the whole companies table (Railway RTT × N).
    let companyQ = db
      .selectFrom('companies')
      .select(['id', 'name', 'website'])
      .where('workspace_id', '=', opts.workspaceId)
      .where('deleted_at', 'is', null);

    if (companyName && host) {
      companyQ = companyQ.where(({ eb, or }) =>
        or([
          eb(sql`lower(trim(name))`, '=', companyName),
          eb(sql`lower(coalesce(website, ''))`, 'like', `%${host}%`),
        ]),
      );
    } else if (companyName) {
      companyQ = companyQ.where(sql`lower(trim(name))`, '=', companyName);
    } else if (host) {
      companyQ = companyQ.where(sql`lower(coalesce(website, ''))`, 'like', `%${host}%`);
    }

    const companies = await companyQ.limit(25).execute();
    for (const c of companies) {
      const cHost = normalizeWebsiteHost(c.website);
      const nameMatch = Boolean(companyName && c.name.trim().toLowerCase() === companyName);
      const hostMatch = Boolean(host && cHost && cHost === host);
      if (nameMatch || hostMatch) {
        out.push({
          entity: 'company',
          id: c.id,
          reason: hostMatch ? 'website' : 'company_name',
          label: c.name,
        });
        break;
      }
    }
  }

  return out;
}
