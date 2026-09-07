import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PLATFORM_IDENTITY } from '@vencore/config';
import { createConfigRouter } from './config';

function makeApp(configName = 'Vencore') {
  const config = {
    app: {
      name: configName,
      logoUrl: '/logo.png',
      faviconUrl: undefined,
      tagline: undefined,
      appearance: {
        accentColor: '#0b1330',
        preset: 'default',
        radius: 'rounded' as const,
        density: 'comfortable' as const,
        sidebarStyle: 'light' as const,
        login: { background: null, backgroundImage: null },
      },
    },
    features: { crm: true, infra: true, alerts: true, analytics: false, files: false },
    smtp: null,
    databases: [],
  };

  const db = {
    selectFrom: () => ({
      where: () => ({
        select: () => ({
          executeTakeFirst: async () => null,
        }),
      }),
    }),
  };

  const app = express();
  app.use(express.json());
  app.use('/api/config', createConfigRouter(config as never, db as never, ((_req, _res, next) => next()) as never));
  return app;
}

describe('GET /api/config platform branding', () => {
  it('maps legacy Vencore defaults to ThinkAIQ CRM', async () => {
    const res = await request(makeApp('Vencore')).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.data.app.name).toBe(PLATFORM_IDENTITY.productName);
    expect(res.body.data.app.logoUrl).toBe(PLATFORM_IDENTITY.assets.logoMark);
    expect(res.body.data.app.faviconUrl).toBe(PLATFORM_IDENTITY.assets.favicon);
    expect(res.body.data.app.name).not.toMatch(/Vencore/i);
  });

  it('preserves custom instance branding names', async () => {
    const res = await request(makeApp('Acme CRM')).get('/api/config');
    expect(res.body.data.app.name).toBe('Acme CRM');
  });
});
