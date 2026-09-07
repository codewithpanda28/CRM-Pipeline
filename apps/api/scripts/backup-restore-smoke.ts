/**
 * Backup/restore drill smoke against vencore_restore_drill (isolated).
 * One-shot ops verification — not a product feature.
 */
import { createDb } from '@vencore/db';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { createLiveIsolationApp } from '../src/test/live/app';

const RESTORE_URL =
  process.env.RESTORE_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/vencore_restore_drill';

const results: Record<string, string> = {};
const notes: string[] = [];

function pass(k: string, detail?: string) {
  results[k] = 'PASS';
  if (detail) notes.push(`${k}: ${detail}`);
}
function fail(k: string, detail: string) {
  results[k] = 'FAIL';
  notes.push(`${k} FAIL: ${detail}`);
}

async function main() {
  const smokeStart = new Date();
  const db = createDb(RESTORE_URL);
  const app = createLiveIsolationApp(db);

  try {
    const health = await request(app).get('/api/health');
    const body = JSON.stringify(health.body);
    if (health.status === 200 && (health.body?.data?.db === 'ok' || body.includes('"db":"ok"'))) {
      pass('health', `status=${health.status}`);
    } else if ([200, 503].includes(health.status) && health.body?.data) {
      // redis may be down → 503 but db ok counts for restore drill
      if (health.body.data.db === 'ok') {
        pass('health', `status=${health.status} db=ok (deps may degrade)`);
      } else {
        fail('health', `status=${health.status} body=${body.slice(0, 400)}`);
      }
    } else {
      fail('health', `status=${health.status} body=${body.slice(0, 400)}`);
    }
  } catch (e) {
    fail('health', String(e));
  }

  let tokenA = '';
  try {
    const login = await request(app)
      .post('/api/auth/login')
      .set('Host', 'a.thinkaiq.com')
      .set('X-Forwarded-Host', 'a.thinkaiq.com')
      .send({ email: 'usera@isolation.test', password: 'IsolationTestPassword1!' });
    if (login.status === 200 && login.body?.data?.token) {
      tokenA = login.body.data.token as string;
      pass('login', `user=${login.body.data.id}`);
    } else {
      fail('login', `status=${login.status} body=${JSON.stringify(login.body).slice(0, 300)}`);
    }
  } catch (e) {
    fail('login', String(e));
  }

  const hostA = 'a.thinkaiq.com';
  const hostB = 'b.thinkaiq.com';
  const invoiceId = '699ada7e-4dd0-403c-b0c6-b76c37ad72ba';

  try {
    const inv = await request(app)
      .get(`/api/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Host', hostA)
      .set('X-Forwarded-Host', hostA);
    if (inv.status === 200 && inv.body?.data?.id === invoiceId) {
      pass('invoice', `number=${inv.body.data.invoice_number}`);
    } else {
      fail('invoice', `status=${inv.status} body=${JSON.stringify(inv.body).slice(0, 300)}`);
    }
  } catch (e) {
    fail('invoice', String(e));
  }

  try {
    const tb = await request(app)
      .get('/api/accounting/reports/trial-balance')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Host', hostA)
      .set('X-Forwarded-Host', hostA);
    if (tb.status === 200 && tb.body?.data) {
      pass('trial_balance', `keys=${Object.keys(tb.body.data).join(',')}`);
    } else {
      fail('trial_balance', `status=${tb.status} body=${JSON.stringify(tb.body).slice(0, 400)}`);
    }
  } catch (e) {
    fail('trial_balance', String(e));
  }

  try {
    const accts = await request(app)
      .get('/api/accounting/accounts')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Host', hostA)
      .set('X-Forwarded-Host', hostA);
    if (accts.status === 200 && Array.isArray(accts.body?.data) && accts.body.data.length > 0) {
      pass('accounting', `accounts=${accts.body.data.length}`);
    } else {
      fail('accounting', `status=${accts.status} body=${JSON.stringify(accts.body).slice(0, 300)}`);
    }
  } catch (e) {
    fail('accounting', String(e));
  }

  try {
    const loginB = await request(app)
      .post('/api/auth/login')
      .set('Host', hostB)
      .set('X-Forwarded-Host', hostB)
      .send({ email: 'userb@isolation.test', password: 'IsolationTestPassword1!' });
    const tokenB = loginB.body?.data?.token as string;
    if (!tokenB) {
      fail('tenant_isolation', `login B failed status=${loginB.status}`);
    } else {
      const cross = await request(app)
        .get(`/api/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set('Host', hostB)
        .set('X-Forwarded-Host', hostB);
      const listB = await request(app)
        .get('/api/invoices')
        .set('Authorization', `Bearer ${tokenB}`)
        .set('Host', hostB)
        .set('X-Forwarded-Host', hostB);
      const raw = listB.body?.data;
      const bInvoices = (Array.isArray(raw) ? raw : raw?.items ?? []) as Array<{ id: string }>;
      const leaked = bInvoices.some((i) => i.id === invoiceId);
      if ([403, 404].includes(cross.status) && !leaked) {
        pass('tenant_isolation', `cross_status=${cross.status} leaked=${leaked}`);
      } else {
        fail('tenant_isolation', `cross_status=${cross.status} leaked=${leaked} list=${listB.status}`);
      }
    }
  } catch (e) {
    fail('tenant_isolation', String(e));
  }

  const artifactId = '58e770a0-e432-480c-aca8-191f1a502b26';
  const storageKey =
    'tenants/3b668384-476d-4c0c-afdb-e003ae8a018d/documents/2026/09/58e770a0-e432-480c-aca8-191f1a502b26.pdf';
  try {
    const meta = await request(app)
      .get(`/api/documents/artifacts/${artifactId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Host', hostA)
      .set('X-Forwarded-Host', hostA);

    const candidates = [
      path.resolve(process.cwd(), 'storage', ...storageKey.split('/')),
      path.resolve(process.cwd(), 'apps/api/storage', ...storageKey.split('/')),
      path.resolve(process.cwd(), '../api/storage', ...storageKey.split('/')),
    ];
    const filePath = candidates.find((p) => fs.existsSync(p));
    const fileExists = Boolean(filePath);
    const fileSize = filePath ? fs.statSync(filePath).size : 0;

    let downloadStatus = -1;
    if (meta.status === 200) {
      const dl = await request(app)
        .get(`/api/documents/artifacts/${artifactId}/download`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Host', hostA)
        .set('X-Forwarded-Host', hostA);
      downloadStatus = dl.status;
    }

    if (meta.status === 200 && meta.body?.data?.id === artifactId && fileExists && fileSize > 0) {
      pass('document_storage', `meta_ok size=${fileSize} download_status=${downloadStatus}`);
    } else if (meta.status === 200 && !fileExists) {
      results['document_storage'] = 'NOT TESTED';
      notes.push('artifact metadata restored; filesystem blob not found for this drill env');
    } else {
      fail(
        'document_storage',
        `meta_status=${meta.status} fileExists=${fileExists} size=${fileSize} dl=${downloadStatus}`,
      );
    }
  } catch (e) {
    fail('document_storage', String(e));
  }

  const smokeEnd = new Date();
  const out = { results, notes, smokeStart: smokeStart.toISOString(), smokeEnd: smokeEnd.toISOString() };
  const outPath = path.resolve('../../tmp/backup-drill/smoke-results.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));

  await db.destroy();
  process.exit(Object.values(results).some((v) => v === 'FAIL') ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
