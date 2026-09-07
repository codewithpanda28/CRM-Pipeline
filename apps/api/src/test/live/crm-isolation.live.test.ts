import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { getLiveCtx } from './setup';
import { SECRETS_B } from './fixtures';
import {
  authedGet,
  authedPost,
  authedPatch,
  authedDelete,
  expectDenied,
  expectNoSecretLeak,
  expectNoId,
  signTenantToken,
} from './http';

describe('live crm-isolation', () => {
  beforeAll(async () => {
    await getLiveCtx();
  }, 120_000);

  it('userA GET contact A ok; GET contact B deny', async () => {
    const { app, fx, db } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const ok = await authedGet(app, `/api/contacts/${fx.contactA.id}`, {
      token,
      host: fx.tenantA.host,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.id).toBe(fx.contactA.id);

    const before = await db
      .selectFrom('contacts')
      .where('id', '=', fx.contactB.id)
      .select(['name', 'updated_at', 'deleted_at'])
      .executeTakeFirstOrThrow();
    const deny = await authedGet(app, `/api/contacts/${fx.contactB.id}`, {
      token,
      host: fx.tenantA.host,
    });
    expectDenied(deny);
    expectNoSecretLeak(deny.body, SECRETS_B);
    const after = await db
      .selectFrom('contacts')
      .where('id', '=', fx.contactB.id)
      .select(['name', 'updated_at', 'deleted_at'])
      .executeTakeFirstOrThrow();
    expect(after.name).toBe(before.name);
    expect(String(after.updated_at)).toBe(String(before.updated_at));
  });

  it('list contacts excludes B', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const res = await authedGet(app, '/api/contacts', { token, host: fx.tenantA.host });
    expect(res.status).toBe(200);
    expectNoId(res.body, fx.contactB.id);
    expectNoSecretLeak(res.body, SECRETS_B);
  });

  it('company GET/list/update/delete isolation', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    expect((await authedGet(app, `/api/companies/${fx.companyA.id}`, { token, host: fx.tenantA.host })).status).toBe(200);
    expectDenied(await authedGet(app, `/api/companies/${fx.companyB.id}`, { token, host: fx.tenantA.host }));
    const list = await authedGet(app, '/api/companies', { token, host: fx.tenantA.host });
    expectNoId(list.body, fx.companyB.id);
    expectDenied(
      await authedPatch(app, `/api/companies/${fx.companyB.id}`, {
        token,
        host: fx.tenantA.host,
        body: { name: 'hacked' },
      }),
    );
    expectDenied(
      await authedDelete(app, `/api/companies/${fx.companyB.id}`, { token, host: fx.tenantA.host }),
    );
  });

  it('create contact with B company_id denied', async () => {
    const { app, fx, db } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const res = await authedPost(app, '/api/contacts', {
      token,
      host: fx.tenantA.host,
      body: { name: 'X', email: 'cross-co@isolation.test', company_id: fx.companyB.id },
    });
    expect([400, 403, 404]).toContain(res.status);
    expect(
      await db.selectFrom('contacts').where('email', '=', 'cross-co@isolation.test').executeTakeFirst(),
    ).toBeUndefined();
  });

  it('deal GET/list/update/move cross-tenant deny + A→A ok', async () => {
    const { app, fx, db } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });

    const ok = await authedGet(app, `/api/deals/${fx.itemA.id}`, { token, host: fx.tenantA.host });
    expect(ok.status).toBe(200);
    expect(ok.body.data.id).toBe(fx.itemA.id);
    expect(ok.body.data.amount).toBeDefined();
    expect(ok.body.data.currency).toBeTruthy();

    expectDenied(await authedGet(app, `/api/deals/${fx.itemB.id}`, { token, host: fx.tenantA.host }));

    const list = await authedGet(app, '/api/deals', { token, host: fx.tenantA.host });
    expect(list.status).toBe(200);
    expectNoId(list.body, fx.itemB.id);
    expectNoSecretLeak(list.body, SECRETS_B);

    expectDenied(
      await authedPatch(app, `/api/deals/${fx.itemB.id}`, {
        token,
        host: fx.tenantA.host,
        body: { name: 'hacked' },
      }),
    );
    expectDenied(
      await authedPost(app, `/api/deals/${fx.itemB.id}/move`, {
        token,
        host: fx.tenantA.host,
        body: { stage_id: fx.stageA.id },
      }),
    );

    // B relations on A create
    const badPipeline = await authedPost(app, '/api/deals', {
      token,
      host: fx.tenantA.host,
      body: {
        pipeline_id: fx.pipelineB.id,
        stage_id: fx.stageB.id,
        name: 'evil',
        owner_id: fx.userA.id,
      },
    });
    expect([400, 403, 404]).toContain(badPipeline.status);

    const badStage = await authedPost(app, '/api/deals', {
      token,
      host: fx.tenantA.host,
      body: {
        pipeline_id: fx.pipelineA.id,
        stage_id: fx.stageB.id,
        name: 'evil-stage',
        owner_id: fx.userA.id,
      },
    });
    expect([400, 403, 404]).toContain(badStage.status);

    const badOwner = await authedPost(app, '/api/deals', {
      token,
      host: fx.tenantA.host,
      body: {
        pipeline_id: fx.pipelineA.id,
        stage_id: fx.stageA.id,
        name: 'evil-owner',
        owner_id: fx.userB.id,
      },
    });
    expect([400, 403, 404]).toContain(badOwner.status);

    const badContact = await authedPost(app, '/api/deals', {
      token,
      host: fx.tenantA.host,
      body: {
        pipeline_id: fx.pipelineA.id,
        stage_id: fx.stageA.id,
        name: 'evil-contact',
        owner_id: fx.userA.id,
        primary_contact_id: fx.contactB.id,
      },
    });
    expect([400, 403, 404]).toContain(badContact.status);

    const badCompany = await authedPost(app, '/api/deals', {
      token,
      host: fx.tenantA.host,
      body: {
        pipeline_id: fx.pipelineA.id,
        stage_id: fx.stageA.id,
        name: 'evil-company',
        owner_id: fx.userA.id,
        company_id: fx.companyB.id,
      },
    });
    expect([400, 403, 404]).toContain(badCompany.status);

    const createOk = await authedPost(app, '/api/deals', {
      token,
      host: fx.tenantA.host,
      body: {
        pipeline_id: fx.pipelineA.id,
        stage_id: fx.stageA.id,
        name: 'Canonical Deal A',
        owner_id: fx.userA.id,
        amount: '2500.50',
        currency: 'INR',
        primary_contact_id: fx.contactA.id,
        company_id: fx.companyA.id,
      },
    });
    expect(createOk.status).toBe(201);
    expect(createOk.body.data.amount).toMatch(/2500\.50/);
    expect(createOk.body.data.currency).toBe('INR');
    // Step 2A: company preferred → company CustomerParty attached
    expect(createOk.body.data.customer_party_id).toBeTruthy();
    const attachedParty = await db
      .selectFrom('customer_parties')
      .select(['id', 'party_type', 'party_id', 'workspace_id'])
      .where('id', '=', createOk.body.data.customer_party_id)
      .executeTakeFirstOrThrow();
    expect(attachedParty.workspace_id).toBe(fx.tenantA.id);
    expect(attachedParty.party_type).toBe('company');
    expect(attachedParty.party_id).toBe(fx.companyA.id);

    const dealId = createOk.body.data.id as string;
    const item = await db
      .selectFrom('pipeline_items')
      .where('id', '=', dealId)
      .where('workspace_id', '=', fx.tenantA.id)
      .select(['id', 'field_values'])
      .executeTakeFirst();
    expect(item).toBeTruthy();
    expect((item!.field_values as Record<string, unknown>)['name']).toBe('Canonical Deal A');

    const patchOk = await authedPatch(app, `/api/deals/${dealId}`, {
      token,
      host: fx.tenantA.host,
      body: { name: 'Canonical Deal A Updated', amount: '2600.00' },
    });
    expect(patchOk.status).toBe(200);
    expect(patchOk.body.data.name).toBe('Canonical Deal A Updated');

    const projected = await db
      .selectFrom('pipeline_items')
      .where('id', '=', dealId)
      .select('field_values')
      .executeTakeFirstOrThrow();
    expect((projected.field_values as Record<string, unknown>)['name']).toBe('Canonical Deal A Updated');

    expectDenied(
      await authedDelete(app, `/api/deals/${fx.itemB.id}`, {
        token,
        host: fx.tenantA.host,
      }),
    );

    // Cross-tenant stage move on A's deal
    const crossMove = await authedPost(app, `/api/deals/${dealId}/move`, {
      token,
      host: fx.tenantA.host,
      body: { stage_id: fx.stageB.id },
    });
    expect([400, 403, 404]).toContain(crossMove.status);

    // Soft-delete A deal — both projections
    const delOk = await authedDelete(app, `/api/deals/${dealId}`, {
      token,
      host: fx.tenantA.host,
    });
    expect(delOk.status).toBe(200);
    const dealGone = await db
      .selectFrom('deals')
      .where('id', '=', dealId)
      .select(['deleted_at'])
      .executeTakeFirstOrThrow();
    const itemGone = await db
      .selectFrom('pipeline_items')
      .where('id', '=', dealId)
      .select(['deleted_at'])
      .executeTakeFirstOrThrow();
    expect(dealGone.deleted_at).toBeTruthy();
    expect(itemGone.deleted_at).toBeTruthy();
  });

  it('deal win/lose stage move updates status (A→A)', async () => {
    const { app, fx, db } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });

    const wonStageId = randomUUID();
    const lostStageId = randomUUID();
    await db
      .insertInto('pipeline_stages')
      .values([
        {
          id: wonStageId,
          pipeline_id: fx.pipelineA.id,
          name: 'Won',
          position: 10,
          is_won: true,
          is_lost: false,
        },
        {
          id: lostStageId,
          pipeline_id: fx.pipelineA.id,
          name: 'Lost',
          position: 11,
          is_won: false,
          is_lost: true,
        },
      ])
      .execute();

    const created = await authedPost(app, '/api/deals', {
      token,
      host: fx.tenantA.host,
      body: {
        pipeline_id: fx.pipelineA.id,
        stage_id: fx.stageA.id,
        name: 'WinLose Deal',
        owner_id: fx.userA.id,
        amount: '100.00',
        currency: 'INR',
        company_id: fx.companyA.id,
      },
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    const won = await authedPost(app, `/api/deals/${id}/move`, {
      token,
      host: fx.tenantA.host,
      body: { stage_id: wonStageId },
    });
    expect(won.status).toBe(200);
    expect(won.body.data.status).toBe('won');
    expect(won.body.data.won_at).toBeTruthy();

    const itemWon = await db
      .selectFrom('pipeline_items')
      .where('id', '=', id)
      .select(['stage_id'])
      .executeTakeFirstOrThrow();
    expect(itemWon.stage_id).toBe(wonStageId);

    const lost = await authedPost(app, `/api/deals/${id}/move`, {
      token,
      host: fx.tenantA.host,
      body: { stage_id: lostStageId, lost_reason: 'budget' },
    });
    expect(lost.status).toBe(200);
    expect(lost.body.data.status).toBe('lost');
    expect(lost.body.data.lost_at).toBeTruthy();
  });

  it('Deal ↔ CustomerParty create/won + cross-tenant party deny', async () => {
    const { app, fx, db } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });

    // Contact-only → contact party
    const contactOnly = await authedPost(app, '/api/deals', {
      token,
      host: fx.tenantA.host,
      body: {
        pipeline_id: fx.pipelineA.id,
        stage_id: fx.stageA.id,
        name: 'Contact Party Deal',
        owner_id: fx.userA.id,
        primary_contact_id: fx.contactA.id,
      },
    });
    expect(contactOnly.status).toBe(201);
    expect(contactOnly.body.data.customer_party_id).toBeTruthy();
    const contactParty = await db
      .selectFrom('customer_parties')
      .select(['party_type', 'party_id'])
      .where('id', '=', contactOnly.body.data.customer_party_id)
      .executeTakeFirstOrThrow();
    expect(contactParty.party_type).toBe('contact');
    expect(contactParty.party_id).toBe(fx.contactA.id);

    // Neither → rejected (CustomerParty / company / contact required)
    const bare = await authedPost(app, '/api/deals', {
      token,
      host: fx.tenantA.host,
      body: {
        pipeline_id: fx.pipelineA.id,
        stage_id: fx.stageA.id,
        name: 'Bare Deal',
        owner_id: fx.userA.id,
      },
    });
    expect(bare.status).toBe(400);
    expect(bare.body.error?.code).toBe('CUSTOMER_REQUIRED');

    // Ensure/reuse — second deal same company reuses party
    const first = await authedPost(app, '/api/deals', {
      token,
      host: fx.tenantA.host,
      body: {
        pipeline_id: fx.pipelineA.id,
        stage_id: fx.stageA.id,
        name: 'Reuse A',
        owner_id: fx.userA.id,
        company_id: fx.companyA.id,
      },
    });
    const second = await authedPost(app, '/api/deals', {
      token,
      host: fx.tenantA.host,
      body: {
        pipeline_id: fx.pipelineA.id,
        stage_id: fx.stageA.id,
        name: 'Reuse B',
        owner_id: fx.userA.id,
        company_id: fx.companyA.id,
      },
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.data.customer_party_id).toBe(second.body.data.customer_party_id);
    const partyCount = await db
      .selectFrom('customer_parties')
      .select(db.fn.countAll<number>().as('n'))
      .where('workspace_id', '=', fx.tenantA.id)
      .where('party_type', '=', 'company')
      .where('party_id', '=', fx.companyA.id)
      .where('deleted_at', 'is', null)
      .where('status', '!=', 'merged')
      .executeTakeFirstOrThrow();
    expect(Number(partyCount.n)).toBe(1);

    // Won with null party + contact → attach
    const wonStageId = randomUUID();
    await db
      .insertInto('pipeline_stages')
      .values({
        id: wonStageId,
        pipeline_id: fx.pipelineA.id,
        name: 'Won CP',
        position: 20,
        is_won: true,
        is_lost: false,
      })
      .execute();
    const openDeal = await authedPost(app, '/api/deals', {
      token,
      host: fx.tenantA.host,
      body: {
        pipeline_id: fx.pipelineA.id,
        stage_id: fx.stageA.id,
        name: 'Won Attach',
        owner_id: fx.userA.id,
        primary_contact_id: fx.contactA.id,
      },
    });
    expect(openDeal.status).toBe(201);
    const openPartyId = openDeal.body.data.customer_party_id as string;
    // Clear party to simulate legacy null (test won hook)
    await db
      .updateTable('deals')
      .set({ customer_party_id: null })
      .where('id', '=', openDeal.body.data.id)
      .execute();
    const won = await authedPost(app, `/api/deals/${openDeal.body.data.id}/move`, {
      token,
      host: fx.tenantA.host,
      body: { stage_id: wonStageId },
    });
    expect(won.status).toBe(200);
    expect(won.body.data.status).toBe('won');
    expect(won.body.data.customer_party_id).toBe(openPartyId);

    // Won with existing party unchanged
    const wonAgain = await authedPost(app, `/api/deals/${openDeal.body.data.id}/move`, {
      token,
      host: fx.tenantA.host,
      body: { stage_id: wonStageId },
    });
    expect(wonAgain.status).toBe(200);
    expect(wonAgain.body.data.customer_party_id).toBe(openPartyId);

    // Cross-tenant party reject on create
    const foreignParty = await db
      .insertInto('customer_parties')
      .values({
        workspace_id: fx.tenantB.id,
        party_type: 'company',
        party_id: fx.companyB.id,
        display_name: 'Foreign',
        status: 'active',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const badParty = await authedPost(app, '/api/deals', {
      token,
      host: fx.tenantA.host,
      body: {
        pipeline_id: fx.pipelineA.id,
        stage_id: fx.stageA.id,
        name: 'Evil Party',
        owner_id: fx.userA.id,
        customer_party_id: foreignParty.id,
      },
    });
    expect([400, 403, 404]).toContain(badParty.status);
  });

  it('pipeline / item / stage cross-tenant deny', async () => {
    const { app, fx, db } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });

    expectDenied(await authedGet(app, `/api/pipelines/${fx.pipelineB.id}`, { token, host: fx.tenantA.host }));
    expectDenied(await authedGet(app, `/api/items/${fx.itemB.id}`, { token, host: fx.tenantA.host }));

    const list = await authedGet(app, `/api/pipelines/${fx.pipelineA.id}/items`, {
      token,
      host: fx.tenantA.host,
    });
    expect(list.status).toBe(200);
    expectNoId(list.body, fx.itemB.id);

    // Cross-tenant stage on A's pipeline create
    const create = await authedPost(app, `/api/pipelines/${fx.pipelineA.id}/items`, {
      token,
      host: fx.tenantA.host,
      body: { stage_id: fx.stageB.id, field_values: { title: 'evil' } },
    });
    expect([400, 403, 404]).toContain(create.status);
    expect(create.body?.error?.code).toMatch(/INVALID_STAGE|NOT_FOUND/);

    // Move A item to B stage
    const move = await authedPatch(app, `/api/items/${fx.itemA.id}/move`, {
      token,
      host: fx.tenantA.host,
      body: { stage_id: fx.stageB.id, position: 0 },
    });
    expect([400, 403, 404]).toContain(move.status);

    // Patch stage B under pipeline A
    const stagePatch = await authedPatch(app, `/api/pipelines/${fx.pipelineA.id}/stages/${fx.stageB.id}`, {
      token,
      host: fx.tenantA.host,
      body: { name: 'hijack' },
    });
    expectDenied(stagePatch);

    const stageB = await db
      .selectFrom('pipeline_stages')
      .where('id', '=', fx.stageB.id)
      .select('name')
      .executeTakeFirstOrThrow();
    expect(stageB.name).toBe('Stage B');
  });

  it('task / activity / project isolation', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });

    expect((await authedGet(app, `/api/tasks?show_all=true`, { token, host: fx.tenantA.host })).status).toBe(200);
    const taskList = await authedGet(app, `/api/tasks?show_all=true`, { token, host: fx.tenantA.host });
    expectNoId(taskList.body, fx.taskB.id);
    expect(
      (taskList.body.data as { id: string }[]).some((t) => t.id === fx.taskA.id),
    ).toBe(true);
    expectDenied(
      await authedPatch(app, `/api/tasks/${fx.taskB.id}`, {
        token,
        host: fx.tenantA.host,
        body: { title: 'x' },
      }),
    );
    expectDenied(await authedDelete(app, `/api/tasks/${fx.taskB.id}`, { token, host: fx.tenantA.host }));

    const activity = await authedGet(app, '/api/activity', { token, host: fx.tenantA.host });
    expect(activity.status).toBe(200);
    expectNoId(activity.body, fx.activityB.id);
    expectNoSecretLeak(activity.body, SECRETS_B);

    expect((await authedGet(app, `/api/projects/${fx.projectA.id}`, { token, host: fx.tenantA.host })).status).toBe(200);
    expectDenied(await authedGet(app, `/api/projects/${fx.projectB.id}`, { token, host: fx.tenantA.host }));

    const projects = await authedGet(app, '/api/projects', { token, host: fx.tenantA.host });
    expectNoId(projects.body, fx.projectB.id);

    const badCreate = await authedPost(app, '/api/projects', {
      token,
      host: fx.tenantA.host,
      body: { name: 'Cross', company_id: fx.companyB.id },
    });
    expect([400, 403, 404]).toContain(badCreate.status);
  });

  it('messaging channel isolation + B attachment key deny', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });

    expect(
      (await authedGet(app, `/api/messaging/channels/${fx.channelA.id}`, { token, host: fx.tenantA.host })).status,
    ).toBe(200);
    expectDenied(
      await authedGet(app, `/api/messaging/channels/${fx.channelB.id}`, { token, host: fx.tenantA.host }),
    );

    const channels = await authedGet(app, '/api/messaging/channels?scope=all', {
      token,
      host: fx.tenantA.host,
    });
    expect(channels.status).toBe(200);
    expectNoId(channels.body, fx.channelB.id);

    const msg = await authedPost(app, `/api/messaging/channels/${fx.channelA.id}/messages`, {
      token,
      host: fx.tenantA.host,
      body: {
        body: 'with bad attachment',
        attachments: [
          {
            r2_key: fx.fileKeyB,
            filename: 'x.txt',
            size_bytes: 10,
            mime_type: 'text/plain',
          },
        ],
      },
    });
    expect([400, 403]).toContain(msg.status);
    expect(msg.body?.error?.code).toMatch(/INVALID_ATTACHMENT|STORAGE/);
  });

  it('notifications list excludes B', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const res = await authedGet(app, '/api/notifications', { token, host: fx.tenantA.host });
    expect(res.status).toBe(200);
    expectNoId(res.body, fx.notificationB.id);
    expectNoSecretLeak(res.body, SECRETS_B);
  });

  it('servers isolation', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const list = await authedGet(app, '/api/servers', { token, host: fx.tenantA.host });
    expect(list.status).toBe(200);
    expectNoId(list.body, fx.serverB.id);
    expectNoSecretLeak(list.body, SECRETS_B);
  });

  it('lead CRUD + convert isolation (A→A ok, A→B deny)', async () => {
    const { app, fx, db } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });

    const badOwner = await authedPost(app, '/api/leads', {
      token,
      host: fx.tenantA.host,
      body: {
        name: 'Evil Lead',
        email: 'evil-lead@example.com',
        owner_id: fx.userB.id,
      },
    });
    expect([400, 403, 404]).toContain(badOwner.status);

    const created = await authedPost(app, '/api/leads', {
      token,
      host: fx.tenantA.host,
      body: {
        name: 'Lead Alpha',
        email: 'lead-alpha@isolation.test',
        phone: '+91 90000 00001',
        company_name: 'Alpha Co',
        owner_id: fx.userA.id,
        source: 'web',
      },
    });
    expect(created.status).toBe(201);
    const leadId = created.body.data.id as string;
    expect(created.body.meta?.duplicates).toBeDefined();

    const getOk = await authedGet(app, `/api/leads/${leadId}`, { token, host: fx.tenantA.host });
    expect(getOk.status).toBe(200);
    expect(getOk.body.data.status).toBe('new');

    const list = await authedGet(app, '/api/leads', { token, host: fx.tenantA.host });
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).toContain(leadId);

    const patchOk = await authedPatch(app, `/api/leads/${leadId}`, {
      token,
      host: fx.tenantA.host,
      body: { status: 'qualified' },
    });
    expect(patchOk.status).toBe(200);
    expect(patchOk.body.data.status).toBe('qualified');

    // Cross-tenant convert contact attach deny
    const badContactConvert = await authedPost(app, `/api/leads/${leadId}/convert`, {
      token,
      host: fx.tenantA.host,
      body: { contact_id: fx.contactB.id, create_company: false, create_deal: false },
    });
    expect([400, 403, 404]).toContain(badContactConvert.status);

    const convertOk = await authedPost(app, `/api/leads/${leadId}/convert`, {
      token,
      host: fx.tenantA.host,
      body: {
        create_company: true,
        create_deal: true,
        deal: {
          pipeline_id: fx.pipelineA.id,
          stage_id: fx.stageA.id,
          name: 'Deal from Lead Alpha',
          amount: '1500.00',
          currency: 'INR',
        },
      },
    });
    expect([200, 201]).toContain(convertOk.status);
    expect(convertOk.body.data.lead.status).toBe('converted');
    expect(convertOk.body.data.lead.contact_id).toBeTruthy();
    expect(convertOk.body.data.lead.deal_id).toBeTruthy();

    const dealId = convertOk.body.data.lead.deal_id as string;
    const dealRow = await db
      .selectFrom('deals')
      .select(['id', 'workspace_id', 'primary_contact_id'])
      .where('id', '=', dealId)
      .executeTakeFirstOrThrow();
    expect(dealRow.workspace_id).toBe(fx.tenantA.id);
    const itemRow = await db
      .selectFrom('pipeline_items')
      .select('id')
      .where('id', '=', dealId)
      .executeTakeFirst();
    expect(itemRow?.id).toBe(dealId);

    // Idempotent re-convert
    const again = await authedPost(app, `/api/leads/${leadId}/convert`, {
      token,
      host: fx.tenantA.host,
      body: { create_company: true, create_deal: false },
    });
    expect(again.status).toBe(200);
    expect(again.body.data.idempotent).toBe(true);

    // Soft-delete another lead
    const doomed = await authedPost(app, '/api/leads', {
      token,
      host: fx.tenantA.host,
      body: {
        name: 'Doomed',
        email: 'doomed-lead@isolation.test',
        owner_id: fx.userA.id,
      },
    });
    expect(doomed.status).toBe(201);
    const del = await authedDelete(app, `/api/leads/${doomed.body.data.id}`, {
      token,
      host: fx.tenantA.host,
    });
    expect(del.status).toBe(200);
  });

  it('CustomerParty CRUD / 360 / merge / cross-tenant deny', async () => {
    const { app, fx, db } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });

    const created = await authedPost(app, '/api/customer-parties', {
      token,
      host: fx.tenantA.host,
      body: { company_id: fx.companyA.id },
    });
    expect([200, 201]).toContain(created.status);
    const partyId = created.body.data.id as string;

    const list = await authedGet(app, '/api/customer-parties', { token, host: fx.tenantA.host });
    expect(list.status).toBe(200);
    expect(list.body.data.some((p: { id: string }) => p.id === partyId)).toBe(true);

    const view360 = await authedGet(app, `/api/customer-parties/${partyId}/360`, {
      token,
      host: fx.tenantA.host,
    });
    expect(view360.status).toBe(200);
    expect(view360.body.data.party.id).toBe(partyId);
    expect(view360.body.data.extensions.finance.available).toBe(true);

    // Cross-tenant get deny
    expectDenied(
      await authedGet(app, `/api/customer-parties/${partyId}`, {
        token: signTenantToken({ userId: fx.userB.id, tenantId: fx.tenantB.id }),
        host: fx.tenantB.host,
      }),
    );

    // Second party for merge
    const otherContact = await db
      .insertInto('contacts')
      .values({
        id: randomUUID(),
        workspace_id: fx.tenantA.id,
        owner_id: fx.userA.id,
        name: 'Merge Contact',
        email: `merge-${randomUUID().slice(0, 8)}@isolation.test`,
        status: 'customer',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const second = await authedPost(app, '/api/customer-parties', {
      token,
      host: fx.tenantA.host,
      body: { contact_id: otherContact.id },
    });
    expect([200, 201]).toContain(second.status);
    const sourceId = second.body.data.id as string;

    const merged = await authedPost(app, `/api/customer-parties/${sourceId}/merge`, {
      token,
      host: fx.tenantA.host,
      body: { into_id: partyId, reason: 'live isolation merge test' },
    });
    expect(merged.status).toBe(200);
    expect(merged.body.data.survivor_id).toBe(partyId);

    const redirected = await authedGet(app, `/api/customer-parties/${sourceId}/360`, {
      token,
      host: fx.tenantA.host,
    });
    expect(redirected.status).toBe(200);
    expect(redirected.body.data.redirected).toBe(true);
    expect(redirected.body.data.into_party_id).toBe(partyId);

    // Lead convert with party flag
    const lead = await authedPost(app, '/api/leads', {
      token,
      host: fx.tenantA.host,
      body: {
        name: 'Party Lead',
        email: `party-lead-${randomUUID().slice(0, 8)}@isolation.test`,
        owner_id: fx.userA.id,
        company_name: 'Party Lead Co',
      },
    });
    expect(lead.status).toBe(201);
    const convert = await authedPost(app, `/api/leads/${lead.body.data.id}/convert`, {
      token,
      host: fx.tenantA.host,
      body: { create_company: true, create_customer_party: true, create_deal: false },
    });
    expect([200, 201]).toContain(convert.status);
    expect(convert.body.data.party_action).toMatch(/created|reused/);
    expect(convert.body.data.links.some((l: { entity_type: string }) => l.entity_type === 'customer_party')).toBe(
      true,
    );

    // Backfill dry-run
    const dry = await authedPost(app, '/api/customer-parties/backfill', {
      token,
      host: fx.tenantA.host,
      body: { dry_run: true },
    });
    expect(dry.status).toBe(200);
    expect(dry.body.data.dry_run).toBe(true);
  });

  it('Products + Quotes CRUD / lifecycle / snapshots / cross-tenant deny', async () => {
    const { app, fx, db } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const tokenB = signTenantToken({ userId: fx.userB.id, tenantId: fx.tenantB.id });

    const product = await authedPost(app, '/api/products', {
      token,
      host: fx.tenantA.host,
      body: {
        kind: 'service',
        sku: `SKU-${randomUUID().slice(0, 8)}`,
        name: 'Consulting Hour',
        list_price: '1000.00',
        currency: 'INR',
        unit: 'hour',
      },
    });
    expect(product.status).toBe(201);
    const productId = product.body.data.id as string;

    const dup = await authedPost(app, '/api/products', {
      token,
      host: fx.tenantA.host,
      body: {
        kind: 'service',
        sku: product.body.data.sku,
        name: 'Dup',
        list_price: '1',
      },
    });
    expect(dup.status).toBe(409);

    expectDenied(
      await authedGet(app, `/api/products/${productId}`, { token: tokenB, host: fx.tenantB.host }),
    );

    const party = await authedPost(app, '/api/customer-parties', {
      token,
      host: fx.tenantA.host,
      body: { company_id: fx.companyA.id },
    });
    expect([200, 201]).toContain(party.status);
    const partyId = party.body.data.id as string;

    const quote = await authedPost(app, '/api/quotes', {
      token,
      host: fx.tenantA.host,
      body: {
        customer_party_id: partyId,
        place_of_supply_intra: true,
        lines: [
          {
            product_id: productId,
            quantity: '2',
            tax_rate: '18',
            tax_type: 'gst',
            hsn_sac: '9983',
          },
          {
            name_snapshot: 'Ad-hoc fee',
            quantity: '1',
            unit_price: '100.00',
            tax_type: 'none',
          },
        ],
      },
    });
    expect(quote.status).toBe(201);
    const quoteId = quote.body.data.id as string;
    expect(quote.body.data.status).toBe('draft');
    expect(quote.body.data.lines[0].sku_snapshot).toBe(product.body.data.sku);
    expect(quote.body.data.lines[0].name_snapshot).toBe('Consulting Hour');
    expect(quote.body.data.lines[0].unit_price).toBe('1000.00');
    // 2*1000 + 18% = 2360; + 100 ad-hoc = 2460
    expect(quote.body.data.total).toBe('2460.00');

    // Price change must not mutate quote snapshot
    await authedPatch(app, `/api/products/${productId}`, {
      token,
      host: fx.tenantA.host,
      body: { list_price: '9999.00' },
    });
    const qAgain = await authedGet(app, `/api/quotes/${quoteId}`, { token, host: fx.tenantA.host });
    expect(qAgain.body.data.lines[0].unit_price).toBe('1000.00');

    // status PATCH rejected
    const badPatch = await authedPatch(app, `/api/quotes/${quoteId}`, {
      token,
      host: fx.tenantA.host,
      body: { status: 'accepted' },
    });
    expect(badPatch.status).toBe(400);

    const sent = await authedPost(app, `/api/quotes/${quoteId}/send`, {
      token,
      host: fx.tenantA.host,
      body: {},
    });
    expect(sent.status).toBe(200);
    expect(sent.body.data.status).toBe('sent');

    // Repeated send is rejected (idempotent-safe)
    const sentAgain = await authedPost(app, `/api/quotes/${quoteId}/send`, {
      token,
      host: fx.tenantA.host,
      body: {},
    });
    expect(sentAgain.status).toBe(409);

    const editSent = await authedPatch(app, `/api/quotes/${quoteId}`, {
      token,
      host: fx.tenantA.host,
      body: { notes: 'nope' },
    });
    expect(editSent.status).toBe(409);

    const revised = await authedPost(app, `/api/quotes/${quoteId}/revise`, {
      token,
      host: fx.tenantA.host,
      body: {},
    });
    expect(revised.status).toBe(201);
    expect(revised.body.data.version).toBe(2);
    expect(revised.body.data.quote_number).toBe(quote.body.data.quote_number);
    expect(revised.body.data.status).toBe('draft');
    expect(revised.body.data.supersedes_quote_id).toBe(quoteId);

    // Second revise of same sent parent allocates next free version (no unique clash)
    const revised2 = await authedPost(app, `/api/quotes/${quoteId}/revise`, {
      token,
      host: fx.tenantA.host,
      body: {},
    });
    expect(revised2.status).toBe(201);
    expect(revised2.body.data.version).toBe(3);

    const accepted = await authedPost(app, `/api/quotes/${quoteId}/accept`, {
      token,
      host: fx.tenantA.host,
      body: {},
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.status).toBe('accepted');

    // Deal not auto-won
    const dealRows = await db
      .selectFrom('deals')
      .select(['id', 'status'])
      .where('workspace_id', '=', fx.tenantA.id)
      .execute();
    expect(dealRows.every((d) => d.status !== 'won' || d.id)).toBe(true);

    const view360 = await authedGet(app, `/api/customer-parties/${partyId}/360`, {
      token,
      host: fx.tenantA.host,
    });
    expect(view360.status).toBe(200);
    expect(
      view360.body.data.quotes.some((q: { id: string }) => q.id === quoteId || q.id === revised.body.data.id),
    ).toBe(true);

    expectDenied(
      await authedGet(app, `/api/quotes/${quoteId}`, { token: tokenB, host: fx.tenantB.host }),
    );

    // Auto-ensure party from company
    const q2 = await authedPost(app, '/api/quotes', {
      token,
      host: fx.tenantA.host,
      body: {
        company_id: fx.companyA.id,
        lines: [{ name_snapshot: 'Solo', quantity: '1', unit_price: '10' }],
      },
    });
    expect(q2.status).toBe(201);
    expect(q2.body.data.customer_party_id).toBeTruthy();
  });

  it('CRM search + lead import/export/bulk isolation (Block 1)', async () => {
    const { app, fx, db } = await getLiveCtx();
    const tokenA = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const tokenB = signTenantToken({ userId: fx.userB.id, tenantId: fx.tenantB.id });
    const unique = randomUUID().slice(0, 8);
    const email = `block1-${unique}@isolation.test`;

    const created = await authedPost(app, '/api/leads', {
      token: tokenA,
      host: fx.tenantA.host,
      body: {
        name: `Block1Lead ${unique}`,
        email,
        owner_id: fx.userA.id,
      },
    });
    expect(created.status).toBe(201);
    const leadId = created.body.data.id as string;

    const searchA = await authedGet(app, `/api/crm/search?q=${encodeURIComponent(`Block1Lead ${unique}`)}`, {
      token: tokenA,
      host: fx.tenantA.host,
    });
    expect(searchA.status).toBe(200);
    expect(JSON.stringify(searchA.body)).toContain(leadId);
    expectNoId(searchA.body, fx.contactB.id);

    const searchB = await authedGet(app, `/api/crm/search?q=${encodeURIComponent(`Block1Lead ${unique}`)}`, {
      token: tokenB,
      host: fx.tenantB.host,
    });
    expect(searchB.status).toBe(200);
    expectNoId(searchB.body, leadId);

    const preview = await authedPost(app, '/api/leads/import/preview', {
      token: tokenA,
      host: fx.tenantA.host,
      body: {
        rows: [
          { name: `Import ${unique}`, email },
          { name: `Import New ${unique}`, email: `new-${email}` },
        ],
      },
    });
    expect(preview.status).toBe(200);
    expect(preview.body.data.duplicate_warnings).toBeGreaterThanOrEqual(1);
    const beforeCount = await db
      .selectFrom('leads')
      .select((eb) => eb.fn.countAll<string>().as('c'))
      .where('workspace_id', '=', fx.tenantA.id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    // preview must not write
    const afterPreview = await db
      .selectFrom('leads')
      .select((eb) => eb.fn.countAll<string>().as('c'))
      .where('workspace_id', '=', fx.tenantA.id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    expect(Number(afterPreview?.c)).toBe(Number(beforeCount?.c));

    const commit = await authedPost(app, '/api/leads/import/commit', {
      token: tokenA,
      host: fx.tenantA.host,
      body: {
        rows: [
          { name: `Import ${unique}`, email },
          { name: `Import New ${unique}`, email: `new-${email}` },
        ],
        options: { skip_email_duplicates: true },
      },
    });
    expect(commit.status).toBe(200);
    expect(commit.body.data.duplicate).toBeGreaterThanOrEqual(1);
    expect(commit.body.data.created).toBeGreaterThanOrEqual(1);

    const exportRes = await authedGet(app, '/api/leads/export', {
      token: tokenA,
      host: fx.tenantA.host,
    });
    expect(exportRes.status).toBe(200);
    expect(String(exportRes.text ?? exportRes.body)).toContain('name,first_name');
    expect(String(exportRes.text ?? exportRes.body)).not.toContain('contact-b-secret@isolation.test');

    const bulk = await authedPost(app, '/api/leads/bulk', {
      token: tokenA,
      host: fx.tenantA.host,
      body: { action: 'status', ids: [leadId], status: 'contacted' },
    });
    expect(bulk.status).toBe(200);
    expect(bulk.body.data.updated).toBe(1);

    const crossBulk = await authedPost(app, '/api/leads/bulk', {
      token: tokenB,
      host: fx.tenantB.host,
      body: { action: 'delete', ids: [leadId] },
    });
    expect(crossBulk.status).toBe(200);
    expect(crossBulk.body.data.updated).toBe(0);

    const stillThere = await db
      .selectFrom('leads')
      .select(['id', 'deleted_at', 'workspace_id'])
      .where('id', '=', leadId)
      .executeTakeFirstOrThrow();
    expect(stillThere.workspace_id).toBe(fx.tenantA.id);
    expect(stillThere.deleted_at).toBeNull();
  });
});
