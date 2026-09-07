import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { userHasPermission } from '../middleware/permission';
import {
  CRM_SEARCH_PERMISSION,
  CRM_SEARCH_TYPE_ORDER,
  CLIENT_SEARCH_TYPES,
  parseCrmSearchTypes,
  runCrmSearch,
  type CrmSearchEntityType,
} from '../lib/crm/search';

const querySchema = z.object({
  q: z.string().trim().min(2).max(200),
  types: z.string().optional(),
  /** clients = Lead/Contact/Company/CustomerParty/Deal; all = Block 1 full set (default). */
  scope: z.enum(['clients', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(15).default(8),
});

export function createCrmSearchRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          data: null,
          error: {
            code: 'INVALID_INPUT',
            message: parsed.error.issues[0]?.message ?? 'Invalid search query',
          },
        });
        return;
      }

      const { q, limit, scope } = parsed.data;
      const types =
        parsed.data.types != null
          ? parseCrmSearchTypes(parsed.data.types)
          : scope === 'clients'
            ? [...CLIENT_SEARCH_TYPES]
            : [...CRM_SEARCH_TYPE_ORDER];

      const permitted = new Set<CrmSearchEntityType>();
      await Promise.all(
        CRM_SEARCH_TYPE_ORDER.map(async (type) => {
          const ok = await userHasPermission(
            db,
            auth.user,
            auth.workspace.id,
            CRM_SEARCH_PERMISSION[type],
          );
          if (ok) permitted.add(type);
        }),
      );

      const { results, counts } = await runCrmSearch(db, {
        workspaceId: auth.workspace.id,
        q,
        types,
        limit,
        permitted,
        recordHrefMode: scope === 'clients' ? 'unified' : 'legacy',
      });

      res.json({
        data: {
          query: q,
          scope,
          results,
          counts,
        },
        error: null,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
