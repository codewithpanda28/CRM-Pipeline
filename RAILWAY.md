# Railway deploy — READ THIS

## Live status (set via CLI)

Project `calm-purpose` / service **CRM-Pipeline** should be **Online** when:

| Setting | Value |
|---------|--------|
| Root Directory | **EMPTY** (repo root) |
| Builder | **Dockerfile** |
| Dockerfile path | `Dockerfile` |
| Start | `node apps/api/dist/index.js` (or Dockerfile `CMD`) |

Public API (example): `https://crm-pipeline-production-8dea.up.railway.app`

## Required Variables (API service)

Do **not** paste Suggested Variables from `.env.example` (those use `localhost` and will crash).

| Variable | Correct source |
|----------|----------------|
| `DATABASE_URL` | Reference → **Postgres** → `DATABASE_URL` (`*.railway.internal`) |
| `REDIS_URL` | Reference → **Redis** → `REDIS_URL` |
| `JWT_SECRET` | 64-char hex (`openssl rand -hex 32`) |
| `CRON_SECRET` | 64-char hex |
| `SSH_ENCRYPTION_KEY` | 64-char hex |
| `NODE_ENV` | `production` |
| `APP_URL` | Public Railway / custom domain |
| `JOBS_RUNTIME` | `bullmq` (with Redis) |

CLI (already used for this project):

```bash
railway service CRM-Pipeline
railway variable set \
  "DATABASE_URL=${{Postgres.DATABASE_URL}}" \
  "REDIS_URL=${{Redis.REDIS_URL}}" \
  "NODE_ENV=production" \
  "JWT_SECRET=..." \
  "CRON_SECRET=..." \
  "SSH_ENCRYPTION_KEY=..." \
  "JOBS_RUNTIME=bullmq"
railway redeploy --yes
railway domain   # creates *.up.railway.app if missing
```

## Why errors came in layers

1. Railpack + npm → monorepo needs Dockerfile + pnpm  
2. Packages pointed at `src/` → must use `dist/`  
3. Empty Variables → Zod required secrets / DB URL  

Each fix unlocks the next boot stage. Suggested localhost vars are wrong for Railway.

## Optional: GHCR image

`ghcr.io/codewithpanda28/crm-api:latest` can be used instead of building from Git.
