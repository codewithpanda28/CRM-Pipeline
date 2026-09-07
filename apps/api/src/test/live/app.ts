import express, { type Express, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { assertObjectKeyBelongsToTenant } from '@vencore/tenancy';
import { createRequireAuth, createRequirePlatformAdmin } from '../../middleware/auth';
import { createRequirePermission, __clearPermCacheForTesting } from '../../middleware/permission';
import {
  createRequireModule,
  createRequireModuleFeature,
  __clearModuleCacheForTesting,
} from '../../middleware/module';
import { createContactsRouter } from '../../routes/contacts';
import { createCompaniesRouter } from '../../routes/companies';
import { createPipelinesRouter } from '../../routes/pipelines';
import { createPipelineItemsRouter, createItemRouter } from '../../routes/pipeline-items';
import { createDealsRouter } from '../../routes/deals';
import { createLeadsRouter } from '../../routes/leads';
import { createCrmSearchRouter } from '../../routes/crm-search';
import { createCrmCustomizationRouter } from '../../routes/crm-customization';
import { createCrmRecordsRouter } from '../../routes/crm-records';
import { createCustomerPartiesRouter } from '../../routes/customer-parties';
import { createProductsRouter } from '../../routes/products';
import { createQuotesRouter } from '../../routes/quotes';
import { createInvoicesRouter } from '../../routes/invoices';
import { createPaymentsRouter } from '../../routes/payments';
import { createExpensesRouter } from '../../routes/expenses';
import { createVendorsRouter } from '../../routes/vendors';
import { createCreditNotesRouter } from '../../routes/credit-notes';
import { createDebitNotesRouter } from '../../routes/debit-notes';
import { createFinanceRouter } from '../../routes/finance';
import { createAccountingRouter } from '../../routes/accounting';
import { createDocumentsRouter } from '../../routes/documents';
import { createOpsRouter, createHealthRouter } from '../../routes/ops';
import { createBusinessOpsRouter } from '../../routes/business-ops';
import { createMfaRouter } from '../../routes/mfa';
import { createTasksRouter } from '../../routes/tasks';
import { createActivityRouter } from '../../routes/activity';
import { createProjectsRouter } from '../../routes/projects';
import { createMessagingRouter } from '../../routes/messaging';
import { createApiKeysRouter } from '../../routes/api-keys';
import { createWebhooksRouter } from '../../routes/webhooks';
import { createNotificationsRouter } from '../../routes/notifications';
import { createTenantBrandingRouter } from '../../routes/tenant-branding';
import { mountPlatformRouter } from '../../routes/platform';
import { createAuthRouter } from '../../routes/auth';
import { createV1Router } from '../../routes/v1';
import { createServersRouter } from '../../routes/servers';
import { errorHandler } from '../../middleware/errors';
import type { AuthenticatedRequest } from '../../middleware/auth';

export const LIVE_JWT_SECRET = 'live-isolation-test-secret-do-not-use-elsewhere';

/** Minimal Express app with real auth + tenant-sensitive routers (no full index side effects). */
export function createLiveIsolationApp(db: Kysely<Database>): Express {
  process.env['PLATFORM_BASE_DOMAIN'] = 'thinkaiq.com';
  process.env['PLATFORM_HOSTS'] = 'localhost,127.0.0.1,app.thinkaiq.com,admin.thinkaiq.com';
  process.env['TRUST_PROXY'] = 'true';
  process.env['CSRF_ENFORCE'] = 'false';
  process.env['JWT_SECRET'] = LIVE_JWT_SECRET;
  process.env['MFA_SECRET'] = LIVE_JWT_SECRET;
  __clearPermCacheForTesting();
  __clearModuleCacheForTesting();

  const requireAuth = createRequireAuth(db, LIVE_JWT_SECRET);
  const requirePermission = createRequirePermission(db);
  const requireCrmFeature = createRequireModuleFeature(db)('crm');
  const requireInfraFeature = createRequireModuleFeature(db)('infra');
  const requireFinanceFeature = createRequireModuleFeature(db)('finance');
  const requireModule = createRequireModule(db);

  const app = express();
  app.set('trust proxy', true);
  app.use(cookieParser());
  app.use(express.json());

  app.use('/api/auth', createAuthRouter(db, LIVE_JWT_SECRET, null, 'http://localhost:3000'));

  app.use('/api/contacts', requireAuth, requireCrmFeature('crm:contacts'), createContactsRouter(db, requirePermission));
  app.use('/api/companies', requireAuth, requireCrmFeature('crm:companies'), createCompaniesRouter(db, requirePermission));
  app.use('/api/pipelines', requireAuth, requireCrmFeature('crm:pipeline'), createPipelinesRouter(db, requirePermission));
  app.use(
    '/api/pipelines/:pipelineId/items',
    requireAuth,
    requireCrmFeature('crm:pipeline'),
    createPipelineItemsRouter(db, requirePermission),
  );
  app.use('/api/items', requireAuth, requireCrmFeature('crm:pipeline'), createItemRouter(db, requirePermission));
  app.use('/api/deals', requireAuth, requireCrmFeature('crm:pipeline'), createDealsRouter(db, requirePermission));
  app.use('/api/leads', requireAuth, requireCrmFeature('crm:leads'), createLeadsRouter(db, requirePermission));
  app.use('/api/crm/search', requireAuth, requireModule('crm'), createCrmSearchRouter(db));
  app.use(
    '/api/crm/customization',
    requireAuth,
    requireModule('crm'),
    createCrmCustomizationRouter(db, requirePermission),
  );
  app.use('/api/crm/records', requireAuth, requireModule('crm'), createCrmRecordsRouter(db));
  app.use(
    '/api/customer-parties',
    requireAuth,
    requireCrmFeature('crm:customers'),
    createCustomerPartiesRouter(db, requirePermission),
  );
  app.use('/api/products', requireAuth, requireCrmFeature('crm:products'), createProductsRouter(db, requirePermission));
  app.use('/api/quotes', requireAuth, requireCrmFeature('crm:quotes'), createQuotesRouter(db, requirePermission));
  app.use('/api/invoices', requireAuth, requireFinanceFeature('finance:invoices'), createInvoicesRouter(db, requirePermission));
  app.use('/api/payments', requireAuth, requireFinanceFeature('finance:payments'), createPaymentsRouter(db, requirePermission));
  app.use('/api/expenses', requireAuth, requireFinanceFeature('finance:expenses'), createExpensesRouter(db, requirePermission));
  app.use('/api/vendors', requireAuth, requireFinanceFeature('finance:vendors'), createVendorsRouter(db, requirePermission));
  app.use('/api/credit-notes', requireAuth, requireFinanceFeature('finance:invoices'), createCreditNotesRouter(db, requirePermission));
  app.use('/api/debit-notes', requireAuth, requireFinanceFeature('finance:invoices'), createDebitNotesRouter(db, requirePermission));
  app.use('/api/finance', requireAuth, requireModule('finance'), createFinanceRouter(db, requirePermission));
  app.use(
    '/api/accounting',
    requireAuth,
    requireFinanceFeature('finance:accounting'),
    createAccountingRouter(db, requirePermission),
  );
  app.use('/api/documents', requireAuth, requireModule('finance'), createDocumentsRouter(db, requirePermission));
  app.use('/api/ops', requireAuth, createOpsRouter(db, requirePermission));
  app.use('/api/ops', requireAuth, requireModule('ops'), createBusinessOpsRouter(db, requirePermission));
  app.use('/api/mfa', requireAuth, createMfaRouter(db));
  app.use('/api/health', createHealthRouter(db));
  app.use('/api/tasks', requireAuth, requireCrmFeature('crm:tasks'), createTasksRouter(db, requirePermission));
  app.use('/api/activity', requireAuth, requireModule('activity'), createActivityRouter(db, requirePermission));
  app.use('/api/projects', requireAuth, createProjectsRouter(db));
  app.use('/api/messaging', requireAuth, requireModule('messaging'), createMessagingRouter(db, requirePermission));
  app.use('/api/api-keys', requireAuth, createApiKeysRouter(db));
  app.use('/api/webhooks', requireAuth, createWebhooksRouter(db));
  app.use('/api/notifications', requireAuth, createNotificationsRouter(db));
  app.use('/api/tenant', requireAuth, createTenantBrandingRouter(db));
  app.use('/api/servers', requireAuth, requireInfraFeature('infra:servers'), createServersRouter(db, requirePermission));
  app.use('/api/platform', mountPlatformRouter(db, createRequirePlatformAdmin(db, LIVE_JWT_SECRET)));
  app.use('/v1', createV1Router(db));

  // Live-only: exercise storage key authorization without R2
  app.post('/api/__live/storage/check', requireAuth, (req: Request, res: Response) => {
    const { workspace, tenantContext } = req as AuthenticatedRequest;
    const objectKey = String((req.body as { objectKey?: string })?.objectKey ?? '');
    const tenantId = tenantContext?.tenantId ?? workspace.id;
    const allowed = assertObjectKeyBelongsToTenant(objectKey, tenantId, workspace.id);
    if (!allowed) {
      res.status(403).json({ data: null, error: { code: 'STORAGE_DENIED', message: 'Object key not in tenant namespace' } });
      return;
    }
    res.json({ data: { allowed: true, tenantId }, error: null });
  });

  app.use(errorHandler);
  return app;
}
