/**
 * document.render outbox consumer — uses API document lib (Playwright/placeholder).
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { renderArtifactNow } from '../lib/documents';
import { logger } from '../lib/logger';

export async function runDocumentRenderJob(
  db: Kysely<Database>,
  payload: Record<string, unknown>,
  tenantId: string | null,
): Promise<void> {
  const data =
    payload['data'] && typeof payload['data'] === 'object'
      ? (payload['data'] as Record<string, unknown>)
      : payload;
  const workspaceId = String(data['workspace_id'] ?? tenantId ?? '');
  const artifactId = String(data['artifact_id'] ?? payload['aggregateId'] ?? '');
  if (!workspaceId || !artifactId) {
    throw new Error('document.render missing workspaceId or artifactId');
  }
  const result = await renderArtifactNow(db, { workspaceId, artifactId });
  logger.info(
    { workspaceId, artifactId, placeholder: result.placeholder, storageKey: result.storageKey },
    'document.render completed',
  );
}
