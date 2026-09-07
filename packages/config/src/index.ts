import { z } from 'zod';

// Runtime config (vantage.config.json)
export { readConfig, _resetConfig } from './read-config';
export { readConfigFromDb } from './read-config-from-db';
export type { VantageConfig, VantageConfig as VencoreConfig, DbSeedConfig, SmtpConfig } from './config-schema';
export { configSchema, smtpSchema } from './config-schema';
export { appearanceSchema, type Appearance } from './config-schema';

// Visual customization — brand seed color → theme palette
export { generateTheme } from './palette';
export { PRESETS, getPreset, type Preset } from './presets';

// Canonical ThinkAIQ platform identity (defaults; tenant WL is separate)
export {
  PLATFORM_IDENTITY,
  LEGACY_PLATFORM_PRODUCT_NAMES,
  LEGACY_DEFAULT_LOGO_URLS,
  resolvePlatformProductName,
  resolvePlatformLogoUrl,
  resolvePlatformFaviconUrl,
  resolvePlatformLogoMarkForChrome,
  formatProductPageTitle,
} from './platform-identity';

// API env (process.env — only DB + secrets, no Clerk/Stripe)
export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string(),
  CRON_SECRET: z.string(),
  SSH_ENCRYPTION_KEY: z.string().min(64, 'SSH_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)'),
  PORT: z.coerce.number().default(3001),
  // Mail — optional; app boots without them, mail routes throw at runtime if unset
  APP_URL: z.string().default('http://localhost:3000'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  MAIL_ENCRYPTION_KEY: z.string().length(64).optional(),
  GMAIL_PUBSUB_TOKEN: z.string().optional(),
  GOOGLE_PUBSUB_TOPIC: z.string().optional(),
  // R2 / S3-compatible storage — optional; upload routes throw at runtime if unset
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  // Redis — optional for messaging; required when JOBS_RUNTIME=bullmq (worker)
  REDIS_URL: z.string().optional(),
  /** Target: bullmq. Temporary migration escape hatch: legacy interval pollers. */
  JOBS_RUNTIME: z.enum(['bullmq', 'legacy']).default('bullmq'),
  // Updater sidecar — optional; update routes return 503 when unset
  UPDATER_URL: z.string().default('http://updater:9500'),
  UPDATER_SECRET: z.string().optional(),
});

// Web env
export const webEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string(),
  NEXT_PUBLIC_API_URL: z.string(),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WebEnv = z.infer<typeof webEnvSchema>;
