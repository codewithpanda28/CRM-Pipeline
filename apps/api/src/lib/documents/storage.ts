/**
 * Tenant-scoped document artifact storage.
 * Key layout: tenants/{workspaceId}/documents/{yyyy}/{mm}/{artifactId}.pdf
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PutObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { tenantObjectKey } from '@vencore/tenancy';

export function documentStorageKey(
  workspaceId: string,
  artifactId: string,
  at: Date = new Date(),
): string {
  const yyyy = String(at.getUTCFullYear());
  const mm = String(at.getUTCMonth() + 1).padStart(2, '0');
  return tenantObjectKey(workspaceId, 'documents', yyyy, mm, `${artifactId}.pdf`);
}

function r2Configured(): boolean {
  return Boolean(
    process.env['R2_ACCOUNT_ID'] &&
      process.env['R2_ACCESS_KEY_ID'] &&
      process.env['R2_SECRET_ACCESS_KEY'] &&
      process.env['R2_BUCKET_NAME'],
  );
}

function getR2Client(): S3Client {
  const accountId = process.env['R2_ACCOUNT_ID']!;
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env['R2_ACCESS_KEY_ID']!,
      secretAccessKey: process.env['R2_SECRET_ACCESS_KEY']!,
    },
  });
}

function localRoot(): string {
  return path.join(process.cwd(), 'storage');
}

export async function putDocumentBytes(
  storageKey: string,
  bytes: Buffer,
  contentType = 'application/pdf',
): Promise<{ sha256: string; byteSize: number }> {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (r2Configured()) {
    const client = getR2Client();
    await client.send(
      new PutObjectCommand({
        Bucket: process.env['R2_BUCKET_NAME']!,
        Key: storageKey,
        Body: bytes,
        ContentType: contentType,
        ContentLength: bytes.byteLength,
      }),
    );
  } else {
    const full = path.join(localRoot(), storageKey);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
  }
  return { sha256, byteSize: bytes.byteLength };
}

export async function getDocumentBytes(storageKey: string): Promise<Buffer> {
  if (r2Configured()) {
    const client = getR2Client();
    const out = await client.send(
      new GetObjectCommand({
        Bucket: process.env['R2_BUCKET_NAME']!,
        Key: storageKey,
      }),
    );
    const body = out.Body;
    if (!body) throw new Error('Empty object body');
    const arr = await body.transformToByteArray();
    return Buffer.from(arr);
  }
  const full = path.join(localRoot(), storageKey);
  return readFile(full);
}

/** Verify download key belongs to the requesting workspace (tenant isolation). */
export function assertDocumentKeyForWorkspace(storageKey: string, workspaceId: string): void {
  const expectedPrefix = `tenants/${workspaceId}/documents/`;
  if (!storageKey.startsWith(expectedPrefix)) {
    throw new Error('DOCUMENT_WORKSPACE_MISMATCH');
  }
}
