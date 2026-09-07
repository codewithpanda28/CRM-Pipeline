/**
 * Document artifact lifecycle — enqueue render via outbox (never BullMQ from domain).
 * Worker (parent-wired) should call render path with @vencore/documents.
 */
import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { EventRecorder, type DbOrTx } from '@vencore/events';
import { createDocumentRenderer } from '@vencore/documents';
import { logger } from '../logger';
import { buildDocumentSnapshot, type SnapshotSourceType } from './artifacts';
import {
  assertDocumentKeyForWorkspace,
  documentStorageKey,
  getDocumentBytes,
  putDocumentBytes,
} from './storage';

export { buildDocumentSnapshot, type SnapshotSourceType } from './artifacts';
export {
  assertDocumentKeyForWorkspace,
  documentStorageKey,
  getDocumentBytes,
  putDocumentBytes,
} from './storage';

export interface CreateArtifactInput {
  workspaceId: string;
  sourceType: SnapshotSourceType;
  sourceId: string;
  createdBy?: string | null;
  /** Override idempotency; default workspace:sourceType:sourceId:v{n} */
  renderIdempotencyKey?: string;
  templateVersion?: number;
}

export async function createArtifact(db: DbOrTx, input: CreateArtifactInput) {
  const snap = await buildDocumentSnapshot(db, {
    workspaceId: input.workspaceId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });

  const idempotencyKey =
    input.renderIdempotencyKey ??
    `${input.workspaceId}:${input.sourceType}:${input.sourceId}:v${input.templateVersion ?? 1}`;

  const existing = await db
    .selectFrom('document_artifacts')
    .selectAll()
    .where('workspace_id', '=', input.workspaceId)
    .where('render_idempotency_key', '=', idempotencyKey)
    .executeTakeFirst();

  if (existing) {
    return { artifact: existing, created: false };
  }

  const id = randomUUID();
  const row = await db
    .insertInto('document_artifacts')
    .values({
      id,
      workspace_id: input.workspaceId,
      doc_type: snap.docType,
      source_type: input.sourceType,
      source_id: input.sourceId,
      template_id: null,
      template_version: input.templateVersion ?? 1,
      status: 'pending',
      branding_snapshot: snap.brandingSnapshot,
      snapshot_payload: snap.snapshotPayload,
      render_idempotency_key: idempotencyKey,
      created_by: input.createdBy ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return { artifact: row, created: true };
}

export async function getArtifact(
  db: DbOrTx,
  opts: { workspaceId: string; artifactId: string },
) {
  return db
    .selectFrom('document_artifacts')
    .selectAll()
    .where('workspace_id', '=', opts.workspaceId)
    .where('id', '=', opts.artifactId)
    .executeTakeFirst();
}

export async function listArtifactsForSource(
  db: DbOrTx,
  opts: { workspaceId: string; sourceType: string; sourceId: string },
) {
  return db
    .selectFrom('document_artifacts')
    .selectAll()
    .where('workspace_id', '=', opts.workspaceId)
    .where('source_type', '=', opts.sourceType)
    .where('source_id', '=', opts.sourceId)
    .orderBy('created_at', 'desc')
    .execute();
}

/**
 * Create (or reuse) artifact + append outbox job `document.render` with dedupe key.
 */
export async function enqueueRender(
  db: DbOrTx,
  input: CreateArtifactInput,
): Promise<{ artifactId: string; outboxId: string | null; deduped: boolean }> {
  const { artifact, created } = await createArtifact(db, input);
  const dedupeKey = `document.render:${artifact.workspace_id}:${artifact.id}`;

  const recorder = new EventRecorder(db);
  const result = await recorder.append({
    tenantId: input.workspaceId,
    eventType: 'document.render.requested',
    aggregateType: 'document_artifact',
    aggregateId: artifact.id,
    jobName: 'document.render',
    dedupeKey,
    correlationId: artifact.id,
    payload: {
      id: dedupeKey,
      type: 'document.render.requested',
      spec_version: '1',
      occurred_at: new Date().toISOString(),
      tenant_id: input.workspaceId,
      actor: { type: 'user', id: input.createdBy ?? 'system' },
      aggregate: { type: 'document_artifact', id: artifact.id },
      data: {
        workspace_id: input.workspaceId,
        artifact_id: artifact.id,
        source_type: artifact.source_type,
        source_id: artifact.source_id,
        doc_type: artifact.doc_type,
        idempotency_key: dedupeKey,
      },
      metadata: {
        correlation_id: artifact.id,
        idempotency_key: dedupeKey,
      },
    },
  });

  logger.info(
    {
      workspaceId: input.workspaceId,
      artifactId: artifact.id,
      created,
      outboxDeduped: result.deduped,
    },
    'document.render outbox appended',
  );

  return {
    artifactId: artifact.id,
    outboxId: result.id,
    deduped: result.deduped && !created,
  };
}

/**
 * Synchronous render helper for worker / local tests.
 * Marks artifact ready and stores PDF under tenants/.../documents/...
 */
export async function renderArtifactNow(
  db: Kysely<Database>,
  opts: { workspaceId: string; artifactId: string },
): Promise<{ storageKey: string; placeholder: boolean }> {
  const artifact = await getArtifact(db, opts);
  if (!artifact) throw new Error('ARTIFACT_NOT_FOUND');
  if (artifact.workspace_id !== opts.workspaceId) throw new Error('DOCUMENT_WORKSPACE_MISMATCH');

  await db
    .updateTable('document_artifacts')
    .set({ status: 'rendering', updated_at: new Date(), error_message: null })
    .where('id', '=', artifact.id)
    .where('workspace_id', '=', opts.workspaceId)
    .execute();

  try {
    const payload = artifact.snapshot_payload as { context?: import('@vencore/documents').DocumentRenderContext };
    let context = payload?.context;
    if (!context) {
      const rebuilt = await buildDocumentSnapshot(db, {
        workspaceId: opts.workspaceId,
        sourceType: artifact.source_type as SnapshotSourceType,
        sourceId: artifact.source_id,
      });
      context = rebuilt.context;
    }

    const renderer = createDocumentRenderer();
    const html = renderer.renderHtml(context);
    const pdf = await renderer.renderPdf(html);
    const storageKey = documentStorageKey(opts.workspaceId, artifact.id);
    const { sha256, byteSize } = await putDocumentBytes(storageKey, pdf.buffer);

    await db
      .updateTable('document_artifacts')
      .set({
        status: 'ready',
        storage_key: storageKey,
        sha256,
        byte_size: byteSize,
        page_count: pdf.pageCount,
        mime_type: 'application/pdf',
        ready_at: new Date(),
        updated_at: new Date(),
        error_message: pdf.placeholder ? 'placeholder_pdf_no_playwright' : null,
      })
      .where('id', '=', artifact.id)
      .where('workspace_id', '=', opts.workspaceId)
      .execute();

    return { storageKey, placeholder: pdf.placeholder };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .updateTable('document_artifacts')
      .set({
        status: 'failed',
        error_message: msg.slice(0, 2000),
        updated_at: new Date(),
      })
      .where('id', '=', artifact.id)
      .where('workspace_id', '=', opts.workspaceId)
      .execute();
    throw err;
  }
}

/** Secure download: workspace_id must match artifact + storage key prefix. */
export async function downloadArtifact(
  db: DbOrTx,
  opts: { workspaceId: string; artifactId: string },
): Promise<{ bytes: Buffer; mimeType: string; filename: string }> {
  const artifact = await getArtifact(db, opts);
  if (!artifact) throw new Error('ARTIFACT_NOT_FOUND');
  if (artifact.workspace_id !== opts.workspaceId) throw new Error('DOCUMENT_WORKSPACE_MISMATCH');
  if (artifact.status !== 'ready' || !artifact.storage_key) {
    throw new Error('ARTIFACT_NOT_READY');
  }
  assertDocumentKeyForWorkspace(artifact.storage_key, opts.workspaceId);
  const bytes = await getDocumentBytes(artifact.storage_key);
  return {
    bytes,
    mimeType: artifact.mime_type || 'application/pdf',
    filename: `${artifact.doc_type}-${artifact.id}.pdf`,
  };
}
