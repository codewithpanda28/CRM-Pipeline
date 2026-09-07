import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const brandingPatchSchema = z.object({
  brand_name: z.string().min(1).max(255).optional(),
  legal_name: z.string().max(255).nullable().optional(),
  primary_color: z.string().max(32).nullable().optional(),
  secondary_color: z.string().max(32).nullable().optional(),
  theme: z.record(z.unknown()).optional(),
  support: z.record(z.unknown()).optional(),
  logo_file_id: z.string().uuid().nullable().optional(),
});

const settingsPatchSchema = z.object({
  locale: z.string().min(2).max(32).optional(),
  timezone: z.string().min(2).max(64).optional(),
  settings: z.record(z.unknown()).optional(),
});

/** Tenant-scoped branding + settings (ADR-018). Never reads another tenant. */
export function createTenantBrandingRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/branding', async (req, res, next) => {
    try {
      const { tenantContext, workspace } = req as AuthenticatedRequest;
      const tenantId = tenantContext?.tenantId ?? workspace.id;
      const row = await db
        .selectFrom('tenant_branding')
        .where('tenant_id', '=', tenantId)
        .selectAll()
        .executeTakeFirst();
      if (!row) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Branding not found' } });
        return;
      }
      res.json({ data: row, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/branding', async (req, res, next) => {
    try {
      const { tenantContext, workspace } = req as AuthenticatedRequest;
      const tenantId = tenantContext?.tenantId ?? workspace.id;
      const parsed = brandingPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const current = await db
        .selectFrom('tenant_branding')
        .where('tenant_id', '=', tenantId)
        .select('version')
        .executeTakeFirst();
      if (!current) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Branding not found' } });
        return;
      }
      const row = await db
        .updateTable('tenant_branding')
        .set({
          ...parsed.data,
          version: (current.version ?? 1) + 1,
          updated_at: new Date(),
        })
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirstOrThrow();
      res.json({ data: row, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/settings', async (req, res, next) => {
    try {
      const { tenantContext, workspace } = req as AuthenticatedRequest;
      const tenantId = tenantContext?.tenantId ?? workspace.id;
      const row = await db
        .selectFrom('tenant_settings')
        .where('tenant_id', '=', tenantId)
        .selectAll()
        .executeTakeFirst();
      if (!row) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Settings not found' } });
        return;
      }
      res.json({ data: row, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/settings', async (req, res, next) => {
    try {
      const { tenantContext, workspace } = req as AuthenticatedRequest;
      const tenantId = tenantContext?.tenantId ?? workspace.id;
      const parsed = settingsPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const row = await db
        .updateTable('tenant_settings')
        .set({ ...parsed.data, updated_at: new Date() })
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .executeTakeFirst();
      if (!row) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Settings not found' } });
        return;
      }
      res.json({ data: row, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
