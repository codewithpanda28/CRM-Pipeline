/**
 * TOTP MFA for workspace users (and reusable helpers for platform users).
 * Secret encrypted with AES-256-GCM using MFA_SECRET or JWT_SECRET.
 * Recovery codes stored as bcrypt hashes in mfa_recovery_codes_hash JSONB.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcrypt';
import { TOTP, Secret } from 'otpauth';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { RequestHandler } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth';

const ALGO = 'aes-256-gcm';
const RECOVERY_COUNT = 8;

function mfaKey(): Buffer {
  const raw = process.env['MFA_SECRET'] || process.env['JWT_SECRET'];
  if (!raw || raw.length < 16) {
    throw new Error('MFA_SECRET or JWT_SECRET (min 16 chars) required for MFA');
  }
  return createHash('sha256').update(raw).digest();
}

export function encryptMfaSecret(plaintext: string): string {
  const key = mfaKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
}

export function decryptMfaSecret(payload: string): string {
  const [ver, ivB64, tagB64, dataB64] = payload.split(':');
  if (ver !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid MFA secret payload');
  }
  const key = mfaKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

function makeTotp(secretBase32: string, label: string): TOTP {
  return new TOTP({
    issuer: process.env['MFA_ISSUER'] || 'ThinkAIQ CRM',
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
}

function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_COUNT; i++) {
    codes.push(`${randomInt(10000000, 99999999)}`);
  }
  return codes;
}

async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
}

export interface MfaEnrollResult {
  secret: string;
  otpauthUrl: string;
  recoveryCodes: string[];
}

/** Start enrollment — stores encrypted secret but leaves mfa_enabled=false until verify. */
export async function enrollMfa(
  db: Kysely<Database>,
  opts: {
    userId: string;
    workspaceId: string;
    email: string;
    /** Required when MFA is already enabled — prove possession before rotating secret. */
    currentToken?: string;
  },
): Promise<MfaEnrollResult> {
  const existing = await db
    .selectFrom('users')
    .select(['mfa_enabled'])
    .where('id', '=', opts.userId)
    .where('workspace_id', '=', opts.workspaceId)
    .executeTakeFirst();

  if (existing?.mfa_enabled) {
    if (!opts.currentToken) {
      throw new Error('MFA_ALREADY_ENABLED');
    }
    const ok = await verifyMfaToken(db, {
      userId: opts.userId,
      workspaceId: opts.workspaceId,
      token: opts.currentToken,
    });
    if (!ok) throw new Error('MFA_INVALID');
  }

  const secret = new Secret({ size: 20 });
  const totp = makeTotp(secret.base32, opts.email);
  const recoveryCodes = generateRecoveryCodes();
  const hashes = await hashRecoveryCodes(recoveryCodes);

  await db
    .updateTable('users')
    .set({
      mfa_secret_encrypted: encryptMfaSecret(secret.base32),
      mfa_recovery_codes_hash: hashes,
      mfa_enabled: false,
      mfa_enrolled_at: null,
    })
    .where('id', '=', opts.userId)
    .where('workspace_id', '=', opts.workspaceId)
    .execute();

  return {
    secret: secret.base32,
    otpauthUrl: totp.toString(),
    recoveryCodes,
  };
}

export async function verifyMfaEnrollment(
  db: Kysely<Database>,
  opts: { userId: string; workspaceId: string; token: string },
): Promise<boolean> {
  const user = await db
    .selectFrom('users')
    .select(['mfa_secret_encrypted', 'email'])
    .where('id', '=', opts.userId)
    .where('workspace_id', '=', opts.workspaceId)
    .executeTakeFirst();

  if (!user?.mfa_secret_encrypted) return false;
  const secret = decryptMfaSecret(user.mfa_secret_encrypted);
  const totp = makeTotp(secret, user.email);
  const delta = totp.validate({ token: opts.token.replace(/\s/g, ''), window: 1 });
  if (delta === null) return false;

  await db
    .updateTable('users')
    .set({
      mfa_enabled: true,
      mfa_enrolled_at: new Date(),
    })
    .where('id', '=', opts.userId)
    .where('workspace_id', '=', opts.workspaceId)
    .execute();

  return true;
}

export async function verifyMfaToken(
  db: Kysely<Database>,
  opts: { userId: string; workspaceId: string; token: string },
): Promise<boolean> {
  const user = await db
    .selectFrom('users')
    .select(['mfa_secret_encrypted', 'mfa_recovery_codes_hash', 'mfa_enabled', 'email'])
    .where('id', '=', opts.userId)
    .where('workspace_id', '=', opts.workspaceId)
    .executeTakeFirst();

  if (!user?.mfa_enabled || !user.mfa_secret_encrypted) return false;

  const cleaned = opts.token.replace(/\s/g, '');
  const secret = decryptMfaSecret(user.mfa_secret_encrypted);
  const totp = makeTotp(secret, user.email);
  if (totp.validate({ token: cleaned, window: 1 }) !== null) return true;

  // Recovery code path
  const hashes = Array.isArray(user.mfa_recovery_codes_hash)
    ? (user.mfa_recovery_codes_hash as string[])
    : [];
  for (let i = 0; i < hashes.length; i++) {
    const ok = await bcrypt.compare(cleaned, hashes[i]!);
    if (ok) {
      const next = [...hashes];
      next.splice(i, 1);
      await db
        .updateTable('users')
        .set({ mfa_recovery_codes_hash: next })
        .where('id', '=', opts.userId)
        .execute();
      return true;
    }
  }
  return false;
}

export async function disableMfa(
  db: Kysely<Database>,
  opts: { userId: string; workspaceId: string; token: string },
): Promise<boolean> {
  const ok = await verifyMfaToken(db, opts);
  if (!ok) return false;
  await db
    .updateTable('users')
    .set({
      mfa_enabled: false,
      mfa_secret_encrypted: null,
      mfa_recovery_codes_hash: [],
      mfa_enrolled_at: null,
    })
    .where('id', '=', opts.userId)
    .where('workspace_id', '=', opts.workspaceId)
    .execute();
  return true;
}

/**
 * Middleware: if user.mfa_enabled, require X-MFA-Token (or body.mfa_token) verified.
 * Use on privileged routes (admin settings, export, finance void, etc.).
 */
export function requireMfaForPrivileged(db: Kysely<Database>): RequestHandler {
  return async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const user = auth.user;
      if (!user?.mfa_enabled) {
        next();
        return;
      }
      const token =
        (typeof req.headers['x-mfa-token'] === 'string' && req.headers['x-mfa-token']) ||
        (typeof req.body?.mfa_token === 'string' && req.body.mfa_token) ||
        '';
      if (!token) {
        res.status(403).json({
          data: null,
          error: { code: 'MFA_REQUIRED', message: 'MFA token required for this action' },
        });
        return;
      }
      const ok = await verifyMfaToken(db, {
        userId: user.id,
        workspaceId: auth.workspace.id,
        token,
      });
      if (!ok) {
        res.status(403).json({
          data: null,
          error: { code: 'MFA_INVALID', message: 'Invalid MFA token' },
        });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
