import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { createRequireApiKey } from '../../middleware/api-key-auth';
import { createV1ContactsRouter } from './contacts';
import { createV1CompaniesRouter } from './companies';
import { createV1TasksRouter } from './tasks';
import { createV1InfraRouter } from './infra';
import { createV1DealsRouter } from './deals';
import { createV1LeadsRouter } from './leads';
import { createV1CustomerPartiesRouter } from './customer-parties';
import { createV1ProductsRouter } from './products';
import { createV1QuotesRouter } from './quotes';
import { createV1InvoicesRouter } from './invoices';
import { createV1PaymentsRouter } from './payments';

export function createV1Router(db: Kysely<Database>): ExpressRouter {
  const router = Router();
  const requireApiKey = createRequireApiKey(db);

  // All /v1 routes require a valid API key
  router.use(requireApiKey);

  router.use('/contacts', createV1ContactsRouter(db));
  router.use('/companies', createV1CompaniesRouter(db));
  router.use('/tasks', createV1TasksRouter(db));
  router.use('/deals', createV1DealsRouter(db));
  router.use('/leads', createV1LeadsRouter(db));
  router.use('/customer-parties', createV1CustomerPartiesRouter(db));
  router.use('/products', createV1ProductsRouter(db));
  router.use('/quotes', createV1QuotesRouter(db));
  router.use('/invoices', createV1InvoicesRouter(db));
  router.use('/payments', createV1PaymentsRouter(db));

  // Infra routes mounted directly (they define /servers, /alerts, /websites)
  const infraRouter = createV1InfraRouter(db);
  router.use('/', infraRouter);

  return router;
}
