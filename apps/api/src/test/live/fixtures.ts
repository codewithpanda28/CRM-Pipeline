import { createHash } from 'crypto';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { seedWorkspaceRoles } from '../../lib/seed-roles';
import { seedWorkspaceModules } from '../../lib/seed-modules';
import { assignRole } from '../../lib/role-assignment';
import { resetLiveFixtureTables } from './db';
import { tenantObjectKey, legacyMessagingKeyPrefix } from '@vencore/tenancy';

export interface IsolationFixtures {
  tenantA: { id: string; slug: string; host: string };
  tenantB: { id: string; slug: string; host: string };
  userA: { id: string; email: string; password: string };
  userB: { id: string; email: string; password: string };
  multiUser: { id: string; email: string; password: string };
  platformUser: { id: string; email: string; rawToken: string };
  contactA: { id: string; email: string; name: string };
  contactB: { id: string; email: string; name: string };
  companyA: { id: string; name: string };
  companyB: { id: string; name: string };
  pipelineA: { id: string };
  pipelineB: { id: string };
  stageA: { id: string };
  stageB: { id: string };
  itemA: { id: string };
  itemB: { id: string };
  taskA: { id: string };
  taskB: { id: string };
  activityA: { id: string };
  activityB: { id: string };
  tagA: { id: string };
  tagB: { id: string };
  projectA: { id: string; name: string };
  projectB: { id: string; name: string };
  channelA: { id: string; name: string };
  channelB: { id: string; name: string };
  messageA: { id: string };
  messageB: { id: string };
  notificationA: { id: string };
  notificationB: { id: string };
  apiKeyA: { id: string; raw: string };
  apiKeyB: { id: string; raw: string };
  webhookA: { id: string; secret: string };
  webhookB: { id: string; secret: string };
  deliveryA: { id: string };
  deliveryB: { id: string };
  outboxA: { id: string };
  outboxB: { id: string };
  auditA: { id: string };
  auditB: { id: string };
  serverA: { id: string; name: string };
  serverB: { id: string; name: string };
  fileKeyA: string;
  fileKeyB: string;
  legacyFileKeyA: string;
  legacyFileKeyB: string;
}

const PASSWORD = 'IsolationTestPassword1!';

function rawApiKey(tag: 'a' | 'b'): string {
  return `vnt_read_${tag}${'0'.repeat(62)}`;
}

async function provisionTenant(
  db: Kysely<Database>,
  opts: { id: string; name: string; slug: string; brandColor: string },
) {
  await db
    .insertInto('workspaces')
    .values({
      id: opts.id,
      name: opts.name,
      domain: `${opts.slug}.thinkaiq.com`,
    })
    .execute();

  await db
    .insertInto('tenants')
    .values({
      id: opts.id,
      display_name: opts.name,
      slug: opts.slug,
      status: 'active',
      provisioned_at: new Date(),
    })
    .execute();

  await db
    .insertInto('tenant_domains')
    .values({
      tenant_id: opts.id,
      host: `${opts.slug}.thinkaiq.com`,
      type: 'tenant_subdomain',
      is_primary: true,
      verification_status: 'active',
      ssl_status: 'ready',
    })
    .execute();

  await db
    .insertInto('tenant_settings')
    .values({
      tenant_id: opts.id,
      locale: opts.slug === 'a' ? 'en-IN' : 'en-US',
      timezone: opts.slug === 'a' ? 'Asia/Kolkata' : 'UTC',
      settings: { tenant: opts.slug },
    })
    .execute();

  await db
    .insertInto('tenant_branding')
    .values({
      tenant_id: opts.id,
      brand_name: opts.name,
      primary_color: opts.brandColor,
      theme: { tenant: opts.slug, mark: `brand-${opts.slug}-secret` },
      version: 1,
    })
    .execute();

  await db
    .insertInto('tenant_job_controls')
    .values({ tenant_id: opts.id, jobs_paused: false })
    .execute();

  await seedWorkspaceModules(db, opts.id, { crm: true, analytics: true, infra: true, finance: true });
  const roles = await seedWorkspaceRoles(db, opts.id);
  return roles;
}

async function createUser(
  db: Kysely<Database>,
  opts: { id: string; email: string; name: string; primaryWorkspaceId: string },
) {
  const password_hash = await bcrypt.hash(PASSWORD, 4);
  await db
    .insertInto('users')
    .values({
      id: opts.id,
      email: opts.email,
      name: opts.name,
      password_hash,
      workspace_id: opts.primaryWorkspaceId,
      is_active: true,
      session_version: 1,
    })
    .execute();
  return { id: opts.id, email: opts.email, password: PASSWORD };
}

export async function seedIsolationFixtures(db: Kysely<Database>): Promise<IsolationFixtures> {
  await resetLiveFixtureTables(db);

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();
  const multiId = randomUUID();
  const platformId = randomUUID();

  const rolesA = await provisionTenant(db, {
    id: tenantAId,
    name: 'Tenant A',
    slug: 'a',
    brandColor: '#111111',
  });
  const rolesB = await provisionTenant(db, {
    id: tenantBId,
    name: 'Tenant B',
    slug: 'b',
    brandColor: '#222222',
  });

  const userA = await createUser(db, {
    id: userAId,
    email: 'usera@isolation.test',
    name: 'User A',
    primaryWorkspaceId: tenantAId,
  });
  const userB = await createUser(db, {
    id: userBId,
    email: 'userb@isolation.test',
    name: 'User B',
    primaryWorkspaceId: tenantBId,
  });
  const multiUser = await createUser(db, {
    id: multiId,
    email: 'multi@isolation.test',
    name: 'Multi User',
    primaryWorkspaceId: tenantAId,
  });

  const platformPassword = await bcrypt.hash(PASSWORD, 4);
  await db
    .insertInto('platform_users')
    .values({
      id: platformId,
      email: 'platform@isolation.test',
      name: 'Platform Admin',
      password_hash: platformPassword,
      status: 'active',
    })
    .execute();

  await db
    .insertInto('tenant_memberships')
    .values([
      { tenant_id: tenantAId, user_id: userAId, status: 'active', is_owner: true, joined_at: new Date() },
      { tenant_id: tenantBId, user_id: userBId, status: 'active', is_owner: true, joined_at: new Date() },
      { tenant_id: tenantAId, user_id: multiId, status: 'active', is_owner: false, joined_at: new Date() },
      { tenant_id: tenantBId, user_id: multiId, status: 'active', is_owner: false, joined_at: new Date() },
    ])
    .execute();

  await assignRole(db, tenantAId, userAId, rolesA.adminRoleId);
  await assignRole(db, tenantBId, userBId, rolesB.adminRoleId);
  await assignRole(db, tenantAId, multiId, rolesA.adminRoleId);
  await assignRole(db, tenantBId, multiId, rolesB.adminRoleId);

  const companyAId = randomUUID();
  const companyBId = randomUUID();
  await db
    .insertInto('companies')
    .values([
      { id: companyAId, workspace_id: tenantAId, name: 'Company A' },
      { id: companyBId, workspace_id: tenantBId, name: 'Company B' },
    ])
    .execute();

  const contactAId = randomUUID();
  const contactBId = randomUUID();
  await db
    .insertInto('contacts')
    .values([
      {
        id: contactAId,
        workspace_id: tenantAId,
        owner_id: userAId,
        company_id: companyAId,
        name: 'Contact A',
        email: 'contact-a@isolation.test',
        status: 'prospect',
      },
      {
        id: contactBId,
        workspace_id: tenantBId,
        owner_id: userBId,
        company_id: companyBId,
        name: 'Contact B Secret',
        email: 'contact-b-secret@isolation.test',
        status: 'customer',
        phone: '9999999999',
      },
    ])
    .execute();

  const tagAId = randomUUID();
  const tagBId = randomUUID();
  await db
    .insertInto('contact_tags')
    .values([
      { id: tagAId, workspace_id: tenantAId, name: 'tag-a', color: '#aaa' },
      { id: tagBId, workspace_id: tenantBId, name: 'tag-b', color: '#bbb' },
    ])
    .execute();

  const pipelineAId = randomUUID();
  const pipelineBId = randomUUID();
  await db
    .insertInto('pipelines')
    .values([
      { id: pipelineAId, workspace_id: tenantAId, name: 'Pipeline A' },
      { id: pipelineBId, workspace_id: tenantBId, name: 'Pipeline B' },
    ])
    .execute();

  const stageAId = randomUUID();
  const stageBId = randomUUID();
  await db
    .insertInto('pipeline_stages')
    .values([
      { id: stageAId, pipeline_id: pipelineAId, name: 'Stage A', position: 0 },
      { id: stageBId, pipeline_id: pipelineBId, name: 'Stage B', position: 0 },
    ])
    .execute();

  const itemAId = randomUUID();
  const itemBId = randomUUID();
  await db
    .insertInto('pipeline_items')
    .values([
      {
        id: itemAId,
        workspace_id: tenantAId,
        pipeline_id: pipelineAId,
        stage_id: stageAId,
        field_values: { title: 'Item A', name: 'Item A', value: '1000', owner_id: userAId },
      },
      {
        id: itemBId,
        workspace_id: tenantBId,
        pipeline_id: pipelineBId,
        stage_id: stageBId,
        field_values: { title: 'Item B Secret', name: 'Item B Secret', value: '9999', owner_id: userBId },
      },
    ])
    .execute();

  await db
    .insertInto('deals')
    .values([
      {
        id: itemAId,
        workspace_id: tenantAId,
        pipeline_id: pipelineAId,
        stage_id: stageAId,
        name: 'Item A',
        owner_id: userAId,
        amount: '1000.00',
        currency: 'INR',
        probability: 0,
        status: 'open',
        custom_fields: {},
        source_pipeline_item_id: itemAId,
        primary_contact_id: contactAId,
        company_id: companyAId,
      },
      {
        id: itemBId,
        workspace_id: tenantBId,
        pipeline_id: pipelineBId,
        stage_id: stageBId,
        name: 'Item B Secret',
        owner_id: userBId,
        amount: '9999.00',
        currency: 'USD',
        probability: 0,
        status: 'open',
        custom_fields: {},
        source_pipeline_item_id: itemBId,
        primary_contact_id: contactBId,
        company_id: companyBId,
      },
    ])
    .execute();

  const taskAId = randomUUID();
  const taskBId = randomUUID();
  await db
    .insertInto('tasks')
    .values([
      {
        id: taskAId,
        workspace_id: tenantAId,
        assignee_id: userAId,
        title: 'Task A',
        status: 'todo',
      },
      {
        id: taskBId,
        workspace_id: tenantBId,
        assignee_id: userBId,
        title: 'Task B Secret',
        status: 'todo',
      },
    ])
    .execute();

  const activityAId = randomUUID();
  const activityBId = randomUUID();
  await db
    .insertInto('activities')
    .values([
      {
        id: activityAId,
        workspace_id: tenantAId,
        user_id: userAId,
        contact_id: contactAId,
        type: 'note',
        body: 'Activity A',
      },
      {
        id: activityBId,
        workspace_id: tenantBId,
        user_id: userBId,
        contact_id: contactBId,
        type: 'note',
        body: 'Activity B Secret',
      },
    ])
    .execute();

  const projectAId = randomUUID();
  const projectBId = randomUUID();
  await db
    .insertInto('projects')
    .values([
      {
        id: projectAId,
        workspace_id: tenantAId,
        created_by: userAId,
        name: 'Project A',
        contact_id: contactAId,
        company_id: companyAId,
      },
      {
        id: projectBId,
        workspace_id: tenantBId,
        created_by: userBId,
        name: 'Project B Secret',
        contact_id: contactBId,
        company_id: companyBId,
      },
    ])
    .execute();

  const channelAId = randomUUID();
  const channelBId = randomUUID();
  await db
    .insertInto('channels')
    .values([
      {
        id: channelAId,
        workspace_id: tenantAId,
        name: 'channel-a',
        type: 'channel',
        created_by: userAId,
      },
      {
        id: channelBId,
        workspace_id: tenantBId,
        name: 'channel-b-secret',
        type: 'channel',
        created_by: userBId,
      },
    ])
    .execute();

  await db
    .insertInto('channel_members')
    .values([
      { channel_id: channelAId, user_id: userAId, role: 'owner' },
      { channel_id: channelAId, user_id: multiId, role: 'member' },
      { channel_id: channelBId, user_id: userBId, role: 'owner' },
      { channel_id: channelBId, user_id: multiId, role: 'member' },
    ])
    .execute();

  const messageAId = randomUUID();
  const messageBId = randomUUID();
  await db
    .insertInto('messages')
    .values([
      {
        id: messageAId,
        channel_id: channelAId,
        workspace_id: tenantAId,
        user_id: userAId,
        body: 'Message A',
      },
      {
        id: messageBId,
        channel_id: channelBId,
        workspace_id: tenantBId,
        user_id: userBId,
        body: 'Message B Secret Payload',
      },
    ])
    .execute();

  const notifAId = randomUUID();
  const notifBId = randomUUID();
  await db
    .insertInto('notifications')
    .values([
      {
        id: notifAId,
        workspace_id: tenantAId,
        user_id: userAId,
        type: 'test',
        title: 'Notif A',
        body: 'Notification A body',
      },
      {
        id: notifBId,
        workspace_id: tenantBId,
        user_id: userBId,
        type: 'test',
        title: 'Notif B Secret',
        body: 'Notification B Secret body',
      },
    ])
    .execute();

  const rawA = rawApiKey('a');
  const rawB = rawApiKey('b');
  const apiKeyAId = randomUUID();
  const apiKeyBId = randomUUID();
  await db
    .insertInto('api_keys')
    .values([
      {
        id: apiKeyAId,
        workspace_id: tenantAId,
        name: 'Key A',
        prefix: rawA.slice(0, 12),
        key_hash: createHash('sha256').update(rawA).digest('hex'),
        scope: 'read_write',
      },
      {
        id: apiKeyBId,
        workspace_id: tenantBId,
        name: 'Key B Secret',
        prefix: rawB.slice(0, 12),
        key_hash: createHash('sha256').update(rawB).digest('hex'),
        scope: 'read_write',
      },
    ])
    .execute();

  const webhookAId = randomUUID();
  const webhookBId = randomUUID();
  const secretA = 'webhook-secret-a';
  const secretB = 'webhook-secret-b-never-leak';
  await db
    .insertInto('webhook_subscriptions')
    .values([
      {
        id: webhookAId,
        workspace_id: tenantAId,
        target_url: 'https://example.com/a',
        event: 'contact.created',
        secret: secretA,
      },
      {
        id: webhookBId,
        workspace_id: tenantBId,
        target_url: 'https://example.com/b',
        event: 'contact.created',
        secret: secretB,
      },
    ])
    .execute();

  const deliveryAId = randomUUID();
  const deliveryBId = randomUUID();
  await db
    .insertInto('webhook_deliveries')
    .values([
      {
        id: deliveryAId,
        subscription_id: webhookAId,
        event: 'contact.created',
        payload: { tenant: 'a' },
        status: 'pending',
      },
      {
        id: deliveryBId,
        subscription_id: webhookBId,
        event: 'contact.created',
        payload: { tenant: 'b', secret: 'delivery-b-payload' },
        status: 'pending',
      },
    ])
    .execute();

  const outboxAId = randomUUID();
  const outboxBId = randomUUID();
  await db
    .insertInto('outbox_events')
    .values([
      {
        id: outboxAId,
        tenant_id: tenantAId,
        event_type: 'crm.contact.created',
        aggregate_type: 'contact',
        aggregate_id: contactAId,
        payload: { secret: false },
        status: 'pending',
      },
      {
        id: outboxBId,
        tenant_id: tenantBId,
        event_type: 'crm.contact.created',
        aggregate_type: 'contact',
        aggregate_id: contactBId,
        payload: { secret: 'tenant-b-only' },
        status: 'pending',
      },
    ])
    .execute();

  const auditAId = randomUUID();
  const auditBId = randomUUID();
  await db
    .insertInto('security_audit_events')
    .values([
      {
        id: auditAId,
        tenant_id: tenantAId,
        actor_type: 'user',
        actor_id: userAId,
        action: 'fixture.seed',
        meta: { tenant: 'a' },
      },
      {
        id: auditBId,
        tenant_id: tenantBId,
        actor_type: 'user',
        actor_id: userBId,
        action: 'fixture.seed',
        meta: { tenant: 'b', secret: 'audit-b-secret' },
      },
    ])
    .execute();

  const serverAId = randomUUID();
  const serverBId = randomUUID();
  await db
    .insertInto('servers')
    .values([
      {
        id: serverAId,
        workspace_id: tenantAId,
        name: 'Server A',
        agent_token_hash: 'agent-hash-a',
      },
      {
        id: serverBId,
        workspace_id: tenantBId,
        name: 'Server B Secret',
        agent_token_hash: 'agent-hash-b',
      },
    ])
    .execute();

  const fileKeyA = tenantObjectKey(tenantAId, 'messaging', 'fixture-a.txt');
  const fileKeyB = tenantObjectKey(tenantBId, 'messaging', 'fixture-b-secret.txt');
  const legacyFileKeyA = `${legacyMessagingKeyPrefix(tenantAId)}legacy-a.txt`;
  const legacyFileKeyB = `${legacyMessagingKeyPrefix(tenantBId)}legacy-b-secret.txt`;

  // platform JWT minted by tests via signPlatformToken
  return {
    tenantA: { id: tenantAId, slug: 'a', host: 'a.thinkaiq.com' },
    tenantB: { id: tenantBId, slug: 'b', host: 'b.thinkaiq.com' },
    userA,
    userB,
    multiUser,
    platformUser: { id: platformId, email: 'platform@isolation.test', rawToken: '' },
    contactA: { id: contactAId, email: 'contact-a@isolation.test', name: 'Contact A' },
    contactB: { id: contactBId, email: 'contact-b-secret@isolation.test', name: 'Contact B Secret' },
    companyA: { id: companyAId, name: 'Company A' },
    companyB: { id: companyBId, name: 'Company B' },
    pipelineA: { id: pipelineAId },
    pipelineB: { id: pipelineBId },
    stageA: { id: stageAId },
    stageB: { id: stageBId },
    itemA: { id: itemAId },
    itemB: { id: itemBId },
    taskA: { id: taskAId },
    taskB: { id: taskBId },
    activityA: { id: activityAId },
    activityB: { id: activityBId },
    tagA: { id: tagAId },
    tagB: { id: tagBId },
    projectA: { id: projectAId, name: 'Project A' },
    projectB: { id: projectBId, name: 'Project B Secret' },
    channelA: { id: channelAId, name: 'channel-a' },
    channelB: { id: channelBId, name: 'channel-b-secret' },
    messageA: { id: messageAId },
    messageB: { id: messageBId },
    notificationA: { id: notifAId },
    notificationB: { id: notifBId },
    apiKeyA: { id: apiKeyAId, raw: rawA },
    apiKeyB: { id: apiKeyBId, raw: rawB },
    webhookA: { id: webhookAId, secret: secretA },
    webhookB: { id: webhookBId, secret: secretB },
    deliveryA: { id: deliveryAId },
    deliveryB: { id: deliveryBId },
    outboxA: { id: outboxAId },
    outboxB: { id: outboxBId },
    auditA: { id: auditAId },
    auditB: { id: auditBId },
    serverA: { id: serverAId, name: 'Server A' },
    serverB: { id: serverBId, name: 'Server B Secret' },
    fileKeyA,
    fileKeyB,
    legacyFileKeyA,
    legacyFileKeyB,
  };
}

export const SECRETS_B = [
  'Contact B Secret',
  'contact-b-secret@isolation.test',
  '9999999999',
  'Company B',
  'tenant-b-only',
  'Item B Secret',
  'Task B Secret',
  'Activity B Secret',
  'Project B Secret',
  'channel-b-secret',
  'Message B Secret Payload',
  'Notif B Secret',
  'webhook-secret-b-never-leak',
  'delivery-b-payload',
  'audit-b-secret',
  'Server B Secret',
  'brand-b-secret',
];
